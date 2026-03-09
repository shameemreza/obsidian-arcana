import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import type ArcanaPlugin from "./main";
import {
	AI_PROVIDERS,
	TASK_STATUSES,
	TASK_PRIORITIES,
	VOICE_PROVIDERS,
	CHRONOTYPES,
	NOTIFICATION_LEVELS,
	DEFAULT_TASK_FOLDER,
	DEFAULT_CHAT_HISTORY_PATH,
	DEFAULT_DAILY_NOTE_FOLDER,
	DEFAULT_WEEKLY_NOTE_FOLDER,
	DEFAULT_MONTHLY_NOTE_FOLDER,
	FOCUS_PRESETS,
} from "./constants";
import type {
	AIProviderType,
	VoiceProviderType,
	ChronotypeType,
	NotificationLevel,
	FolderDecoration,
	MCPServerConfig,
} from "./types";

export interface ArcanaSettings {
	// General
	aiProvider: AIProviderType;
	anthropicApiKey: string;
	anthropicModel: string;
	geminiApiKey: string;
	geminiModel: string;
	ollamaEndpoint: string;
	ollamaModel: string;
	debugLogging: boolean;

	// Tasks
	taskFolderPath: string;
	additionalTaskFolders: string[];
	vaultWideTaskScan: boolean;
	defaultTaskStatus: string;
	defaultTaskPriority: string;

	// Voice
	voiceProvider: VoiceProviderType;
	voiceLanguage: string;
	autoProcessVoice: boolean;

	// Dashboard
	dashboardOnStartup: boolean;
	morningBriefingAuto: boolean;

	// Organization
	inboxFolderPath: string;
	autoTagMode: "always" | "suggest" | "never";
	autoFileSuggestions: boolean;

	// Calendar & periodic notes
	dailyNoteFolderPath: string;
	dailyNoteFormat: string;
	weeklyNoteFolderPath: string;
	weeklyNoteFormat: string;
	monthlyNoteFolderPath: string;
	monthlyNoteFormat: string;
	aiPopulatePeriodicNotes: boolean;

	// Folder customization
	showFolderIcons: boolean;
	showNoteCountBadges: boolean;
	folderDecorations: Record<string, FolderDecoration>;

	// Focus & wellbeing
	chronotype: ChronotypeType;
	focusWorkMinutes: number;
	focusBreakMinutes: number;
	flowProtection: boolean;
	aiBreakSuggestions: boolean;
	timeEstimationTraining: boolean;
	autoAdjustEstimates: boolean;
	timeNudgeMinutes: number;
	bodyDoubleInterval: number;
	energyCheckIn: boolean;
	streakTracking: boolean;
	streakGraceDays: number;
	completionFeedbackSound: boolean;
	notificationLevel: NotificationLevel;
	spacedReview: boolean;
	eveningReviewTime: string;

	// MCP
	mcpEnabled: boolean;
	mcpServers: MCPServerConfig[];

	// Privacy
	contextScope: "note" | "folder" | "vault";
	maxContextTokens: number;
	chatHistoryPath: string;
}

