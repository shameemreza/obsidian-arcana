import { Plugin } from "obsidian";
import { ArcanaSettingTab, DEFAULT_SETTINGS } from "./settings";
import type { ArcanaSettings } from "./settings";
import { AIEngine } from "./core/ai/ai-engine";
import { VaultIntel } from "./core/vault/vault-intel";
import { NoteCreator } from "./core/vault/note-creator";
import { TaskParser } from "./core/vault/task-parser";
import { ChatView } from "./ui/chat/ChatView";
import { VIEW_TYPE_CHAT } from "./constants";

export default class ArcanaPlugin extends Plugin {
	settings: ArcanaSettings = DEFAULT_SETTINGS;
	aiEngine!: AIEngine;
	vaultIntel!: VaultIntel;
	noteCreator!: NoteCreator;
	taskParser!: TaskParser;

	async onload() {
		await this.loadSettings();

		this.aiEngine = new AIEngine(() => this.settings);
		this.vaultIntel = new VaultIntel(this.app, this.aiEngine);
		this.noteCreator = new NoteCreator(this.app, this.vaultIntel);
		this.taskParser = new TaskParser(this.aiEngine);

		this.registerView(
			VIEW_TYPE_CHAT,
			(leaf) => new ChatView(leaf, this),
		);

		this.addRibbonIcon("sparkles", "Toggle Arcana Chat", () => {
			this.toggleChat();
		});

		this.addCommand({
			id: "toggle-chat",
			name: "Toggle chat panel",
			callback: () => this.toggleChat(),
		});

		this.addSettingTab(new ArcanaSettingTab(this.app, this));

		this.registerVaultEvents();
	}

	onunload() {
		// Cleanup handled by this.register* helpers
		// Don't detach leaves — let them reinitialize on plugin update
	}

	private registerVaultEvents(): void {
		const invalidate = () => this.vaultIntel.invalidate();

		this.registerEvent(this.app.vault.on("create", invalidate));
		this.registerEvent(this.app.vault.on("delete", invalidate));
		this.registerEvent(this.app.vault.on("rename", invalidate));
		this.registerEvent(
			this.app.metadataCache.on("changed", invalidate),
		);
	}

	private async toggleChat(): Promise<void> {
		const { workspace } = this.app;
		const existing = workspace.getLeavesOfType(VIEW_TYPE_CHAT);

		if (existing.length > 0) {
			workspace.detachLeavesOfType(VIEW_TYPE_CHAT);
			return;
		}

		const leaf = workspace.getRightLeaf(false);
		if (leaf) {
			await leaf.setViewState({
				type: VIEW_TYPE_CHAT,
				active: true,
			});
			workspace.revealLeaf(leaf);
		}
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData(),
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
