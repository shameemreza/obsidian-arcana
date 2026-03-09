import { type App, setIcon } from "obsidian";
import type { ArcanaSettings } from "../../settings";
import {
	type ContextMode,
	estimateContextTokens,
} from "../../core/ai/context";

interface ContextModeOption {
	mode: ContextMode;
	icon: string;
	label: string;
	description: string;
}

const MODES: ContextModeOption[] = [
	{ mode: "note", icon: "file-text", label: "Note", description: "Current note" },
	{ mode: "folder", icon: "folder-open", label: "Folder", description: "All notes in current folder" },
	{ mode: "vault", icon: "vault", label: "Vault", description: "Search entire vault" },
];

export class ContextPicker {
	private containerEl: HTMLElement;
	private app: App;
	private getSettings: () => ArcanaSettings;
	private mode: ContextMode;
	private onModeChange: (mode: ContextMode) => void;

	private contextLabelEl!: HTMLElement;
	private tokenCountEl!: HTMLElement;
	private modeButtons: Map<ContextMode, HTMLElement> = new Map();
	private refreshTimer: number | null = null;

	constructor(
		containerEl: HTMLElement,
		app: App,
		getSettings: () => ArcanaSettings,
		onModeChange: (mode: ContextMode) => void,
	) {
		this.containerEl = containerEl;
		this.app = app;
		this.getSettings = getSettings;
		this.mode = getSettings().contextScope;
		this.onModeChange = onModeChange;
		this.build();
	}

	getMode(): ContextMode {
		return this.mode;
	}

	refresh(): void {
		this.updateContextLabel();
		this.updateTokenCount("");
	}

	updateTokenCount(pendingText: string): void {
		if (this.refreshTimer !== null) {
			window.clearTimeout(this.refreshTimer);
		}
		this.refreshTimer = window.setTimeout(() => {
			this.refreshTimer = null;
			this.computeTokenCount(pendingText);
		}, 300);
	}

	destroy(): void {
		if (this.refreshTimer !== null) {
			window.clearTimeout(this.refreshTimer);
		}
	}

	private build(): void {
		this.containerEl.addClass("arcana-context-picker");

		const modesRow = this.containerEl.createDiv({ cls: "arcana-context-modes" });

		for (const opt of MODES) {
			const btn = modesRow.createEl("button", {
				cls: "arcana-context-mode-btn",
				attr: {
					"aria-label": opt.description,
					"data-mode": opt.mode,
				},
			});
			const iconSpan = btn.createSpan({ cls: "arcana-context-mode-icon" });
			setIcon(iconSpan, opt.icon);
			btn.createSpan({ text: opt.label, cls: "arcana-context-mode-label" });

			if (opt.mode === this.mode) {
				btn.addClass("is-active");
			}

			btn.addEventListener("click", () => this.setMode(opt.mode));
			this.modeButtons.set(opt.mode, btn);
		}

		const infoRow = this.containerEl.createDiv({ cls: "arcana-context-info" });

		this.contextLabelEl = infoRow.createSpan({ cls: "arcana-context-label" });
		this.tokenCountEl = infoRow.createSpan({ cls: "arcana-context-tokens" });

		this.updateContextLabel();
		this.computeTokenCount("");
	}

	private setMode(mode: ContextMode): void {
		if (mode === this.mode) return;

		this.modeButtons.get(this.mode)?.removeClass("is-active");
		this.mode = mode;
		this.modeButtons.get(this.mode)?.addClass("is-active");

		this.updateContextLabel();
		this.computeTokenCount("");
		this.onModeChange(mode);
	}

	private updateContextLabel(): void {
		const file = this.app.workspace.getActiveFile();

		let label = "";
		switch (this.mode) {
			case "note":
				label = file ? `Reading ${file.basename}` : "No note open";
				break;
			case "folder": {
				const folder = file?.parent;
				if (folder) {
					const count = folder.children.filter(
						(f) => "extension" in f && (f as { extension: string }).extension === "md",
					).length;
					label = `${folder.name || "Root"} — ${count} note${count !== 1 ? "s" : ""}`;
				} else {
					label = "No folder open";
				}
				break;
			}
			case "vault":
				label = "Vault-wide search";
				break;
		}

		this.contextLabelEl.setText(label);
	}

	private async computeTokenCount(pendingText: string): Promise<void> {
		try {
			const tokens = await estimateContextTokens(
				this.app,
				this.getSettings(),
				this.mode,
				pendingText,
			);
			const max = this.getSettings().maxContextTokens;
			const display = tokens >= 1000
				? `~${(tokens / 1000).toFixed(1)}k`
				: `~${tokens}`;

			this.tokenCountEl.setText(`${display} / ${max >= 1000 ? `${(max / 1000).toFixed(0)}k` : max} tokens`);
			this.tokenCountEl.toggleClass(
				"arcana-tokens-warning",
				tokens > max * 0.9,
			);
		} catch {
			this.tokenCountEl.setText("");
		}
	}
}
