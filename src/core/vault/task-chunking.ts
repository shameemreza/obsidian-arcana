import { App, TFile } from "obsidian";
import type { TaskFrontmatter, TaskStatus, TaskPriority } from "../../types";
import { TASK_STATUSES } from "../../constants";
import { todayISO } from "../../utils/dates";
import { parseTimeEstimate } from "../../utils/frontmatter";
import type { AIEngine } from "../ai/ai-engine";
import type { NoteCreator } from "./note-creator";
import type { TaskScanner, DiscoveredTask } from "./task-scanner";
import type { ArcanaSettings } from "../../settings";

const VALID_STATUSES: ReadonlySet<string> = new Set(TASK_STATUSES);

interface SubtaskSuggestion {
	title: string;
	description?: string;
	time_estimate?: number;
}

/**
 * Uses AI to break a parent task into 3-5 concrete subtasks,
 * creates each as its own task note linked back to the parent,
 * and updates the parent's subtask_progress frontmatter.
 */
export class TaskChunking {
	constructor(
		private app: App,
		private aiEngine: AIEngine,
		private noteCreator: NoteCreator,
		private taskScanner: TaskScanner,
		private getSettings: () => ArcanaSettings,
	) {}

	/**
	 * Return the active file if it is a chunkable task, or null.
	 */
	getActiveChunkableFile(): TFile | null {
		const file = this.app.workspace.getActiveFile();
		if (!file || file.extension !== "md") return null;
		return this.canChunk(file) ? file : null;
	}

	/**
	 * Check whether a file is a valid task note that can be chunked.
	 */
	canChunk(file: TFile): boolean {
		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache?.frontmatter) return false;

		const status = cache.frontmatter.status;
		if (typeof status !== "string" || !VALID_STATUSES.has(status))
			return false;

		if (status === "done" || status === "cancelled") return false;

		return true;
	}

	/**
	 * AI-generate subtask suggestions for a parent task.
	 */
	async generateSubtasks(file: TFile): Promise<SubtaskSuggestion[]> {
		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache?.frontmatter) return [];

		const fm = cache.frontmatter;
		const title = typeof fm.title === "string" ? fm.title : file.basename;
		const content = await this.app.vault.read(file);

		const bodyStart = content.indexOf("---", 3);
		const body = bodyStart >= 0 ? content.slice(bodyStart + 3).trim() : "";

		const prompt = buildChunkingPrompt(title, fm, body);

		const response = await this.aiEngine.chatComplete(
			[{ role: "user", content: prompt, timestamp: Date.now() }],
			{
				systemPrompt:
					"You are a task planning assistant. Break tasks into concrete, actionable subtasks. " +
					"Return ONLY valid JSON, no markdown fences, no commentary.",
				temperature: 0.4,
			},
		);

		return parseSubtaskResponse(response);
	}

	/**
	 * Create subtask notes from suggestions and update the parent.
	 * Subtasks are placed in a subfolder named after the parent task,
	 * making the parent-child relationship visible in the sidebar.
	 */
	async createSubtasks(
		parentFile: TFile,
		subtasks: SubtaskSuggestion[],
	): Promise<TFile[]> {
		const cache = this.app.metadataCache.getFileCache(parentFile);
		if (!cache?.frontmatter) return [];

		const parentFm = cache.frontmatter;

		const lastSlash = parentFile.path.lastIndexOf("/");
		const parentDir = lastSlash > 0
			? parentFile.path.substring(0, lastSlash)
			: this.getSettings().taskFolderPath;
		const subtaskFolder = `${parentDir}/${parentFile.basename}`;

		const parentLink = `[[${parentFile.basename}]]`;

		const inheritedTags = Array.isArray(parentFm.tags)
			? parentFm.tags.filter((t: unknown) => typeof t === "string")
			: [];

		const inheritedContext =
			typeof parentFm.context === "string" ? parentFm.context : undefined;

		const inheritedPriority =
			typeof parentFm.priority === "string"
				? (parentFm.priority as TaskPriority)
				: "medium";

		const inheritedDue =
			typeof parentFm.due === "string" ? parentFm.due : undefined;

		const inheritedScheduled =
			typeof parentFm.scheduled === "string"
				? parentFm.scheduled
				: undefined;

		const createdFiles: TFile[] = [];

		for (const sub of subtasks) {
			const task: TaskFrontmatter = {
				title: sub.title,
				status: "todo" as TaskStatus,
				priority: inheritedPriority,
				created: todayISO(),
				parent_task: parentLink,
				...(inheritedDue ? { due: inheritedDue } : {}),
				...(inheritedScheduled ? { scheduled: inheritedScheduled } : {}),
				...(inheritedTags.length > 0 ? { tags: [...inheritedTags] } : {}),
				...(inheritedContext ? { context: inheritedContext } : {}),
				...(sub.time_estimate != null
					? { time_estimate: sub.time_estimate }
					: {}),
			};

			const body = sub.description
				? `## Details\n\n${sub.description}\n`
				: undefined;

			const file = await this.noteCreator.createTask({
				task,
				body,
				taskFolder: subtaskFolder,
				open: false,
			});

			createdFiles.push(file);
		}

		await this.setParentProgress(parentFile, 0, subtasks.length);

		await this.moveParentIntoFolder(parentFile, subtaskFolder);

		return createdFiles;
	}

	/**
	 * Move the parent task file into the subtask subfolder so that
	 * the parent and its subtasks are visually grouped in the sidebar.
	 * Uses fileManager.renameFile which automatically updates all
	 * internal [[links]] across the vault.
	 */
	private async moveParentIntoFolder(
		parentFile: TFile,
		subtaskFolder: string,
	): Promise<void> {
		const newPath = `${subtaskFolder}/${parentFile.name}`;
		if (parentFile.path === newPath) return;
		try {
			await this.app.fileManager.renameFile(parentFile, newPath);
		} catch {
			// Folder or file conflict -- not critical, leave in place
		}
	}

	/**
	 * Write a specific progress value to the parent frontmatter.
	 * Used after initial subtask creation when the scanner cache
	 * has not yet indexed the new files.
	 */
	async setParentProgress(
		parentFile: TFile,
		done: number,
		total: number,
	): Promise<void> {
		const progress = `${done}/${total}`;
		await this.app.fileManager.processFrontMatter(parentFile, (fm) => {
			fm.subtask_progress = progress;
		});
	}

	/**
	 * Recalculate and write subtask_progress on a parent task
	 * by scanning existing subtasks from the task index.
	 */
	async updateParentProgress(parentFile: TFile): Promise<void> {
		const subtasks = await this.findSubtasks(parentFile);
		if (subtasks.length === 0) return;

		const done = subtasks.filter(
			(t) =>
				t.frontmatter.status === "done" ||
				t.frontmatter.status === "cancelled",
		).length;

		await this.setParentProgress(parentFile, done, subtasks.length);
	}

	/**
	 * Find all subtasks that link back to a given parent task file.
	 */
	async findSubtasks(parentFile: TFile): Promise<DiscoveredTask[]> {
		const allTasks = await this.taskScanner.getAll();
		const parentBasename = parentFile.basename;

		return allTasks.filter((t) => {
			const parentRef = t.frontmatter.parent_task;
			if (!parentRef) return false;
			const cleaned = parentRef.replace(/^\[\[|\]\]$/g, "");
			return cleaned === parentBasename;
		});
	}

	/**
	 * Find the parent task file for a given subtask, if any.
	 * Handles both properly quoted strings and legacy unquoted
	 * [[links]] that YAML may have parsed as nested arrays.
	 */
	findParentFile(file: TFile): TFile | null {
		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache?.frontmatter) return null;

		const parentRef = resolveParentRef(cache.frontmatter.parent_task);
		if (!parentRef) return null;

		const allFiles = this.app.vault.getMarkdownFiles();
		return allFiles.find((f) => f.basename === parentRef) ?? null;
	}
}

