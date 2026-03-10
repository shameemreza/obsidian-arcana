import { App, Notice, TFile } from "obsidian";
import type { TaskFrontmatter, TaskStatus, TaskPriority } from "../../types";
import { TASK_STATUSES, TASK_PRIORITIES } from "../../constants";
import { todayISO } from "../../utils/dates";
import { parseTimeEstimate } from "../../utils/frontmatter";
import { computeNextDue } from "./recurrence";
import type { NoteCreator } from "./note-creator";
import type { TaskScanner, DiscoveredTask } from "./task-scanner";
import type { TaskChunking } from "./task-chunking";
import type { ArcanaSettings } from "../../settings";

const VALID_STATUSES: ReadonlySet<string> = new Set(TASK_STATUSES);
const VALID_PRIORITIES: ReadonlySet<string> = new Set(TASK_PRIORITIES);

export class TaskLifecycle {
	private statusCache = new Map<string, string>();
	private processing = new Set<string>();
	private taskChunking: TaskChunking | null = null;

	constructor(
		private app: App,
		private noteCreator: NoteCreator,
		private taskScanner: TaskScanner,
		private getSettings: () => ArcanaSettings,
	) {}

	setTaskChunking(chunking: TaskChunking): void {
		this.taskChunking = chunking;
	}

	/**
	 * Complete a task: set status to done, add completed date,
	 * and create the next recurrence if applicable.
	 */
	async completeTask(file: TFile): Promise<void> {
		await this.changeStatus(file, "done");
	}

	/**
	 * Change a task's status via processFrontMatter. Handles the
	 * completed date and recurrence side-effects automatically.
	 */
	async changeStatus(file: TFile, newStatus: TaskStatus): Promise<void> {
		if (this.processing.has(file.path)) return;
		this.processing.add(file.path);

		try {
			let recurrence: string | undefined;
			let previousDue: string | undefined;
			let taskData: TaskFrontmatter | null = null;
			let parentTaskRef: unknown;

			await this.app.fileManager.processFrontMatter(file, (fm) => {
				fm.status = newStatus;

				if (newStatus === "done") {
					fm.completed = todayISO();
				} else if (fm.completed) {
					delete fm.completed;
				}

				recurrence =
					typeof fm.recurrence === "string"
						? fm.recurrence
						: undefined;
				previousDue =
					typeof fm.due === "string" ? fm.due : undefined;
				taskData = buildTaskFromFrontmatter(fm, file);
				parentTaskRef = fm.parent_task;
			});

			this.statusCache.set(file.path, newStatus);

			if (newStatus === "done" && recurrence && taskData) {
				await this.createNextRecurrence(
					taskData,
					previousDue,
					recurrence,
				);
			}

			const hasParent =
				typeof parentTaskRef === "string" ||
				Array.isArray(parentTaskRef);
			if (this.taskChunking && hasParent) {
				const wasDone = false;
				const isDone =
					newStatus === "done" || newStatus === "cancelled";
				await this.updateParentOnSubtaskChange(
					file,
					newStatus,
					isDone,
					wasDone,
				);
			}
		} finally {
			this.processing.delete(file.path);
		}
	}

	/**
	 * React to a frontmatter change detected by the metadata cache.
	 * Compares the current status with the cached value and applies
	 * side-effects when the status transitions to or from "done".
	 */
	async onMetadataChange(file: TFile): Promise<void> {
		if (this.processing.has(file.path)) return;

		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache?.frontmatter) return;

		const fm = cache.frontmatter;
		const currentStatus = fm.status;
		if (
			typeof currentStatus !== "string" ||
			!VALID_STATUSES.has(currentStatus)
		)
			return;

		const previousStatus = this.statusCache.get(file.path);
		this.statusCache.set(file.path, currentStatus);

		if (
			previousStatus === undefined ||
			previousStatus === currentStatus
		)
			return;

		if (currentStatus === "done") {
			this.processing.add(file.path);
			try {
				const needsDate =
					typeof fm.completed !== "string" || !fm.completed;
				const recurrence =
					typeof fm.recurrence === "string"
						? fm.recurrence
						: undefined;
				const previousDue =
					typeof fm.due === "string" ? fm.due : undefined;

				if (needsDate) {
					await this.app.fileManager.processFrontMatter(
						file,
						(inner) => {
							inner.completed = todayISO();
						},
					);
				}

				if (recurrence) {
					const taskData = buildTaskFromFrontmatter(fm, file);
					if (taskData) {
						await this.createNextRecurrence(
							taskData,
							previousDue,
							recurrence,
						);
					}
				}
			} finally {
				this.processing.delete(file.path);
			}
		}

