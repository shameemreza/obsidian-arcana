import { App, Modal, Notice, Setting, TFile } from "obsidian";
import type { TaskFrontmatter, TaskStatus, TaskPriority } from "../../types";
import { TASK_STATUSES, TASK_PRIORITIES } from "../../constants";
import { parseNaturalDate, formatRelativeDate, todayISO } from "../../utils/dates";
import { buildTaskNote } from "../../utils/frontmatter";
import type { NoteCreator } from "../../core/vault/note-creator";

interface TaskModalOptions {
	noteCreator: NoteCreator;
	taskFolder: string;
	defaultStatus: string;
	defaultPriority: string;
	existing?: { file: TFile; frontmatter: TaskFrontmatter };
}

/**
 * Full task creation/editing modal with all frontmatter fields.
 * Due date and scheduled date support natural language input.
 */
export class TaskModal extends Modal {
	private title = "";
	private status: TaskStatus;
	private priority: TaskPriority;
	private dueRaw = "";
	private dueParsed: string | null = null;
	private scheduledRaw = "";
	private scheduledParsed: string | null = null;
	private tags = "";
	private context = "";
	private timeEstimate = "";
	private notes = "";

	private isEditing: boolean;
	private options: TaskModalOptions;

	constructor(app: App, options: TaskModalOptions) {
		super(app);
		this.options = options;
		this.isEditing = !!options.existing;

		if (options.existing) {
			const fm = options.existing.frontmatter;
			this.title = fm.title;
			this.status = fm.status;
			this.priority = fm.priority;
			this.dueRaw = fm.due ?? "";
			this.dueParsed = fm.due ?? null;
			this.scheduledRaw = fm.scheduled ?? "";
			this.scheduledParsed = fm.scheduled ?? null;
			this.tags = fm.tags?.join(", ") ?? "";
			this.context = fm.context ?? "";
			this.timeEstimate = fm.time_estimate != null ? String(fm.time_estimate) : "";
		} else {
			this.status = (options.defaultStatus as TaskStatus) ?? "inbox";
			this.priority = (options.defaultPriority as TaskPriority) ?? "medium";
		}
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("arcana-task-modal");
		contentEl.createEl("h2", {
			text: this.isEditing ? "Edit task" : "New task",
		});

		new Setting(contentEl)
			.setName("Title")
			.addText((text) =>
				text
					.setPlaceholder("What needs to be done?")
					.setValue(this.title)
					.onChange((v) => { this.title = v; }),
			);

		new Setting(contentEl)
			.setName("Status")
			.addDropdown((dropdown) => {
				for (const s of TASK_STATUSES) {
					dropdown.addOption(s, statusLabel(s));
				}
				dropdown.setValue(this.status).onChange((v) => {
					this.status = v as TaskStatus;
				});
			});

		new Setting(contentEl)
			.setName("Priority")
			.addDropdown((dropdown) => {
				for (const p of TASK_PRIORITIES) {
					dropdown.addOption(p, priorityLabel(p));
				}
				dropdown.setValue(this.priority).onChange((v) => {
					this.priority = v as TaskPriority;
				});
			});

		this.addDateField(contentEl, "Due date", this.dueRaw, (raw, parsed) => {
			this.dueRaw = raw;
			this.dueParsed = parsed;
		});

		this.addDateField(contentEl, "Scheduled date", this.scheduledRaw, (raw, parsed) => {
			this.scheduledRaw = raw;
			this.scheduledParsed = parsed;
		});

		new Setting(contentEl)
			.setName("Tags")
			.setDesc("Comma-separated")
			.addText((text) =>
				text
					.setPlaceholder("work, review, urgent")
					.setValue(this.tags)
					.onChange((v) => { this.tags = v; }),
			);

		new Setting(contentEl)
			.setName("Context")
			.setDesc("Project or area name")
			.addText((text) =>
				text
					.setPlaceholder("marketplace")
					.setValue(this.context)
					.onChange((v) => { this.context = v; }),
			);

		new Setting(contentEl)
			.setName("Time estimate")
			.setDesc("Minutes")
			.addText((text) =>
				text
					.setPlaceholder("30")
					.setValue(this.timeEstimate)
					.onChange((v) => { this.timeEstimate = v; }),
			);

		const notesWrapper = contentEl.createDiv({ cls: "arcana-task-notes-field" });
		notesWrapper.createEl("label", {
			text: "Notes",
			cls: "arcana-task-notes-label",
		});
		const textarea = notesWrapper.createEl("textarea", {
			cls: "arcana-task-notes-input",
			attr: { rows: "4", placeholder: "Additional context about this task..." },
		});
		if (this.isEditing) {
			textarea.value = this.notes;
		}
		textarea.addEventListener("input", () => { this.notes = textarea.value; });

		const actions = new Setting(contentEl);
		actions.addButton((btn) =>
			btn.setButtonText("Cancel").onClick(() => this.close()),
		);
		actions.addButton((btn) =>
			btn
				.setButtonText(this.isEditing ? "Save" : "Create task")
				.setCta()
				.onClick(() => this.submit()),
		);
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private addDateField(
		container: HTMLElement,
		label: string,
		initial: string,
		onChange: (raw: string, parsed: string | null) => void,
	): void {
		const setting = new Setting(container).setName(label);
		const hintEl = setting.settingEl.createDiv({ cls: "arcana-date-hint" });

		setting.addText((text) => {
			text
				.setPlaceholder("tomorrow, next friday, 2026-03-15")
				.setValue(initial)
				.onChange((v) => {
					const parsed = v ? parseNaturalDate(v) : null;
					onChange(v, parsed);
					updateHint(hintEl, v, parsed);
				});
		});

		updateHint(hintEl, initial, initial ? parseNaturalDate(initial) : null);
	}

	private async submit(): Promise<void> {
		if (!this.title.trim()) {
			new Notice("Task title is required.");
			return;
		}

		const tagList = this.tags
			.split(",")
			.map((t) => t.trim().replace(/^#/, ""))
			.filter((t) => t.length > 0);

		const est = parseInt(this.timeEstimate, 10);

		const task: TaskFrontmatter = {
			title: this.title.trim(),
			status: this.status,
			priority: this.priority,
			created: this.isEditing && this.options.existing
				? this.options.existing.frontmatter.created
				: todayISO(),
			...(this.dueParsed ? { due: this.dueParsed } : {}),
			...(this.scheduledParsed ? { scheduled: this.scheduledParsed } : {}),
			...(tagList.length > 0 ? { tags: tagList } : {}),
			...(this.context.trim() ? { context: this.context.trim() } : {}),
			...(Number.isFinite(est) && est > 0 ? { time_estimate: est } : {}),
		};

		try {
			if (this.isEditing && this.options.existing) {
				const content = buildTaskNote(task, this.notes || undefined);
				await this.app.vault.modify(this.options.existing.file, content);
				new Notice(`Task updated: ${task.title}`);
			} else {
				await this.options.noteCreator.createTask({
					task,
					body: this.notes || undefined,
					taskFolder: this.options.taskFolder,
					open: true,
				});
				new Notice(`Task created: ${task.title}`);
			}
			this.close();
		} catch (e) {
			const msg = e instanceof Error ? e.message : "Unknown error";
			new Notice(`Failed to save task: ${msg}`);
		}
	}
}

function updateHint(el: HTMLElement, raw: string, parsed: string | null): void {
	if (!raw) {
		el.setText("");
		el.removeClass("arcana-date-hint-error");
		return;
	}
	if (parsed) {
		el.setText(formatRelativeDate(parsed) + ` (${parsed})`);
		el.removeClass("arcana-date-hint-error");
	} else {
		el.setText("Could not parse date");
		el.addClass("arcana-date-hint-error");
	}
}

function statusLabel(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

function priorityLabel(p: string): string {
	return p.charAt(0).toUpperCase() + p.slice(1);
}
