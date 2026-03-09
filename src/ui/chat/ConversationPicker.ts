import { type App, Modal, Notice, setIcon } from "obsidian";
import type { ConversationMeta } from "../../types";
import type { ChatHistory } from "../../core/chat-history";

export class ConversationPicker extends Modal {
	private conversations: ConversationMeta[];
	private filtered: ConversationMeta[];
	private chatHistory: ChatHistory;
	private activeId: string;
	private onOpen_: (meta: ConversationMeta) => void;
	private listEl!: HTMLElement;
	private searchEl!: HTMLInputElement;

	constructor(
		app: App,
		conversations: ConversationMeta[],
		chatHistory: ChatHistory,
		activeId: string,
		onChoose: (meta: ConversationMeta) => void,
	) {
		super(app);
		this.conversations = conversations;
		this.filtered = conversations;
		this.chatHistory = chatHistory;
		this.activeId = activeId;
		this.onOpen_ = onChoose;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.addClass("arcana-convo-picker");

		const header = contentEl.createDiv({ cls: "arcana-convo-picker-header" });

		this.searchEl = header.createEl("input", {
			cls: "arcana-convo-search",
			attr: {
				type: "text",
				placeholder: "Search conversations\u2026",
				spellcheck: "false",
			},
		});
		this.searchEl.addEventListener("input", () => this.applyFilter());

		if (this.conversations.length > 1) {
			const clearBtn = header.createEl("button", {
				cls: "arcana-convo-clear-all",
				text: "Delete all",
			});
			clearBtn.addEventListener("click", () => this.deleteAll());
		}

		this.listEl = contentEl.createDiv({ cls: "arcana-convo-list" });
		this.renderList();

		this.searchEl.focus();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private applyFilter(): void {
		const query = this.searchEl.value.toLowerCase();
		if (!query) {
			this.filtered = this.conversations;
		} else {
			this.filtered = this.conversations.filter((c) => {
				const title = c.title.toLowerCase();
				const date = this.formatDate(c.updated).toLowerCase();
				return title.includes(query) || date.includes(query);
			});
		}
		this.renderList();
	}

	private renderList(): void {
		this.listEl.empty();

		if (this.filtered.length === 0) {
			this.listEl.createDiv({
				cls: "arcana-convo-empty",
				text: "No conversations found",
			});
			return;
		}

		for (const meta of this.filtered) {
			this.renderItem(meta);
		}
	}

	private renderItem(meta: ConversationMeta): void {
		const isActive = meta.id === this.activeId;

		const row = this.listEl.createDiv({
			cls: `arcana-convo-row${isActive ? " is-active" : ""}`,
		});

		const main = row.createDiv({ cls: "arcana-convo-main" });
		main.addEventListener("click", () => {
			this.close();
			this.onOpen_(meta);
		});

		const left = main.createDiv({ cls: "arcana-convo-left" });
		const titleRow = left.createDiv({ cls: "arcana-convo-title-row" });
		titleRow.createSpan({
			cls: "arcana-convo-title",
			text: meta.title,
		});
		if (isActive) {
			const badge = titleRow.createSpan({ cls: "arcana-convo-badge" });
			badge.setText("active");
		}
		left.createDiv({
			cls: "arcana-convo-meta",
			text: `${meta.messageCount} messages`,
		});

		main.createDiv({
			cls: "arcana-convo-date",
			text: this.formatDate(meta.updated),
		});

		const deleteBtn = row.createEl("button", {
			cls: "clickable-icon arcana-convo-delete",
			attr: { "aria-label": "Delete conversation" },
		});
		setIcon(deleteBtn, "trash-2");
		deleteBtn.addEventListener("click", (e) => {
			e.stopPropagation();
			this.deleteOne(meta);
		});
	}

	private async deleteOne(meta: ConversationMeta): Promise<void> {
		try {
			await this.chatHistory.delete(meta.filePath);
			this.conversations = this.conversations.filter(
				(c) => c.filePath !== meta.filePath,
			);
			this.applyFilter();

			if (this.conversations.length === 0) {
				this.close();
				new Notice("All conversations deleted");
			}
		} catch {
			new Notice("Failed to delete conversation");
		}
	}

	private async deleteAll(): Promise<void> {
		const count = this.conversations.length;

		for (const meta of this.conversations) {
			try {
				await this.chatHistory.delete(meta.filePath);
			} catch {
				// Skip failures
			}
		}

		this.conversations = [];
		this.filtered = [];
		this.close();
		new Notice(`Deleted ${count} conversation${count > 1 ? "s" : ""}`);
	}

	private formatDate(ts: number): string {
		const d = new Date(ts);
		const now = new Date();
		const diffMs = now.getTime() - d.getTime();
		const diffDays = Math.floor(diffMs / 86_400_000);

		if (diffDays === 0) {
			return d.toLocaleTimeString("en-US", {
				hour: "numeric",
				minute: "2-digit",
			});
		}
		if (diffDays === 1) return "Yesterday";
		if (diffDays < 7) return `${diffDays} days ago`;

		return d.toLocaleDateString("en-US", {
			month: "short",
			day: "numeric",
		});
	}
}