export const DEFAULT_SETTINGS: ArcanaSettings = {
	// General
	aiProvider: AI_PROVIDERS.ANTHROPIC,
	anthropicApiKey: "",
	anthropicModel: "claude-sonnet-4-6",
	geminiApiKey: "",
	geminiModel: "gemini-2.0-flash",
	ollamaEndpoint: "http://localhost:11434",
	ollamaModel: "llama3",
	debugLogging: false,

	// Tasks
	taskFolderPath: DEFAULT_TASK_FOLDER,
	additionalTaskFolders: [],
	vaultWideTaskScan: true,
	defaultTaskStatus: "inbox",
	defaultTaskPriority: "medium",

	// Voice
	voiceProvider: VOICE_PROVIDERS.WEB_SPEECH,
	voiceLanguage: "en-US",
	autoProcessVoice: true,

	// Dashboard
	dashboardOnStartup: false,
	morningBriefingAuto: true,

	// Organization
	inboxFolderPath: "Inbox",
	autoTagMode: "suggest",
	autoFileSuggestions: true,

	// Calendar & periodic notes
	dailyNoteFolderPath: DEFAULT_DAILY_NOTE_FOLDER,
	dailyNoteFormat: "YYYY-MM-DD",
	weeklyNoteFolderPath: DEFAULT_WEEKLY_NOTE_FOLDER,
	weeklyNoteFormat: "YYYY-[W]ww",
	monthlyNoteFolderPath: DEFAULT_MONTHLY_NOTE_FOLDER,
	monthlyNoteFormat: "YYYY-MM",
	aiPopulatePeriodicNotes: true,

	// Folder customization
	showFolderIcons: true,
	showNoteCountBadges: false,
	folderDecorations: {},

	// Focus & wellbeing
	chronotype: CHRONOTYPES.NEUTRAL,
	focusWorkMinutes: FOCUS_PRESETS.STANDARD.work,
	focusBreakMinutes: FOCUS_PRESETS.STANDARD.break,
	flowProtection: true,
	aiBreakSuggestions: true,
	timeEstimationTraining: true,
	autoAdjustEstimates: false,
	timeNudgeMinutes: 45,
	bodyDoubleInterval: 15,
	energyCheckIn: true,
	streakTracking: true,
	streakGraceDays: 1,
	completionFeedbackSound: false,
	notificationLevel: NOTIFICATION_LEVELS.NORMAL,
	spacedReview: false,
	eveningReviewTime: "",

	// MCP
	mcpEnabled: false,
	mcpServers: [],

	// Privacy
	contextScope: "note",
	maxContextTokens: 4000,
	chatHistoryPath: DEFAULT_CHAT_HISTORY_PATH,
};

export class ArcanaSettingTab extends PluginSettingTab {
	plugin: ArcanaPlugin;

