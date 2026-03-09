import {
	type App,
	type Component,
	MarkdownRenderer,
	Notice,
	setIcon,
} from "obsidian";
import type ArcanaPlugin from "../../main";
import type { ChatMessage } from "../../types";

export class MessageList {
	private containerEl: HTMLElement;
	private app: App;
	private component: Component;
	private plugin: ArcanaPlugin;

	constructor(
		containerEl: HTMLElement,
		app: App,
		component: Component,
		plugin: ArcanaPlugin,
	) {
		this.containerEl = containerEl;
		this.app = app;
		this.component = component;
		this.plugin = plugin;
		this.showEmptyState();
	}

	clear(): void {
		this.containerEl.empty();
		this.showEmptyState();
	}

	addMessage(msg: ChatMessage, streaming = false): HTMLElement {
		this.removeEmptyState();

		const msgEl = this.containerEl.createDiv({
			cls: `arcana-message arcana-message-${msg.role}`,
		});

		const roleEl = msgEl.createDiv({ cls: "arcana-message-role" });
		roleEl.setText(msg.role === "user" ? "You" : "Arcana");

		const contentEl = msgEl.createDiv({ cls: "arcana-message-content" });

		if (streaming) {
			this.renderTypingIndicator(contentEl);
		} else if (msg.role === "user") {
			contentEl.setText(msg.content);
		} else {
			this.renderMarkdown(contentEl, msg.content);
			this.addActionButtons(msgEl, msg.content);
		}

		this.scrollToBottom();
		return msgEl;
	}

	updateStreaming(msgEl: HTMLElement, content: string): void {
		const contentEl = msgEl.querySelector(
			".arcana-message-content",
		) as HTMLElement | null;
		if (!contentEl) return;

		contentEl.empty();
		if (content) {
			this.renderMarkdown(contentEl, content);
		} else {
			this.renderTypingIndicator(contentEl);
		}
		this.scrollToBottom();
	}

	finalizeStreaming(msgEl: HTMLElement, content: string): void {
		const contentEl = msgEl.querySelector(
			".arcana-message-content",
		) as HTMLElement | null;
		if (!contentEl) return;

		contentEl.empty();
		this.renderMarkdown(contentEl, content);

		msgEl.querySelector(".arcana-message-actions")?.remove();
		this.addActionButtons(msgEl, content);

		msgEl.removeClass("arcana-message-streaming");
		this.scrollToBottom();
	}

	private showEmptyState(): void {
		const empty = this.containerEl.createDiv({
			cls: "arcana-chat-empty",
		});

		const iconEl = empty.createDiv({ cls: "arcana-empty-icon" });
		setIcon(iconEl, "sparkles");

		empty.createDiv({
			cls: "arcana-empty-title",
			text: "Start a conversation",
		});
		empty.createDiv({
			cls: "arcana-empty-desc",
			text: "Ask anything about your vault, create tasks, or get help organizing your notes.",
		});
	}

	private removeEmptyState(): void {
		this.containerEl.querySelector(".arcana-chat-empty")?.remove();
	}

	private renderTypingIndicator(el: HTMLElement): void {
		const indicator = el.createDiv({ cls: "arcana-typing-indicator" });
		for (let i = 0; i < 3; i++) {
			indicator.createSpan({ cls: "arcana-typing-dot" });
		}
	}

	private renderMarkdown(el: HTMLElement, content: string): void {
		MarkdownRenderer.render(this.app, content, el, "", this.component);
	}

	private addActionButtons(msgEl: HTMLElement, content: string): void {
		const actions = msgEl.createDiv({ cls: "arcana-message-actions" });

		const copyBtn = actions.createEl("button", {
			cls: "clickable-icon arcana-action-btn",
			attr: { "aria-label": "Copy to clipboard" },
		});
		setIcon(copyBtn, "copy");
		copyBtn.addEventListener("click", () => {
			navigator.clipboard.writeText(content);
			new Notice("Copied to clipboard");
		});

		const saveBtn = actions.createEl("button", {
			cls: "clickable-icon arcana-action-btn",
			attr: { "aria-label": "Save as note" },
		});
		setIcon(saveBtn, "file-plus");
		saveBtn.addEventListener("click", () => {
			this.saveAsNote(content);
		});
	}

	private async saveAsNote(content: string): Promise<void> {
		try {
			const title = `Chat - ${new Date().toLocaleDateString("en-US", {
				year: "numeric",
				month: "short",
				day: "numeric",
				hour: "2-digit",
				minute: "2-digit",
			})}`;
			await this.plugin.noteCreator.createNote({
				title,
				content,
				open: true,
			});
			new Notice("Saved as note");
		} catch {
			new Notice("Failed to save note");
		}
	}

	private scrollToBottom(): void {
		requestAnimationFrame(() => {
			this.containerEl.scrollTop = this.containerEl.scrollHeight;
		});
	}
}