/**
 * Extract the parent basename from a parent_task value.
 * Handles both the correct case (quoted string "[[basename]]")
 * and the legacy case (unquoted [[basename]] parsed by YAML as
 * a nested array like [["basename"]]).
 */
function resolveParentRef(raw: unknown): string | null {
	if (typeof raw === "string") {
		return raw.replace(/^\[\[|\]\]$/g, "");
	}
	if (Array.isArray(raw)) {
		const inner = raw.flat(3);
		if (inner.length === 1 && typeof inner[0] === "string") {
			return inner[0];
		}
	}
	return null;
}

function buildChunkingPrompt(
	title: string,
	fm: Record<string, unknown>,
	body: string,
): string {
	const parts = [
		`Break down this task into smaller, concrete, actionable subtasks.`,
		`Decide how many subtasks are truly needed based on complexity. A simple task might need 2-3 subtasks. A moderately complex task might need 4-6. A large or multi-phase task could need 8-12 or more. Do not artificially limit yourself. Create exactly as many subtasks as the task genuinely requires.`,
		``,
		`Task: ${title}`,
	];

	if (typeof fm.context === "string" && fm.context) {
		parts.push(`Context: ${fm.context}`);
	}
	const totalMinutes = parseTimeEstimate(fm.time_estimate);
	if (totalMinutes != null) {
		parts.push(`Estimated total time: ${totalMinutes} minutes. Distribute this across subtasks proportionally.`);
	}
	if (body) {
		parts.push(`Details: ${body.slice(0, 800)}`);
	}

	parts.push(
		``,
		`Return a JSON array. Each object must have:`,
		`- "title": A SHORT action phrase (3-8 words max, like a task name). Do NOT put explanations in the title.`,
		`- "description": A detailed explanation of what to do, including specific steps, references, or tools needed. This is the actionable detail. 2-4 sentences.`,
		`- "time_estimate": Your best estimate in minutes for this specific subtask (number). Base this on the subtask's actual scope, not a default value.`,
		``,
		`IMPORTANT: Titles must be concise task names. All detail goes in the description field. Each subtask's time_estimate should reflect its real complexity.`,
		`Do not include the parent task itself. Do not number the subtasks.`,
		``,
		`Example:`,
		`[{"title": "Draft blog post outline", "description": "Create a structured outline with introduction, 3-4 main sections covering the key points, and a conclusion. Reference the project brief for tone and audience.", "time_estimate": 20}]`,
	);

	return parts.join("\n");
}

function parseSubtaskResponse(raw: string): SubtaskSuggestion[] {
	const cleaned = raw
		.replace(/^```(?:json)?\s*/i, "")
		.replace(/```\s*$/, "")
		.trim();

	try {
		const parsed = JSON.parse(cleaned);
		if (!Array.isArray(parsed)) return [];

		return parsed
			.filter(
				(item: unknown): item is Record<string, unknown> =>
					typeof item === "object" && item !== null && "title" in item,
			)
			.map((item) => ({
				title: String(item.title),
				...(typeof item.description === "string"
					? { description: item.description }
					: {}),
				...(typeof item.time_estimate === "number"
					? { time_estimate: item.time_estimate }
					: {}),
			}))
			.slice(0, 15);
	} catch {
		return [];
	}
}
