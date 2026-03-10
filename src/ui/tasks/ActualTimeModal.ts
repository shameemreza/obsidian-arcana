import { App, Modal, Setting } from "obsidian";

/**
 * Shown on task completion to capture how long the task actually took.
 * Pre-fills with focus timer elapsed minutes when available.
 */
export class ActualTimeModal extends Modal {
	private minutes = "";
	private resolved = false;
	private resolve!: (minutes: number | null) => void;

	constructor(
		app: App,
		private taskTitle: string,
		private suggestedMinutes: number | null,
	) {
		super(app);
	}

	/**
	 * Open the modal and return a promise that resolves with the
	 * entered minutes, or null if the user skips/cancels.
	 */
	prompt(): Promise<number | null> {
		return new Promise<number | null>((resolve) => {
			this.resolve = resolve;
			if (this.suggestedMinutes != null && this.suggestedMinutes > 0) {
				this.minutes = String(Math.round(this.suggestedMinutes));
			}
			this.open();
		});
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("arcana-actual-time-modal");

		contentEl.createEl("h3", { text: "How long did this actually take?" });

		const desc = contentEl.createEl("p", {
			cls: "arcana-actual-time-desc",
		});
		desc.setText(`Task: ${this.taskTitle}`);

		new Setting(contentEl)
			.setName("Actual time (minutes)")
			.addText((text) =>
				text
					.setPlaceholder("e.g. 45")
					.setValue(this.minutes)
					.onChange((v) => {
						this.minutes = v;
					}),
			);

		const actions = new Setting(contentEl);
		actions.addButton((btn) =>
			btn.setButtonText("Skip").onClick(() => {
				this.resolved = true;
				this.resolve(null);
				this.close();
			}),
		);
		actions.addButton((btn) =>
			btn
				.setButtonText("Save")
				.setCta()
				.onClick(() => {
					const parsed = parseInt(this.minutes, 10);
					this.resolved = true;
					if (Number.isFinite(parsed) && parsed > 0) {
						this.resolve(parsed);
					} else {
						this.resolve(null);
					}
					this.close();
				}),
		);
	}

	onClose(): void {
		if (!this.resolved) {
			this.resolve(null);
		}
		this.contentEl.empty();
	}
}
