import { Notice, Plugin, TFile, normalizePath } from "obsidian";
import { ArcanaSettingTab, DEFAULT_SETTINGS } from "./settings";
import { parseTimeEstimate, formatTimeEstimate } from "./utils/frontmatter";
import type { ArcanaSettings } from "./settings";
import { AIEngine } from "./core/ai/ai-engine";
import { VaultIntel } from "./core/vault/vault-intel";
import { NoteCreator } from "./core/vault/note-creator";
import { TaskParser, extractTasksFromContent } from "./core/vault/task-parser";
import { TaskScanner } from "./core/vault/task-scanner";
import { TaskLifecycle } from "./core/vault/task-lifecycle";
import { TaskChunking } from "./core/vault/task-chunking";
import { TriggerMonitor } from "./core/vault/trigger-monitor";
import { FocusTracker } from "./core/vault/focus-tracker";
import { addEstimationRecord } from "./core/vault/estimation-tracker";
import { ChatHistory } from "./core/chat-history";
import { SkillLoader } from "./core/commands/skill-loader";
import { SkillRunner } from "./core/commands/skill-runner";
import { ChatView } from "./ui/chat/ChatView";
import { TaskModal } from "./ui/tasks/TaskModal";
import { QuickTaskModal } from "./ui/tasks/QuickTaskModal";
import { ExtractTasksModal } from "./ui/tasks/ExtractTasksModal";
import { ActualTimeModal } from "./ui/tasks/ActualTimeModal";
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
	taskLifecycle!: TaskLifecycle;
	taskChunking!: TaskChunking;
	focusTracker!: FocusTracker;
	triggerMonitor!: TriggerMonitor;
	chatHistory!: ChatHistory;
	skillLoader!: SkillLoader;
	skillRunner!: SkillRunner;
	private triggerRefreshTimer: number | null = null;

	async onload() {
		await this.loadSettings();

		this.aiEngine = new AIEngine(() => this.settings);
		this.vaultIntel = new VaultIntel(this.app, this.aiEngine);
		this.noteCreator = new NoteCreator(this.app, this.vaultIntel);
		this.taskParser = new TaskParser(this.aiEngine);
		this.taskScanner = new TaskScanner(this.app, () => this.settings);
		this.taskLifecycle = new TaskLifecycle(
			this.app,
			this.noteCreator,
			this.taskScanner,
			() => this.settings,
		);
		this.taskChunking = new TaskChunking(
			this.app,
			this.aiEngine,
			this.noteCreator,
			this.taskScanner,
			() => this.settings,
		);
		this.taskLifecycle.setTaskChunking(this.taskChunking);
		this.focusTracker = new FocusTracker();
		this.triggerMonitor = new TriggerMonitor(
			this.taskScanner,
			() => this.settings,
		);
		this.taskLifecycle.onTaskComplete((title) => {
			this.triggerMonitor.onTaskCompleted(title);
		});
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

		this.addCommand({
			id: "generate-task-views",
			name: "Generate task views",
			callback: () => this.generateTaskViews(),
		});

		this.addCommand({
			id: "complete-task",
			name: "Complete current task",
			checkCallback: (checking) => {
				const file = this.taskLifecycle.getActiveTaskFile();
				if (!file) return false;
				if (checking) return true;
				this.completeCurrentTask(file);
				return true;
			},
		});

		this.addCommand({
			id: "extract-tasks",
			name: "Extract tasks from current note",
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file || file.extension !== "md") return false;
				if (checking) return true;
				this.extractTasksFromActiveNote(file);
				return true;
			},
		});

		this.addCommand({
			id: "break-down-task",
			name: "Break down current task into subtasks",
			checkCallback: (checking) => {
				const file = this.taskChunking.getActiveChunkableFile();
				if (!file) return false;
				if (checking) return true;
				this.breakDownTask(file);
				return true;
			},
		});

		this.addSettingTab(new ArcanaSettingTab(this.app, this));

		this.registerVaultEvents();
		this.registerCommandWatcher();

		this.app.workspace.onLayoutReady(() => {
			this.loadCustomCommands();
			this.taskLifecycle.initializeStatusCache();
			this.triggerMonitor.scheduleTimeReminders();
			this.registerPropertyTypes();
		});
	}

	onunload() {
		clearCustomCommands();
		this.triggerMonitor.destroy();
		if (this.triggerRefreshTimer != null) {
			window.clearTimeout(this.triggerRefreshTimer);
		}
	}

	/**
	 * Register frontmatter property types so Obsidian displays
	 * the correct icons and widgets in the Properties panel.
	 */
	private registerPropertyTypes(): void {
		const types: Record<string, string> = {
			parent_task: "text",
			subtask_progress: "text",
			time_estimate: "text",
			actual_time: "text",
			status: "text",
			priority: "text",
			context: "text",
			difficulty: "text",
			trigger: "text",
			recurrence: "text",
		};

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const mgr = (this.app as any).metadataTypeManager;
		if (!mgr || typeof mgr.setType !== "function") return;

		for (const [key, type] of Object.entries(types)) {
			try {
				mgr.setType(key, type);
			} catch {
				// Internal API may change across versions
			}
		}
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
			this.app.metadataCache.on("changed", (file) => {
				invalidate();
				if (file instanceof TFile) {
					this.taskLifecycle.onMetadataChange(file);
				}
				this.debounceTriggerRefresh();
			}),
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

	private debounceTriggerRefresh(): void {
		if (this.triggerRefreshTimer != null) {
			window.clearTimeout(this.triggerRefreshTimer);
		}
		this.triggerRefreshTimer = window.setTimeout(() => {
			this.triggerRefreshTimer = null;
			this.triggerMonitor.refresh();
		}, 2000);
	}

	private openTaskModal(): void {
		const aiConfigured = this.aiEngine.getActiveProvider().isConfigured();
		new TaskModal(this.app, {
			noteCreator: this.noteCreator,
			taskFolder: this.settings.taskFolderPath,
			defaultStatus: this.settings.defaultTaskStatus,
			defaultPriority: this.settings.defaultTaskPriority,
			estimationData: this.settings.timeEstimationTraining
				? this.settings.estimationData
				: undefined,
			autoAdjustEstimates: this.settings.autoAdjustEstimates,
			taskParser: aiConfigured ? this.taskParser : undefined,
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

	private async completeCurrentTask(file: TFile): Promise<void> {
		const cache = this.app.metadataCache.getFileCache(file);
		if (cache?.frontmatter?.status === "done") {
			new Notice("This task is already marked as done.");
			return;
		}

		const title = cache?.frontmatter?.title ?? file.basename;
		const estimate = parseTimeEstimate(
			cache?.frontmatter?.time_estimate,
		);
		const rawDifficulty = cache?.frontmatter?.difficulty;
		const difficulty =
			typeof rawDifficulty === "string" &&
			["easy", "medium", "hard"].includes(rawDifficulty)
				? (rawDifficulty as "easy" | "medium" | "hard")
				: undefined;

		const deps = await this.taskLifecycle.checkDependencies(file);
		if (!deps.met) {
			const names = deps.pending
				.map((d) => d.title)
				.join(", ");
			new Notice(
				`Warning: unmet dependencies: ${names}. Completing anyway.`,
			);
		}

		try {
			await this.taskLifecycle.completeTask(file);
			new Notice(`Task completed: ${title}`);
			this.showTaskCompletionAnimation();
			this.triggerMonitor.onTaskCompleted(title);

			if (this.settings.timeEstimationTraining) {
				await this.delay(800);
				await this.promptActualTime(
					file,
					title,
					estimate,
					difficulty,
				);
			}
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			new Notice(`Failed to complete task: ${msg}`);
		}
	}

	private async promptActualTime(
		file: TFile,
		title: string,
		estimate: number | null,
		difficulty: "easy" | "medium" | "hard" | undefined,
	): Promise<void> {
		const focusMinutes = this.focusTracker.getElapsedMinutes(file.path);
		const modal = new ActualTimeModal(this.app, title, focusMinutes);
		const actualMinutes = await modal.prompt();

		if (actualMinutes != null) {
			const formattedActual = formatTimeEstimate(actualMinutes);
			await this.app.fileManager.processFrontMatter(file, (fm) => {
				fm.actual_time = formattedActual;
			});

			await this.recordEstimationAccuracy(
				estimate,
				actualMinutes,
				difficulty,
			);
		}

		this.focusTracker.clear(file.path);
	}

	private async recordEstimationAccuracy(
		estimate: number | null,
		actual: number,
		difficulty?: "easy" | "medium" | "hard",
	): Promise<void> {
		if (estimate == null || estimate <= 0) return;

		this.settings.estimationData = addEstimationRecord(
			this.settings.estimationData,
			estimate,
			actual,
			difficulty,
		);
		await this.saveSettings();
	}

	private showTaskCompletionAnimation(): void {
		const overlay = document.createElement("div");
		overlay.addClass("arcana-subtask-complete-overlay");

		const checkmark = document.createElement("div");
		checkmark.addClass("arcana-subtask-complete-checkmark");
		overlay.appendChild(checkmark);

		document.body.appendChild(overlay);

		window.setTimeout(() => {
			overlay.remove();
		}, 1200);
	}

	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => window.setTimeout(resolve, ms));
	}

	private async extractTasksFromActiveNote(file: TFile): Promise<void> {
		const provider = this.aiEngine.getActiveProvider();
		if (!provider.isConfigured()) {
			new Notice(
				"AI provider is not configured. Set up an AI provider in Arcana settings.",
			);
			return;
		}

		new Notice("Analyzing note for action items...");

		try {
			const content = await this.app.vault.read(file);
			const items = await extractTasksFromContent(
				this.aiEngine,
				content,
			);

			if (items.length === 0) {
				new Notice("No action items detected in this note.");
				return;
			}

			new ExtractTasksModal(this.app, items, {
				noteCreator: this.noteCreator,
				taskFolder: this.settings.taskFolderPath,
				defaultStatus: this.settings.defaultTaskStatus,
				defaultPriority: this.settings.defaultTaskPriority,
			}).open();
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			new Notice(`Failed to extract tasks: ${msg}`);
		}
	}

	private async breakDownTask(file: TFile): Promise<void> {
		const provider = this.aiEngine.getActiveProvider();
		if (!provider.isConfigured()) {
			new Notice(
				"AI provider is not configured. Set up an AI provider in Arcana settings.",
			);
			return;
		}

		const progress = new Notice(
			"Breaking down task... this may take a moment.",
			0,
		);

		try {
			const subtasks = await this.taskChunking.generateSubtasks(file);
			if (subtasks.length === 0) {
				progress.hide();
				new Notice(
					"Could not generate subtasks. Try adding more detail to the task.",
				);
				return;
			}

			progress.setMessage(
				`Creating ${subtasks.length} subtask(s)...`,
			);

			const files = await this.taskChunking.createSubtasks(
				file,
				subtasks,
			);
			progress.hide();
			new Notice(
				`Created ${files.length} subtask(s) for this task.`,
			);
		} catch (e) {
			progress.hide();
			const msg = e instanceof Error ? e.message : String(e);
			new Notice(`Failed to break down task: ${msg}`);
		}
	}

	private async generateTaskViews(): Promise<void> {
		try {
			const { writeTaskViews } = await import("./utils/bases");
			const count = await writeTaskViews(
				this.app,
				this.settings.taskFolderPath,
				this.settings.taskViewsEnabled,
			);
			new Notice(
				count > 0
					? `Generated ${count} task view(s).`
					: "No task views enabled. Enable views in Arcana settings.",
			);
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			new Notice(`Failed to generate task views: ${msg}`);
			console.error("[Arcana] Task view generation failed:", e);
		}
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
