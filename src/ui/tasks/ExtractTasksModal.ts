import { App, Modal, Notice, Setting } from "obsidian";
import type { TaskFrontmatter, TaskStatus, TaskPriority } from "../../types";
import type { NoteCreator } from "../../core/vault/note-creator";
import { todayISO } from "../../utils/dates";

interface Candidate {
	title: string;
	due?: string;
	priority?: string;
	selected: boolean;
}

export class ExtractTasksModal extends Modal {
	private candidates: Candidate[];
	private noteCreator: NoteCreator;
	private taskFolder: string;
	private defaultStatus: string;
	private defaultPriority: string;

	constructor(
		app: App,
		items: Array<{ title: string; due?: string; priority?: string }>,
		options: {
			noteCreator: NoteCreator;
			taskFolder: string;
			defaultStatus: string;
			defaultPriority: string;
		},
	) {
		super(app);
		this.candidates = items.map((item) => ({ ...item, selected: true }));
		this.noteCreator = options.noteCreator;
		this.taskFolder = options.taskFolder;
		this.defaultStatus = options.defaultStatus;
		this.defaultPriority = options.defaultPriority;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.addClass("arcana-extract-tasks-modal");

		contentEl.createEl("h2", { text: "Detected action items" });

		if (this.candidates.length === 0) {
			contentEl.createEl("p", {
				text: "No action items detected in this note.",
			});
			return;
		}

		contentEl.createEl("p", {
			text: `Found ${this.candidates.length} potential task(s). Toggle off any you do not want to create.`,
		});

		const listEl = contentEl.createDiv({
			cls: "arcana-extract-list",
		});

		for (const candidate of this.candidates) {
			const desc = candidate.due ? `Due: ${candidate.due}` : "";
			new Setting(listEl)
				.setName(candidate.title)
				.setDesc(desc)
				.addToggle((toggle) =>
					toggle.setValue(candidate.selected).onChange((v) => {
						candidate.selected = v;
					}),
				);
		}

		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText("Create selected")
					.setCta()
					.onClick(async () => {
						btn.setDisabled(true);
						btn.setButtonText("Creating...");
						await this.createSelected();
					}),
			)
			.addButton((btn) =>
				btn.setButtonText("Cancel").onClick(() => this.close()),
			);
	}

	onClose() {
		this.contentEl.empty();
	}

	private async createSelected(): Promise<void> {
		const selected = this.candidates.filter((c) => c.selected);
		if (selected.length === 0) {
			new Notice("No tasks selected.");
			this.close();
			return;
		}

		let created = 0;
		for (const item of selected) {
			const task: TaskFrontmatter = {
				title: item.title,
				status: this.defaultStatus as TaskStatus,
				priority: (item.priority ||
					this.defaultPriority) as TaskPriority,
				created: todayISO(),
				...(item.due ? { due: item.due } : {}),
			};

			try {
				await this.noteCreator.createTask({
					task,
					taskFolder: this.taskFolder,
				});
				created++;
			} catch (e) {
				console.error(
					"[Arcana] Failed to create extracted task:",
					e,
				);
			}
		}

		new Notice(`Created ${created} task(s).`);
		this.close();
	}
}
