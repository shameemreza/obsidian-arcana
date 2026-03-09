import { Plugin } from "obsidian";
import { ArcanaSettingTab, DEFAULT_SETTINGS } from "./settings";
import type { ArcanaSettings } from "./settings";
import { AIEngine } from "./core/ai/ai-engine";
import { VaultIntel } from "./core/vault/vault-intel";
import { NoteCreator } from "./core/vault/note-creator";
import { TaskParser } from "./core/vault/task-parser";

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

		this.addSettingTab(new ArcanaSettingTab(this.app, this));

		this.registerVaultEvents();
	}

	onunload() {
		// Cleanup handled by this.register* helpers
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
