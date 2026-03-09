export const PLUGIN_ID = "obsidian-arcana";
export const PLUGIN_NAME = "Arcana";

export const VIEW_TYPE_CHAT = "arcana-chat";
export const VIEW_TYPE_DASHBOARD = "arcana-dashboard";
export const VIEW_TYPE_DAY_PLANNER = "arcana-day-planner";

export const DEFAULT_TASK_FOLDER = "Tasks";
export const DEFAULT_CHAT_HISTORY_PATH = ".arcana/chats";
export const DEFAULT_COMMANDS_PATH = ".arcana/commands";
export const DEFAULT_DAILY_NOTE_FOLDER = "Daily Notes";
export const DEFAULT_WEEKLY_NOTE_FOLDER = "Weekly Notes";
export const DEFAULT_MONTHLY_NOTE_FOLDER = "Monthly Notes";

export const AI_PROVIDERS = {
	ANTHROPIC: "anthropic",
	GEMINI: "gemini",
	OLLAMA: "ollama",
} as const;

export const TASK_STATUSES = [
	"inbox",
	"todo",
	"doing",
	"waiting",
	"done",
	"cancelled",
] as const;

export const TASK_PRIORITIES = [
	"urgent",
	"high",
	"medium",
	"low",
	"none",
] as const;

export const VOICE_PROVIDERS = {
	WEB_SPEECH: "web-speech",
	WHISPER_CLOUD: "whisper-cloud",
	WHISPER_LOCAL: "whisper-local",
} as const;

export const FOCUS_PRESETS = {
	ADHD_FRIENDLY: { work: 15, break: 5 },
	STANDARD: { work: 25, break: 5 },
	DEEP_WORK: { work: 50, break: 10 },
} as const;

export const CHRONOTYPES = {
	MORNING_LARK: "morning-lark",
	NEUTRAL: "neutral",
	NIGHT_OWL: "night-owl",
} as const;

export const NOTIFICATION_LEVELS = {
	NONE: "none",
	MINIMAL: "minimal",
	NORMAL: "normal",
	VERBOSE: "verbose",
} as const;