		if (previousStatus === "done" && currentStatus !== "done") {
			this.processing.add(file.path);
			try {
				await this.app.fileManager.processFrontMatter(
					file,
					(inner) => {
						delete inner.completed;
					},
				);
			} finally {
				this.processing.delete(file.path);
			}
		}

		const hasParent =
			typeof fm.parent_task === "string" || Array.isArray(fm.parent_task);
		if (this.taskChunking && previousStatus !== currentStatus && hasParent) {
			const wasDone =
				previousStatus === "done" || previousStatus === "cancelled";
			const isDone =
				currentStatus === "done" || currentStatus === "cancelled";
			await this.updateParentOnSubtaskChange(
				file,
				currentStatus,
				isDone,
				wasDone,
			);
		}
	}

	/**
	 * When a subtask's done/not-done state changes, apply a +1 or -1
	 * delta to the parent's subtask_progress instead of rescanning
	 * (the metadata cache is stale right after processFrontMatter).
	 */
	private async updateParentOnSubtaskChange(
		subtaskFile: TFile,
		newStatus: string,
		isDoneNow: boolean,
		wasDoneBefore: boolean,
	): Promise<void> {
		if (!this.taskChunking) return;
		if (isDoneNow === wasDoneBefore) return;

		const parentFile = this.taskChunking.findParentFile(subtaskFile);
		if (!parentFile) return;

		const parentCache =
			this.app.metadataCache.getFileCache(parentFile);
		const progress =
			parentCache?.frontmatter?.subtask_progress;

		if (typeof progress === "string") {
			const match = progress.match(/^(\d+)\/(\d+)$/);
			if (match) {
				let done = parseInt(match[1], 10);
				const total = parseInt(match[2], 10);
				done = isDoneNow
					? Math.min(done + 1, total)
					: Math.max(done - 1, 0);
				await this.taskChunking.setParentProgress(
					parentFile,
					done,
					total,
				);
			}
		}

		if (isDoneNow) {
			this.showSubtaskCompletionFeedback();
		}
	}

	/**
	 * Trigger a brief satisfying checkmark overlay animation.
	 */
	private showSubtaskCompletionFeedback(): void {
		const overlay = document.createElement("div");
		overlay.addClass("arcana-subtask-complete-overlay");

		const checkmark = document.createElement("div");
		checkmark.addClass("arcana-subtask-complete-checkmark");
		overlay.appendChild(checkmark);

		document.body.appendChild(overlay);

		window.setTimeout(() => {
			overlay.remove();
		}, 1200);
	}

	/**
	 * Populate the status cache from every known task.
	 * Call once after the workspace layout is ready.
	 */
	async initializeStatusCache(): Promise<void> {
		const tasks = await this.taskScanner.getAll();
		for (const task of tasks) {
			this.statusCache.set(task.file.path, task.frontmatter.status);
		}
	}

	/**
	 * Check whether all depends_on references of a task are resolved.
	 * Returns separate lists of pending and resolved dependencies.
	 */
	async checkDependencies(
		file: TFile,
	): Promise<{
		met: boolean;
		pending: { title: string; path: string }[];
		resolved: { title: string; path: string }[];
	}> {
		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache?.frontmatter)
			return { met: true, pending: [], resolved: [] };

		const dependsOn = cache.frontmatter.depends_on;
		if (!Array.isArray(dependsOn) || dependsOn.length === 0) {
			return { met: true, pending: [], resolved: [] };
		}

		const allTasks = await this.taskScanner.getAll();
		const taskIndex = buildTaskIndex(allTasks);

		const pending: { title: string; path: string }[] = [];
		const resolved: { title: string; path: string }[] = [];

		for (const dep of dependsOn) {
			if (typeof dep !== "string") continue;
			const cleaned = dep.replace(/^\[\[|\]\]$/g, "");
			const found =
				taskIndex.get(cleaned) ||
				taskIndex.get(cleaned.toLowerCase());

			if (!found) {
				pending.push({ title: cleaned, path: "" });
				continue;
			}

			const done =
				found.frontmatter.status === "done" ||
				found.frontmatter.status === "cancelled";

			if (done) {
				resolved.push({
					title: found.frontmatter.title,
					path: found.file.path,
				});
			} else {
				pending.push({
					title: found.frontmatter.title,
					path: found.file.path,
				});
			}
		}

		return { met: pending.length === 0, pending, resolved };
	}

	/**
	 * Verify the active note is a task and return its file, or null.
	 */
	getActiveTaskFile(): TFile | null {
		const file = this.app.workspace.getActiveFile();
		if (!file || file.extension !== "md") return null;

		const cache = this.app.metadataCache.getFileCache(file);
		if (!cache?.frontmatter) return null;

		const status = cache.frontmatter.status;
		if (typeof status !== "string" || !VALID_STATUSES.has(status))
			return null;

		return file;
	}

	private async createNextRecurrence(
		completed: TaskFrontmatter,
		previousDue: string | undefined,
		recurrence: string,
	): Promise<void> {
		const nextDue = computeNextDue(previousDue, todayISO(), recurrence);
		if (!nextDue) return;

		const settings = this.getSettings();

		const newTask: TaskFrontmatter = {
			title: completed.title,
			status: (settings.defaultTaskStatus as TaskStatus) || "todo",
			priority: completed.priority,
			created: todayISO(),
			due: nextDue,
			recurrence,
			...(completed.tags && completed.tags.length > 0
				? { tags: [...completed.tags] }
				: {}),
			...(completed.context ? { context: completed.context } : {}),
			...(completed.time_estimate != null
				? { time_estimate: completed.time_estimate }
				: {}),
			...(completed.difficulty
				? { difficulty: completed.difficulty }
				: {}),
		};

		await this.noteCreator.createTask({
			task: newTask,
			taskFolder: settings.taskFolderPath,
			open: false,
		});

		new Notice(
			`Recurring task created: ${newTask.title} (due ${nextDue})`,
		);
	}
}

