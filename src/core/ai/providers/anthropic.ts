import type { AIProvider, ChatMessage, ChatOptions } from "../../../types";
import { fetchStreaming, parseSSE, withRetry } from "../streaming";

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
const DEFAULT_MAX_TOKENS = 4096;

interface AnthropicContentDelta {
	delta?: { type?: string; text?: string };
}

interface AnthropicStreamError {
	error?: { message?: string };
}

export class AnthropicProvider implements AIProvider {
	readonly id = "anthropic";
	readonly name = "Anthropic (Claude)";

	constructor(
		private apiKey: string,
		private model: string,
	) {}

	isConfigured(): boolean {
		return this.apiKey.length > 0 && this.model.length > 0;
	}

	async *chat(
		messages: ChatMessage[],
		options: ChatOptions,
	): AsyncGenerator<string> {
		if (!this.isConfigured()) {
			throw new Error(
				"Anthropic provider is not configured. Set your API key in Arcana settings.",
			);
		}

		const systemPrompt =
			options.systemPrompt ??
			messages.find((m) => m.role === "system")?.content;

		const apiMessages = messages
			.filter((m) => m.role !== "system")
			.map((m) => ({ role: m.role, content: m.content }));

		const body = JSON.stringify({
			model: options.model ?? this.model,
			max_tokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
			stream: true,
			...(systemPrompt ? { system: systemPrompt } : {}),
			...(options.temperature != null
				? { temperature: options.temperature }
				: {}),
			messages: apiMessages,
		});

		const response = await withRetry(() =>
			fetchStreaming(API_URL, {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"x-api-key": this.apiKey,
					"anthropic-version": API_VERSION,
				},
				body,
			}),
		);

		const reader = response.body?.getReader();
		if (!reader) throw new Error("No response body from Anthropic");

		try {
			for await (const event of parseSSE(reader)) {
				if (event.event === "content_block_delta") {
					const data = safeParse<AnthropicContentDelta>(event.data);
					if (
						data?.delta?.type === "text_delta" &&
						typeof data.delta.text === "string"
					) {
						yield data.delta.text;
					}
				} else if (event.event === "error") {
					const data = safeParse<AnthropicStreamError>(event.data);
					throw new Error(
						data?.error?.message ?? "Anthropic stream error",
					);
				}
			}
		} finally {
			reader.releaseLock();
		}
	}
}

function safeParse<T>(text: string): T | null {
	try {
		return JSON.parse(text) as T;
	} catch {
		return null;
	}
}
