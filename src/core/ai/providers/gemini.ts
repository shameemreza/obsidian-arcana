import type { AIProvider, ChatMessage, ChatOptions } from "../../../types";
import { fetchStreaming, parseSSE, withRetry } from "../streaming";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MAX_TOKENS = 4096;

export class GeminiProvider implements AIProvider {
	readonly id = "gemini";
	readonly name = "Google Gemini";

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
				"Gemini provider is not configured. Set your API key in Arcana settings.",
			);
		}

		const model = options.model ?? this.model;
		const url = `${API_BASE}/${model}:streamGenerateContent?key=${this.apiKey}&alt=sse`;

		const systemPrompt =
			options.systemPrompt ??
			messages.find((m) => m.role === "system")?.content;

		const contents = messages
			.filter((m) => m.role !== "system")
			.map((m) => ({
				role: m.role === "assistant" ? "model" : "user",
				parts: [{ text: m.content }],
			}));

		const body: Record<string, unknown> = {
			contents,
			generationConfig: {
				maxOutputTokens: options.maxTokens ?? DEFAULT_MAX_TOKENS,
				...(options.temperature != null
					? { temperature: options.temperature }
					: {}),
			},
		};

		if (systemPrompt) {
			body.systemInstruction = { parts: [{ text: systemPrompt }] };
		}

		const response = await withRetry(() =>
			fetchStreaming(url, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body),
			}),
		);

		const reader = response.body?.getReader();
		if (!reader) throw new Error("No response body from Gemini");

		try {
			for await (const event of parseSSE(reader)) {
				if (!event.data || event.data === "[DONE]") continue;

				const data = safeParse(event.data);
				const text = extractText(data);
				if (text) yield text;
			}
		} finally {
			reader.releaseLock();
		}
	}
}

function safeParse(text: string): Record<string, unknown> | null {
	try {
		return JSON.parse(text) as Record<string, unknown>;
	} catch {
		return null;
	}
}

function extractText(data: Record<string, unknown> | null): string | null {
	if (!data) return null;
	try {
		const candidates = data.candidates as
			| Array<Record<string, unknown>>
			| undefined;
		const content = candidates?.[0]?.content as
			| Record<string, unknown>
			| undefined;
		const parts = content?.parts as
			| Array<Record<string, unknown>>
			| undefined;
		const text = parts?.[0]?.text;
		return typeof text === "string" ? text : null;
	} catch {
		return null;
	}
}
