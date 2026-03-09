import type ArcanaPlugin from "../../../main";
import type { ChatMessage } from "../../../types";

export interface SlashCommandContext {
	plugin: ArcanaPlugin;
	args: string;
	messages: ChatMessage[];
	addAssistantMessage: (content: string, streaming?: boolean) => HTMLElement;
	updateStreaming: (el: HTMLElement, content: string) => void;
	finalizeStreaming: (el: HTMLElement, content: string) => void;
	setInputEnabled: (enabled: boolean) => void;
	appendMessage: (msg: ChatMessage) => void;
}

export interface SlashCommand {
	name: string;
	description: string;
	icon: string;
	execute: (ctx: SlashCommandContext) => Promise<void>;
}
