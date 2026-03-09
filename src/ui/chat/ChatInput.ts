import { type App, setIcon, type TFile } from "obsidian";
import { filterCommands } from "./slash-commands/registry";
import type { SlashCommand } from "./slash-commands/types";

export class ChatInput {
	private app: App;
	private textareaEl!: HTMLTextAreaElement;
	private sendBtnEl!: HTMLButtonElement;
	private suggestEl!: HTMLElement;
	private slashSuggestEl!: HTMLElement;
	private onSend: (text: string) => void;
	private onInputChange: (text: string) => void;
	private activeSuggestionIndex = -1;
	private suggestions: TFile[] = [];
	private slashSuggestions: SlashCommand[] = [];
	private activeSlashIndex = -1;

	constructor(
		containerEl: HTMLElement,
		app: App,
		onSend: (text: string) => void,
		onInputChange: (text: string) => void,
	) {
		this.app = app;
		this.onSend = onSend;
		this.onInputChange = onInputChange;
		this.build(containerEl);
	}

	setEnabled(enabled: boolean): void {
		this.textareaEl.disabled = !enabled;
		this.sendBtnEl.disabled = !enabled;
	}

	focus(): void {
		this.textareaEl.focus();
	}

	getValue(): string {
		return this.textareaEl.value;
	}

	private build(containerEl: HTMLElement): void {
		const wrapper = containerEl.createDiv({ cls: "arcana-input-wrapper" });

		this.suggestEl = containerEl.createDiv({ cls: "arcana-mention-suggest" });
		this.suggestEl.style.display = "none";

		this.slashSuggestEl = containerEl.createDiv({ cls: "arcana-slash-suggest" });
		this.slashSuggestEl.style.display = "none";

		this.textareaEl = wrapper.createEl("textarea", {
			attr: {
				placeholder: "Ask anything...",
				rows: "2",
			},
		});

		this.textareaEl.addEventListener("keydown", (e: KeyboardEvent) => {
			if (this.handleSlashKeydown(e)) return;
			if (this.handleSuggestKeydown(e)) return;

			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				this.send();
			}
		});

		this.textareaEl.addEventListener("input", () => {
			this.autoResize();
			this.checkSlashTrigger();
			this.checkMentionTrigger();
			this.onInputChange(this.textareaEl.value);
		});

