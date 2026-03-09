import type {
	AI_PROVIDERS,
	TASK_STATUSES,
	TASK_PRIORITIES,
	VOICE_PROVIDERS,
	CHRONOTYPES,
	NOTIFICATION_LEVELS,
} from "./constants";

export type AIProviderType = typeof AI_PROVIDERS[keyof typeof AI_PROVIDERS];
export type TaskStatus = typeof TASK_STATUSES[number];
export type TaskPriority = typeof TASK_PRIORITIES[number];
export type VoiceProviderType = typeof VOICE_PROVIDERS[keyof typeof VOICE_PROVIDERS];
export type ChronotypeType = typeof CHRONOTYPES[keyof typeof CHRONOTYPES];
export type NotificationLevel = typeof NOTIFICATION_LEVELS[keyof typeof NOTIFICATION_LEVELS];

export interface ChatMessage {
	role: "user" | "assistant" | "system";
	content: string;
	timestamp: number;
}

export interface ChatOptions {
	model?: string;
	temperature?: number;
	maxTokens?: number;
	systemPrompt?: string;
}

export interface AIProvider {
	id: string;
	name: string;
	chat(messages: ChatMessage[], options: ChatOptions): AsyncGenerator<string>;
	embed?(text: string): Promise<number[]>;
	transcribe?(audio: Blob): Promise<string>;
	isConfigured(): boolean;
}

export interface TaskFrontmatter {
	title: string;
	status: TaskStatus;
	priority: TaskPriority;
	created: string;
	due?: string;
	scheduled?: string;
	completed?: string;
	tags?: string[];
	context?: string;
	time_estimate?: number;
	actual_time?: number;
	difficulty?: "easy" | "medium" | "hard";
	trigger?: string;
	parent_task?: string;
	subtask_progress?: string;
	recurrence?: string;
	depends_on?: string[];
}

export interface FolderDecoration {
	icon?: string;
	color?: string;
	textColor?: string;
	bold?: boolean;
	italic?: boolean;
	opacity?: number;
}

export interface MCPServerConfig {
	name: string;
	command: string;
	args: string[];
	env: Record<string, string>;
	enabled: boolean;
	url?: string;
}
