import { App, Modal, Notice } from "obsidian";
import type { TaskParser } from "../../core/vault/task-parser";
import type { NoteCreator } from "../../core/vault/note-creator";

interface QuickTaskOptions {
	taskParser: TaskParser;
	noteCreator: NoteCreator;
	taskFolder: string;
	defaultStatus: string;
	defaultPriority: string;
	useAI: boolean;
}

/**
 * Minimal quick-add modal that accepts a single line of natural language,
 * parses it into a task, and creates the note immediately.
 *
 * Example input: "Review vendor submission by Friday #work priority:high"
 */
export class QuickTaskModal extends Modal {
	private options: QuickTaskOptions;
	private inputEl!: HTMLInputElement;

	constructor(app: App, options: QuickTaskOptions) {
		super(app);
		this.options = options;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("arcana-quick-task-modal");

		contentEl.createEl("h3", { text: "Quick task" });

		const hint = contentEl.createDiv({ cls: "arcana-quick-task-hint" });
		hint.setText(
			'Type naturally, e.g. "Review docs by Friday #work priority:high"',
		);

		this.inputEl = contentEl.createEl("input", {
			type: "text",
			cls: "arcana-quick-task-input",
			attr: { placeholder: "What needs to be done?" },
		});

		this.inputEl.addEventListener("keydown", (e) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				this.submit();
			}
		});

		const actions = contentEl.createDiv({ cls: "arcana-quick-task-actions" });

		const cancelBtn = actions.createEl("button", { text: "Cancel" });
		cancelBtn.addEventListener("click", () => this.close());

		const createBtn = actions.createEl("button", {
			text: "Create",
			cls: "mod-cta",
		});
		createBtn.addEventListener("click", () => this.submit());

		setTimeout(() => this.inputEl.focus(), 50);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private async submit(): Promise<void> {
		const raw = this.inputEl.value.trim();
		if (!raw) {
			new Notice("Enter a task description.");
			return;
		}

		this.inputEl.disabled = true;
		this.inputEl.setAttr("placeholder", "Creating task…");

		try {
			const task = this.options.useAI
				? await this.options.taskParser.parseWithAI(raw)
				: this.options.taskParser.parse(raw);

			if (this.options.defaultStatus) {
				task.status = this.options.defaultStatus as typeof task.status;
			}

			await this.options.noteCreator.createTask({
				task,
				taskFolder: this.options.taskFolder,
			});

			const parts = [`Task created: ${task.title}`];
			if (task.due) parts.push(`Due: ${task.due}`);
			new Notice(parts.join(" - "));

			this.close();
		} catch (e) {
			const msg = e instanceof Error ? e.message : "Unknown error";
			new Notice(`Failed to create task: ${msg}`);
			this.inputEl.disabled = false;
			this.inputEl.setAttr("placeholder", "What needs to be done?");
		}
	}
}
