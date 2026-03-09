import { App, normalizePath, TFile } from "obsidian";
import type { TaskFrontmatter } from "../../types";
import { buildNoteContent, buildTaskNote, taskFilename } from "../../utils/frontmatter";
import { todayISO } from "../../utils/dates";
import type { VaultIntel } from "./vault-intel";

export class NoteCreator {
	constructor(
		private app: App,
		private vaultIntel: VaultIntel,
	) {}

	/**
	 * Create a generic note with frontmatter in the suggested (or specified) folder.
	 */
	async createNote(options: {
		title: string;
		content?: string;
		frontmatter?: Record<string, unknown>;
		folder?: string;
		open?: boolean;
	}): Promise<TFile> {
		const folder =
			options.folder ??
			(await this.vaultIntel.suggestFolder(
				options.title + " " + (options.content ?? ""),
			));

		await this.ensureFolder(folder);

		const filename = this.safeFilename(options.title);
		const path = normalizePath(`${folder}/${filename}.md`);

		const fm: Record<string, unknown> = {
			title: options.title,
			created: todayISO(),
			...(options.frontmatter ?? {}),
		};

		const body = options.content ?? "";
		const content = buildNoteContent(fm, body);

		const file = await this.app.vault.create(path, content);

		if (options.open) {
			const leaf = this.app.workspace.getLeaf(false);
			await leaf.openFile(file);
		}

		return file;
	}

	/**
	 * Create a task note with full frontmatter in the task folder.
	 */
	async createTask(options: {
		task: TaskFrontmatter;
		body?: string;
		taskFolder: string;
		open?: boolean;
	}): Promise<TFile> {
		await this.ensureFolder(options.taskFolder);

		const filename = taskFilename(options.task.title, options.task.created);
		const path = normalizePath(`${options.taskFolder}/${filename}`);

		const content = buildTaskNote(options.task, options.body);

		const existing = this.app.vault.getAbstractFileByPath(path);
		if (existing instanceof TFile) {
			await this.app.vault.modify(existing, content);
			if (options.open) {
				const leaf = this.app.workspace.getLeaf(false);
				await leaf.openFile(existing);
			}
			return existing;
		}

		const file = await this.app.vault.create(path, content);

		if (options.open) {
			const leaf = this.app.workspace.getLeaf(false);
			await leaf.openFile(file);
		}

		return file;
	}

	private async ensureFolder(folderPath: string): Promise<void> {
		const normalized = normalizePath(folderPath);
		const existing = this.app.vault.getAbstractFileByPath(normalized);
		if (!existing) {
			await this.app.vault.createFolder(normalized);
		}
	}

	private safeFilename(title: string): string {
		return title
			.replace(/[\\/:*?"<>|]/g, "")
			.replace(/\s+/g, " ")
			.trim()
			.slice(0, 100);
	}
}
