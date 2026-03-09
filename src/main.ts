import { Plugin, normalizePath } from "obsidian";
import { ArcanaSettingTab, DEFAULT_SETTINGS } from "./settings";
import type { ArcanaSettings } from "./settings";
import { AIEngine } from "./core/ai/ai-engine";
import { VaultIntel } from "./core/vault/vault-intel";
import { NoteCreator } from "./core/vault/note-creator";
import { TaskParser } from "./core/vault/task-parser";
import { TaskScanner } from "./core/vault/task-scanner";
import { ChatHistory } from "./core/chat-history";
import { SkillLoader } from "./core/commands/skill-loader";
import { SkillRunner } from "./core/commands/skill-runner";
import { ChatView } from "./ui/chat/ChatView";
import { TaskModal } from "./ui/tasks/TaskModal";
import { QuickTaskModal } from "./ui/tasks/QuickTaskModal";
import { VIEW_TYPE_CHAT, DEFAULT_COMMANDS_PATH } from "./constants";
import {
	registerCommands,
	clearCustomCommands,
} from "./ui/chat/slash-commands/registry";
import type { SlashCommand, SlashCommandContext } from "./ui/chat/slash-commands/types";
import type { CustomCommand } from "./core/commands/types";

export default class ArcanaPlugin extends Plugin {
	settings: ArcanaSettings = DEFAULT_SETTINGS;
	aiEngine!: AIEngine;
	vaultIntel!: VaultIntel;
	noteCreator!: NoteCreator;
	taskParser!: TaskParser;
	taskScanner!: TaskScanner;
	chatHistory!: ChatHistory;
	skillLoader!: SkillLoader;
	skillRunner!: SkillRunner;

	async onload() {
		await this.loadSettings();

		this.aiEngine = new AIEngine(() => this.settings);
		this.vaultIntel = new VaultIntel(this.app, this.aiEngine);
		this.noteCreator = new NoteCreator(this.app, this.vaultIntel);
		this.taskParser = new TaskParser(this.aiEngine);
		this.taskScanner = new TaskScanner(this.app, () => this.settings);
		this.chatHistory = new ChatHistory(
			this.app,
			() => this.settings,
			this.aiEngine,
		);
		this.skillLoader = new SkillLoader(this.app);
		this.skillRunner = new SkillRunner(
			this.app,
			this.aiEngine,
			this.noteCreator,
		);

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

		this.addCommand({
			id: "new-task",
			name: "New task",
			callback: () => this.openTaskModal(),
		});

		this.addCommand({
			id: "quick-task",
			name: "Quick task",
			callback: () => this.openQuickTask(),
		});

		this.addSettingTab(new ArcanaSettingTab(this.app, this));

		this.registerVaultEvents();
		this.registerCommandWatcher();

		this.app.workspace.onLayoutReady(() => {
			this.loadCustomCommands();
		});
	}

	onunload() {
		clearCustomCommands();
	}

	async loadCustomCommands(): Promise<void> {
		try {
			clearCustomCommands();
			const commands = await this.skillLoader.loadAll();
			const slashCommands = commands.map((cmd) =>
				this.wrapCustomCommand(cmd),
			);
			registerCommands(slashCommands);

			if (this.settings.debugLogging && commands.length > 0) {
				console.log(
					`[Arcana] Loaded ${commands.length} custom command(s):`,
					commands.map((c) => c.name).join(", "),
				);
			}
		} catch (e) {
			console.error("[Arcana] Failed to load custom commands:", e);
		}
	}

	private wrapCustomCommand(cmd: CustomCommand): SlashCommand {
		const runner = this.skillRunner;
		return {
			name: cmd.name,
			description: cmd.description,
			icon: cmd.icon,
			execute: async (ctx: SlashCommandContext): Promise<void> => {
				await runner.execute(cmd, ctx);
			},
		};
	}

	private registerVaultEvents(): void {
		const invalidate = () => {
			this.vaultIntel.invalidate();
			this.taskScanner.invalidate();
		};

		this.registerEvent(this.app.vault.on("create", invalidate));
		this.registerEvent(this.app.vault.on("delete", invalidate));
		this.registerEvent(this.app.vault.on("rename", invalidate));
		this.registerEvent(
			this.app.metadataCache.on("changed", invalidate),
		);
	}

	private registerCommandWatcher(): void {
		const commandsPath = normalizePath(DEFAULT_COMMANDS_PATH);

		const isInCommandsFolder = (path: string) =>
			path.startsWith(commandsPath + "/") && path.endsWith(".md");

		this.registerEvent(
			this.app.vault.on("create", (file) => {
				if (isInCommandsFolder(file.path)) this.loadCustomCommands();
			}),
		);
		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (isInCommandsFolder(file.path)) this.loadCustomCommands();
			}),
		);
		this.registerEvent(
			this.app.vault.on("delete", (file) => {
				if (isInCommandsFolder(file.path)) this.loadCustomCommands();
			}),
		);
		this.registerEvent(
			this.app.vault.on("rename", (file, oldPath) => {
				if (
					isInCommandsFolder(file.path) ||
					isInCommandsFolder(oldPath)
				) {
					this.loadCustomCommands();
				}
			}),
		);
	}

	private openTaskModal(): void {
		new TaskModal(this.app, {
			noteCreator: this.noteCreator,
			taskFolder: this.settings.taskFolderPath,
			defaultStatus: this.settings.defaultTaskStatus,
			defaultPriority: this.settings.defaultTaskPriority,
		}).open();
	}

	private openQuickTask(): void {
		new QuickTaskModal(this.app, {
			taskParser: this.taskParser,
			noteCreator: this.noteCreator,
			taskFolder: this.settings.taskFolderPath,
			defaultStatus: this.settings.defaultTaskStatus,
			defaultPriority: this.settings.defaultTaskPriority,
			useAI: this.aiEngine.getActiveProvider().isConfigured(),
		}).open();
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