	constructor(app: App, plugin: ArcanaPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// --- General ---
		new Setting(containerEl).setName("General").setHeading();

		new Setting(containerEl)
			.setName("AI provider")
			.setDesc("Select the AI provider to use for chat and intelligence features.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption(AI_PROVIDERS.ANTHROPIC, "Anthropic (Claude)")
					.addOption(AI_PROVIDERS.GEMINI, "Google Gemini")
					.addOption(AI_PROVIDERS.OLLAMA, "Ollama (local)")
					.setValue(this.plugin.settings.aiProvider)
					.onChange(async (value) => {
						this.plugin.settings.aiProvider = value as AIProviderType;
						await this.plugin.saveSettings();
						this.display();
					})
			);

		if (this.plugin.settings.aiProvider === AI_PROVIDERS.ANTHROPIC) {
			new Setting(containerEl)
				.setName("Anthropic API key")
				.setDesc("Your Anthropic API key.")
				.addText((text) =>
					text
						.setPlaceholder("sk-ant-...")
						.setValue(this.plugin.settings.anthropicApiKey)
						.onChange(async (value) => {
							this.plugin.settings.anthropicApiKey = value;
							await this.plugin.saveSettings();
						})
				);

			new Setting(containerEl)
				.setName("Anthropic model")
				.setDesc("Model to use for chat.")
				.addText((text) =>
					text
						.setPlaceholder("claude-sonnet-4-6")
						.setValue(this.plugin.settings.anthropicModel)
						.onChange(async (value) => {
							this.plugin.settings.anthropicModel = value;
							await this.plugin.saveSettings();
						})
				);
		}

		if (this.plugin.settings.aiProvider === AI_PROVIDERS.GEMINI) {
			new Setting(containerEl)
				.setName("Gemini API key")
				.setDesc("Your Google AI Studio API key.")
				.addText((text) =>
					text
						.setPlaceholder("AIza...")
						.setValue(this.plugin.settings.geminiApiKey)
						.onChange(async (value) => {
							this.plugin.settings.geminiApiKey = value;
							await this.plugin.saveSettings();
						})
				);

			new Setting(containerEl)
				.setName("Gemini model")
				.setDesc("Model to use for chat.")
				.addText((text) =>
					text
						.setPlaceholder("gemini-2.0-flash")
						.setValue(this.plugin.settings.geminiModel)
						.onChange(async (value) => {
							this.plugin.settings.geminiModel = value;
							await this.plugin.saveSettings();
						})
				);
		}

		if (this.plugin.settings.aiProvider === AI_PROVIDERS.OLLAMA) {
			new Setting(containerEl)
				.setName("Ollama endpoint")
				.setDesc("URL of your Ollama instance.")
				.addText((text) =>
					text
						.setPlaceholder("http://localhost:11434")
						.setValue(this.plugin.settings.ollamaEndpoint)
						.onChange(async (value) => {
							this.plugin.settings.ollamaEndpoint = value;
							await this.plugin.saveSettings();
						})
				);

			new Setting(containerEl)
				.setName("Ollama model")
				.setDesc("Model name available on your Ollama instance.")
				.addText((text) =>
					text
						.setPlaceholder("llama3")
						.setValue(this.plugin.settings.ollamaModel)
						.onChange(async (value) => {
							this.plugin.settings.ollamaModel = value;
							await this.plugin.saveSettings();
						})
				);
		}

		new Setting(containerEl)
			.setName("Test connection")
			.setDesc("Verify your AI provider configuration works.")
			.addButton((btn) =>
				btn.setButtonText("Test").onClick(async () => {
					btn.setButtonText("Testing…");
					btn.setDisabled(true);
					try {
						const result =
							await this.plugin.aiEngine.testConnection();
						new Notice(
							result.ok
								? `OK: ${result.message}`
								: `Error: ${result.message}`,
						);
					} catch (error) {
						const msg =
							error instanceof Error
								? error.message
								: String(error);
						new Notice(`Error: ${msg}`);
					}
					btn.setDisabled(false);
					btn.setButtonText("Test");
				}),
			);

		new Setting(containerEl)
			.setName("Debug logging")
			.setDesc("Enable verbose logging to the developer console.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.debugLogging)
					.onChange(async (value) => {
						this.plugin.settings.debugLogging = value;
						await this.plugin.saveSettings();
					})
			);

		// --- Custom Commands ---
		new Setting(containerEl).setName("Custom commands").setHeading();

		const cmdDesc = containerEl.createDiv({ cls: "setting-item-description" });
		cmdDesc.style.marginBottom = "1em";
		cmdDesc.innerHTML =
			"Create your own slash commands as markdown files in <code>.arcana/commands/</code>. " +
			"Each file defines a goal, tools, and instructions. The AI acts as an agent " +
			"that reasons about which tools to call and produces a final result.";

		const stepsEl = containerEl.createDiv({ cls: "setting-item-description" });
		stepsEl.style.marginBottom = "1em";
		stepsEl.innerHTML = [
			"<strong>How to add a custom command:</strong>",
			"<ol style='margin:0.5em 0 0.5em 1.2em;padding:0;'>",
			"<li>Open your vault folder in your OS file manager (Finder, Explorer, etc.).</li>",
			"<li>Show hidden files - on macOS press <code>Cmd+Shift+.</code>, " +
			"on Windows enable <strong>Hidden items</strong> in the View menu.</li>",
			"<li>Navigate to <code>.arcana/commands/</code> inside your vault.</li>",
			"<li>Create a new <code>.md</code> file (or copy one of the examples).</li>",
			"<li>Add YAML frontmatter with <code>name</code>, <code>description</code>, " +
			"<code>icon</code>, <code>output</code>, and <code>tools</code>, " +
			"then write your instructions below the frontmatter.</li>",
			"<li>Save the file. Arcana picks it up automatically and the new " +
			"<code>/command</code> appears in the slash menu.</li>",
			"</ol>",
			'This is the same process as accessing the <code>.obsidian</code> folder. ' +
			'See <a href="https://help.obsidian.md/configuration-folder">Configuration folder</a> ' +
			"in the Obsidian docs for more details.<br><br>" +
			'<strong>Tip:</strong> The community plugin ' +
			'<a href="https://github.com/polyipseity/obsidian-show-hidden-files">Show Hidden Files</a> ' +
			"makes dotfolders like <code>.arcana</code> visible directly in Obsidian's file explorer.",
		].join("");

		const commandCountEl = containerEl.createDiv({ cls: "arcana-settings-commands-empty" });
		this.renderCommandCount(commandCountEl);

		// --- Tasks ---
		new Setting(containerEl).setName("Tasks").setHeading();

		new Setting(containerEl)
			.setName("Task folder")
			.setDesc("Folder where new task notes are created.")
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_TASK_FOLDER)
					.setValue(this.plugin.settings.taskFolderPath)
					.onChange(async (value) => {
						this.plugin.settings.taskFolderPath = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Vault-wide task discovery")
			.setDesc(
				"Scan all markdown files for notes with Arcana task frontmatter, regardless of which folder they live in.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.vaultWideTaskScan)
					.onChange(async (value) => {
						this.plugin.settings.vaultWideTaskScan = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Additional task folders")
			.setDesc(
				"Extra folders to scan for tasks (comma-separated). Useful if you keep project-specific tasks in separate folders.",
			)
			.addText((text) =>
				text
					.setPlaceholder("Projects/, Work/")
					.setValue(this.plugin.settings.additionalTaskFolders.join(", "))
					.onChange(async (value) => {
						this.plugin.settings.additionalTaskFolders = value
							.split(",")
							.map((s) => s.trim())
							.filter((s) => s.length > 0);
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Default task status")
			.setDesc("Status assigned to newly created tasks.")
			.addDropdown((dropdown) => {
				for (const s of TASK_STATUSES) {
					dropdown.addOption(s, s.charAt(0).toUpperCase() + s.slice(1));
				}
				dropdown
					.setValue(this.plugin.settings.defaultTaskStatus)
					.onChange(async (value) => {
						this.plugin.settings.defaultTaskStatus = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Default task priority")
			.setDesc("Priority assigned to newly created tasks.")
			.addDropdown((dropdown) => {
				for (const p of TASK_PRIORITIES) {
					dropdown.addOption(p, p.charAt(0).toUpperCase() + p.slice(1));
				}
				dropdown
					.setValue(this.plugin.settings.defaultTaskPriority)
					.onChange(async (value) => {
						this.plugin.settings.defaultTaskPriority = value;
						await this.plugin.saveSettings();
					});
			});

		// --- Voice ---
		new Setting(containerEl).setName("Voice").setHeading();

		new Setting(containerEl)
			.setName("Voice provider")
			.setDesc("Speech recognition engine to use.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption(VOICE_PROVIDERS.WEB_SPEECH, "Web Speech API (free)")
					.addOption(VOICE_PROVIDERS.WHISPER_CLOUD, "OpenAI Whisper (cloud)")
					.addOption(VOICE_PROVIDERS.WHISPER_LOCAL, "Local Whisper (desktop only)")
					.setValue(this.plugin.settings.voiceProvider)
					.onChange(async (value) => {
						this.plugin.settings.voiceProvider = value as VoiceProviderType;
						await this.plugin.saveSettings();
					})
			);

		// --- Dashboard ---
		new Setting(containerEl).setName("Dashboard").setHeading();

		new Setting(containerEl)
			.setName("Open on startup")
			.setDesc("Automatically open the dashboard when Obsidian starts.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.dashboardOnStartup)
					.onChange(async (value) => {
						this.plugin.settings.dashboardOnStartup = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Auto morning briefing")
			.setDesc("Generate a morning briefing on first dashboard open of the day.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.morningBriefingAuto)
					.onChange(async (value) => {
						this.plugin.settings.morningBriefingAuto = value;
						await this.plugin.saveSettings();
					})
			);

		// --- Focus & wellbeing ---
		new Setting(containerEl).setName("Focus & wellbeing").setHeading();

		new Setting(containerEl)
			.setName("Chronotype")
			.setDesc("Your natural energy rhythm, used for smart scheduling.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption(CHRONOTYPES.MORNING_LARK, "Morning lark")
					.addOption(CHRONOTYPES.NEUTRAL, "Neutral")
					.addOption(CHRONOTYPES.NIGHT_OWL, "Night owl")
					.setValue(this.plugin.settings.chronotype)
					.onChange(async (value) => {
						this.plugin.settings.chronotype = value as ChronotypeType;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Focus work duration")
			.setDesc("Work interval in minutes for focus timer.")
			.addSlider((slider) =>
				slider
					.setLimits(5, 90, 5)
					.setValue(this.plugin.settings.focusWorkMinutes)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.focusWorkMinutes = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Focus break duration")
			.setDesc("Break interval in minutes for focus timer.")
			.addSlider((slider) =>
				slider
					.setLimits(1, 30, 1)
					.setValue(this.plugin.settings.focusBreakMinutes)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.focusBreakMinutes = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Flow protection")
			.setDesc("Defer break notifications if you are actively typing.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.flowProtection)
					.onChange(async (value) => {
						this.plugin.settings.flowProtection = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Streak tracking")
			.setDesc("Track daily task completion streaks with a grace period.")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.streakTracking)
					.onChange(async (value) => {
						this.plugin.settings.streakTracking = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Notification level")
			.setDesc("Controls how many nudges and suggestions Arcana shows.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption(NOTIFICATION_LEVELS.NONE, "None")
					.addOption(NOTIFICATION_LEVELS.MINIMAL, "Minimal (ADHD-friendly)")
					.addOption(NOTIFICATION_LEVELS.NORMAL, "Normal")
					.addOption(NOTIFICATION_LEVELS.VERBOSE, "Verbose")
					.setValue(this.plugin.settings.notificationLevel)
					.onChange(async (value) => {
						this.plugin.settings.notificationLevel = value as NotificationLevel;
						await this.plugin.saveSettings();
					})
			);

		// --- Privacy ---
		new Setting(containerEl).setName("Privacy").setHeading();

		new Setting(containerEl)
			.setName("Context scope")
			.setDesc("What vault content is sent to the AI provider.")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("note", "Current note only")
					.addOption("folder", "Current folder")
					.addOption("vault", "Entire vault (searched)")
					.setValue(this.plugin.settings.contextScope)
					.onChange(async (value) => {
						this.plugin.settings.contextScope = value as "note" | "folder" | "vault";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Maximum context tokens")
			.setDesc("Limit the amount of vault content sent to AI per request.")
			.addSlider((slider) =>
				slider
					.setLimits(1000, 16000, 500)
					.setValue(this.plugin.settings.maxContextTokens)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.maxContextTokens = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Chat history folder")
			.setDesc("Vault path where chat conversations are stored.")
			.addText((text) =>
				text
					.setPlaceholder(DEFAULT_CHAT_HISTORY_PATH)
					.setValue(this.plugin.settings.chatHistoryPath)
					.onChange(async (value) => {
						this.plugin.settings.chatHistoryPath = value;
						await this.plugin.saveSettings();
					})
			);
	}

	private async renderCommandCount(el: HTMLElement): Promise<void> {
		try {
			const commands = await this.plugin.skillLoader.loadAll();
			if (commands.length === 0) {
				el.setText(
					"No custom commands found. Add .md files to .arcana/commands/ to create them.",
				);
			} else {
				const names = commands.map((c) => `/${c.name}`).join(", ");
				el.setText(`${commands.length} command(s) loaded: ${names}`);
			}
		} catch {
			el.setText("No custom commands found. Add .md files to .arcana/commands/ to create them.");
		}
	}
}