		this.sendBtnEl = wrapper.createEl("button", {
			cls: "arcana-send-btn clickable-icon",
			attr: { "aria-label": "Send message" },
		});
		setIcon(this.sendBtnEl, "send-horizontal");
		this.sendBtnEl.addEventListener("click", () => this.send());
	}

	private send(): void {
		this.hideSuggestions();
		const text = this.textareaEl.value;
		if (!text.trim()) return;
		this.textareaEl.value = "";
		this.autoResize();
		this.onSend(text);
	}

	private autoResize(): void {
		this.textareaEl.style.height = "auto";
		const maxHeight = 150;
		this.textareaEl.style.height =
			Math.min(this.textareaEl.scrollHeight, maxHeight) + "px";
	}

	// ---- @[[note]] Mention Autocomplete ----

	private checkMentionTrigger(): void {
		const pos = this.textareaEl.selectionStart;
		const text = this.textareaEl.value;
		const beforeCursor = text.slice(0, pos);

		const mentionMatch = beforeCursor.match(/@\[\[([^\]]*?)$/);
		if (!mentionMatch) {
			this.hideSuggestions();
			return;
		}

		const query = mentionMatch[1].toLowerCase();
		this.showSuggestions(query);
	}

	private showSuggestions(query: string): void {
		const files = this.app.vault.getMarkdownFiles();

		this.suggestions = files
			.filter((f) => {
				const name = f.basename.toLowerCase();
				const path = f.path.toLowerCase();
				return name.includes(query) || path.includes(query);
			})
			.sort((a, b) => {
				const aExact = a.basename.toLowerCase() === query ? -1 : 0;
				const bExact = b.basename.toLowerCase() === query ? -1 : 0;
				if (aExact !== bExact) return aExact - bExact;
				return b.stat.mtime - a.stat.mtime;
			})
			.slice(0, 8);

		if (this.suggestions.length === 0) {
			this.hideSuggestions();
			return;
		}

		this.suggestEl.empty();
		this.suggestEl.style.display = "";
		this.activeSuggestionIndex = -1;

		for (let i = 0; i < this.suggestions.length; i++) {
			const file = this.suggestions[i];
			const item = this.suggestEl.createDiv({ cls: "arcana-mention-item" });
			item.createSpan({ text: file.basename, cls: "arcana-mention-name" });
			if (file.parent && file.parent.path !== "/") {
				item.createSpan({
					text: file.parent.path,
					cls: "arcana-mention-path",
				});
			}

			item.addEventListener("click", () => this.acceptSuggestion(i));
			item.addEventListener("mouseenter", () => {
				this.setActiveSuggestion(i);
			});
		}
	}

	private hideSuggestions(): void {
		this.suggestEl.style.display = "none";
		this.suggestEl.empty();
		this.suggestions = [];
		this.activeSuggestionIndex = -1;
	}

	private setActiveSuggestion(index: number): void {
		const items = this.suggestEl.querySelectorAll(".arcana-mention-item");
		items.forEach((el) => el.removeClass("is-selected"));
		this.activeSuggestionIndex = index;
		if (index >= 0 && index < items.length) {
			items[index].addClass("is-selected");
		}
	}

	private acceptSuggestion(index: number): void {
		const file = this.suggestions[index];
		if (!file) return;

		const pos = this.textareaEl.selectionStart;
		const text = this.textareaEl.value;
		const beforeCursor = text.slice(0, pos);

		const mentionStart = beforeCursor.lastIndexOf("@[[");
		if (mentionStart === -1) return;

		const afterCursor = text.slice(pos);
		const noteName = file.extension === "md"
			? file.path.replace(/\.md$/, "")
			: file.path;

		const completed = `@[[${noteName}]]`;
		this.textareaEl.value =
			text.slice(0, mentionStart) + completed + afterCursor;

		const newPos = mentionStart + completed.length;
		this.textareaEl.selectionStart = newPos;
		this.textareaEl.selectionEnd = newPos;

		this.hideSuggestions();
		this.textareaEl.focus();
		this.autoResize();
		this.onInputChange(this.textareaEl.value);
	}

	private handleSuggestKeydown(e: KeyboardEvent): boolean {
		if (this.suggestions.length === 0) return false;

		if (e.key === "ArrowDown") {
			e.preventDefault();
			const next = Math.min(this.activeSuggestionIndex + 1, this.suggestions.length - 1);
			this.setActiveSuggestion(next);
			return true;
		}

		if (e.key === "ArrowUp") {
			e.preventDefault();
			const prev = Math.max(this.activeSuggestionIndex - 1, 0);
			this.setActiveSuggestion(prev);
			return true;
		}

		if (e.key === "Enter" || e.key === "Tab") {
			if (this.activeSuggestionIndex >= 0) {
				e.preventDefault();
				this.acceptSuggestion(this.activeSuggestionIndex);
				return true;
			}
			if (e.key === "Tab" && this.suggestions.length > 0) {
				e.preventDefault();
				this.acceptSuggestion(0);
				return true;
			}
		}

		if (e.key === "Escape") {
			e.preventDefault();
			this.hideSuggestions();
			return true;
		}

		return false;
	}

	// ---- Slash Command Autocomplete ----

	private checkSlashTrigger(): void {
		const text = this.textareaEl.value;
		const pos = this.textareaEl.selectionStart;
		const beforeCursor = text.slice(0, pos);

		if (this.suggestions.length > 0) return;

		const slashMatch = beforeCursor.match(/^\/(\w*)$/);
		if (!slashMatch) {
			this.hideSlashSuggestions();
			return;
		}

		const query = slashMatch[1];
		this.showSlashSuggestions(query);
	}

	private showSlashSuggestions(query: string): void {
		this.slashSuggestions = filterCommands(query);
		if (this.slashSuggestions.length === 0) {
			this.hideSlashSuggestions();
			return;
		}

		this.slashSuggestEl.empty();
		this.slashSuggestEl.style.display = "";
		this.activeSlashIndex = -1;

		for (let i = 0; i < this.slashSuggestions.length; i++) {
			const cmd = this.slashSuggestions[i];
			const item = this.slashSuggestEl.createDiv({ cls: "arcana-slash-item" });

			const iconEl = item.createSpan({ cls: "arcana-slash-icon" });
			setIcon(iconEl, cmd.icon);

			const textEl = item.createDiv({ cls: "arcana-slash-text" });
			textEl.createSpan({ text: `/${cmd.name}`, cls: "arcana-slash-name" });
			textEl.createSpan({ text: cmd.description, cls: "arcana-slash-desc" });

			item.addEventListener("click", () => this.acceptSlashSuggestion(i));
			item.addEventListener("mouseenter", () => this.setActiveSlash(i));
		}
	}

	private hideSlashSuggestions(): void {
		this.slashSuggestEl.style.display = "none";
		this.slashSuggestEl.empty();
		this.slashSuggestions = [];
		this.activeSlashIndex = -1;
	}

	private setActiveSlash(index: number): void {
		const items = this.slashSuggestEl.querySelectorAll(".arcana-slash-item");
		items.forEach((el) => el.removeClass("is-selected"));
		this.activeSlashIndex = index;
		if (index >= 0 && index < items.length) {
			items[index].addClass("is-selected");
		}
	}

	private acceptSlashSuggestion(index: number): void {
		const cmd = this.slashSuggestions[index];
		if (!cmd) return;

		this.textareaEl.value = `/${cmd.name} `;
		const newPos = this.textareaEl.value.length;
		this.textareaEl.selectionStart = newPos;
		this.textareaEl.selectionEnd = newPos;

		this.hideSlashSuggestions();
		this.textareaEl.focus();
		this.autoResize();
		this.onInputChange(this.textareaEl.value);
	}

	private handleSlashKeydown(e: KeyboardEvent): boolean {
		if (this.slashSuggestions.length === 0) return false;

		if (e.key === "ArrowDown") {
			e.preventDefault();
			const next = Math.min(this.activeSlashIndex + 1, this.slashSuggestions.length - 1);
			this.setActiveSlash(next);
			return true;
		}

		if (e.key === "ArrowUp") {
			e.preventDefault();
			const prev = Math.max(this.activeSlashIndex - 1, 0);
			this.setActiveSlash(prev);
			return true;
		}

		if (e.key === "Enter" || e.key === "Tab") {
			if (this.activeSlashIndex >= 0) {
				e.preventDefault();
				this.acceptSlashSuggestion(this.activeSlashIndex);
				return true;
			}
			if (e.key === "Tab" && this.slashSuggestions.length > 0) {
				e.preventDefault();
				this.acceptSlashSuggestion(0);
				return true;
			}
		}

		if (e.key === "Escape") {
			e.preventDefault();
			this.hideSlashSuggestions();
			return true;
		}

		return false;
	}
}
