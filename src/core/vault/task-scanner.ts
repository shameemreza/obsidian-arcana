import { App, TFile, TFolder, normalizePath } from "obsidian";
import type { TaskFrontmatter, TaskStatus, TaskPriority } from "../../types";
import { TASK_STATUSES, TASK_PRIORITIES } from "../../constants";
import type { ArcanaSettings } from "../../settings";

export interface DiscoveredTask {
	file: TFile;
	frontmatter: TaskFrontmatter;
}

const VALID_STATUSES: ReadonlySet<string> = new Set(TASK_STATUSES);
const VALID_PRIORITIES: ReadonlySet<string> = new Set(TASK_PRIORITIES);

/**
 * Scans the vault for task notes matching Arcana's frontmatter schema.
 *
 * Discovery strategy (additive layers):
 *   1. Always scan the dedicated task folder.
 *   2. Scan any additional folders listed in settings.
 *   3. If vault-wide scanning is enabled, scan every markdown file.
 *
 * A note is considered a task if its frontmatter contains a `status`
 * field whose value is one of the valid TaskStatus values.
 */
export class TaskScanner {
	private cache: DiscoveredTask[] | null = null;

	constructor(
		private app: App,
		private getSettings: () => ArcanaSettings,
	) {}

	invalidate(): void {
		this.cache = null;
	}

	async getAll(): Promise<DiscoveredTask[]> {
		if (this.cache) return this.cache;
		this.cache = await this.scan();
		return this.cache;
	}

	async getByStatus(status: TaskStatus): Promise<DiscoveredTask[]> {
		const all = await this.getAll();
		return all.filter((t) => t.frontmatter.status === status);
	}

	async getOpenTasks(): Promise<DiscoveredTask[]> {
		const all = await this.getAll();
		return all.filter(
			(t) => t.frontmatter.status !== "done" && t.frontmatter.status !== "cancelled",
		);
	}

	async getOverdue(): Promise<DiscoveredTask[]> {
		const today = new Date().toISOString().slice(0, 10);
		const open = await this.getOpenTasks();
		return open.filter((t) => t.frontmatter.due && t.frontmatter.due < today);
	}

	async getDueToday(): Promise<DiscoveredTask[]> {
		const today = new Date().toISOString().slice(0, 10);
		const open = await this.getOpenTasks();
		return open.filter((t) => t.frontmatter.due === today);
	}

	private async scan(): Promise<DiscoveredTask[]> {
		const settings = this.getSettings();
		const seen = new Set<string>();
		const results: DiscoveredTask[] = [];

		const tryAdd = (file: TFile) => {
			if (seen.has(file.path)) return;
			seen.add(file.path);
			const task = this.extractTask(file);
			if (task) results.push(task);
		};

		this.getFilesInFolder(settings.taskFolderPath).forEach(tryAdd);

		for (const folder of settings.additionalTaskFolders) {
			this.getFilesInFolder(folder).forEach(tryAdd);
		}

		if (settings.vaultWideTaskScan) {
			this.app.vault.getMarkdownFiles().forEach(tryAdd);
		}

		return results;
	}

	private getFilesInFolder(folderPath: string): TFile[] {
		const normalized = normalizePath(folderPath);
		const folder = this.app.vault.getAbstractFileByPath(normalized);
		if (!(folder instanceof TFolder)) return [];
		return this.collectMarkdownFiles(folder);
	}

	private collectMarkdownFiles(folder: TFolder): TFile[] {
		const files: TFile[] = [];
		for (const child of folder.children) {
			if (child instanceof TFile && child.extension === "md") {
				files.push(child);
			} else if (child instanceof TFolder) {
				files.push(...this.collectMarkdownFiles(child));
			}
		}
		return files;
	}

	private extractTask(file: TFile): DiscoveredTask | null {
		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache?.frontmatter) return null;

		const fm = cache.frontmatter;
		const status = fm.status;
		if (typeof status !== "string" || !VALID_STATUSES.has(status)) return null;

		const priority = typeof fm.priority === "string" && VALID_PRIORITIES.has(fm.priority)
			? (fm.priority as TaskPriority)
			: "medium";

		const tags = Array.isArray(fm.tags)
			? fm.tags.filter((t: unknown) => typeof t === "string")
			: [];

		const dependsOn = Array.isArray(fm.depends_on)
			? fm.depends_on.filter((d: unknown) => typeof d === "string")
			: undefined;

		const frontmatter: TaskFrontmatter = {
			title: typeof fm.title === "string" ? fm.title : file.basename,
			status: status as TaskStatus,
			priority,
			created: typeof fm.created === "string" ? fm.created : "",
			...(typeof fm.due === "string" ? { due: fm.due } : {}),
			...(typeof fm.scheduled === "string" ? { scheduled: fm.scheduled } : {}),
			...(typeof fm.completed === "string" ? { completed: fm.completed } : {}),
			...(tags.length > 0 ? { tags } : {}),
			...(typeof fm.context === "string" ? { context: fm.context } : {}),
			...(typeof fm.time_estimate === "number" ? { time_estimate: fm.time_estimate } : {}),
			...(typeof fm.actual_time === "number" ? { actual_time: fm.actual_time } : {}),
			...(typeof fm.difficulty === "string" &&
				["easy", "medium", "hard"].includes(fm.difficulty)
				? { difficulty: fm.difficulty as "easy" | "medium" | "hard" }
				: {}),
			...(typeof fm.trigger === "string" ? { trigger: fm.trigger } : {}),
			...(typeof fm.parent_task === "string" ? { parent_task: fm.parent_task } : {}),
			...(typeof fm.subtask_progress === "string"
				? { subtask_progress: fm.subtask_progress }
				: {}),
			...(typeof fm.recurrence === "string" ? { recurrence: fm.recurrence } : {}),
			...(dependsOn && dependsOn.length > 0 ? { depends_on: dependsOn } : {}),
		};

		return { file, frontmatter };
	}
}