function buildTaskFromFrontmatter(
	fm: Record<string, unknown>,
	file: TFile,
): TaskFrontmatter | null {
	const status = fm.status;
	if (typeof status !== "string" || !VALID_STATUSES.has(status))
		return null;

	const tags = Array.isArray(fm.tags)
		? fm.tags.filter((t: unknown) => typeof t === "string")
		: [];

	const dependsOn = Array.isArray(fm.depends_on)
		? fm.depends_on.filter((d: unknown) => typeof d === "string")
		: undefined;

	const priority =
		typeof fm.priority === "string" && VALID_PRIORITIES.has(fm.priority)
			? (fm.priority as TaskPriority)
			: "medium";

	return {
		title: typeof fm.title === "string" ? fm.title : file.basename,
		status: status as TaskStatus,
		priority,
		created: typeof fm.created === "string" ? fm.created : "",
		...(typeof fm.due === "string" ? { due: fm.due } : {}),
		...(typeof fm.scheduled === "string"
			? { scheduled: fm.scheduled }
			: {}),
		...(typeof fm.completed === "string"
			? { completed: fm.completed }
			: {}),
		...(tags.length > 0 ? { tags } : {}),
		...(typeof fm.context === "string" ? { context: fm.context } : {}),
		...(parseTimeEstimate(fm.time_estimate) != null
			? { time_estimate: parseTimeEstimate(fm.time_estimate) as number }
			: {}),
		...(typeof fm.actual_time === "number"
			? { actual_time: fm.actual_time }
			: {}),
		...(typeof fm.difficulty === "string" &&
		["easy", "medium", "hard"].includes(fm.difficulty as string)
			? {
					difficulty: fm.difficulty as
						| "easy"
						| "medium"
						| "hard",
				}
			: {}),
		...(typeof fm.trigger === "string" ? { trigger: fm.trigger } : {}),
		...(resolveParentTaskValue(fm.parent_task)
			? { parent_task: resolveParentTaskValue(fm.parent_task) as string }
			: {}),
		...(typeof fm.subtask_progress === "string"
			? { subtask_progress: fm.subtask_progress }
			: {}),
		...(typeof fm.recurrence === "string"
			? { recurrence: fm.recurrence }
			: {}),
		...(dependsOn && dependsOn.length > 0
			? { depends_on: dependsOn }
			: {}),
	};
}

function resolveParentTaskValue(raw: unknown): string | null {
	if (typeof raw === "string") return raw;
	if (Array.isArray(raw)) {
		const inner = raw.flat(3);
		if (inner.length === 1 && typeof inner[0] === "string") {
			return `[[${inner[0]}]]`;
		}
	}
	return null;
}

function buildTaskIndex(
	tasks: DiscoveredTask[],
): Map<string, DiscoveredTask> {
	const index = new Map<string, DiscoveredTask>();
	for (const t of tasks) {
		index.set(t.file.basename, t);
		index.set(t.file.path, t);
		index.set(t.frontmatter.title.toLowerCase(), t);
	}
	return index;
}
