import type { AIProvider, ChatMessage, ChatOptions } from "../../../types";
import { fetchStreaming, parseNDJSON, withRetry } from "../streaming";

const DEFAULT_ENDPOINT = "http://localhost:11434";

interface OllamaChatChunk {
	message?: { content?: string };
	done?: boolean;
}

export class OllamaProvider implements AIProvider {
	readonly id = "ollama";
	readonly name = "Ollama (local)";

	constructor(
		private endpoint: string,
		private model: string,
	) {}

	isConfigured(): boolean {
		return this.endpoint.length > 0 && this.model.length > 0;
	}

	async *chat(
		messages: ChatMessage[],
		options: ChatOptions,
	): AsyncGenerator<string> {
		if (!this.isConfigured()) {
			throw new Error(
				"Ollama provider is not configured. Check your endpoint and model in Arcana settings.",
			);
		}

		const baseUrl =
			this.endpoint.replace(/\/+$/, "") || DEFAULT_ENDPOINT;
		const url = `${baseUrl}/api/chat`;

		const systemPrompt =
			options.systemPrompt ??
			messages.find((m) => m.role === "system")?.content;

		const ollamaMessages = [
			...(systemPrompt
				? [{ role: "system" as const, content: systemPrompt }]
				: []),
			...messages
				.filter((m) => m.role !== "system")
				.map((m) => ({ role: m.role, content: m.content })),
		];

		const body: Record<string, unknown> = {
			model: options.model ?? this.model,
			messages: ollamaMessages,
			stream: true,
		};

		if (options.temperature != null) {
			body.options = { temperature: options.temperature };
		}

		const response = await withRetry(() =>
			fetchStreaming(url, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body),
			}),
		);

		const reader = response.body?.getReader();
		if (!reader) throw new Error("No response body from Ollama");

		try {
			for await (const chunk of parseNDJSON(reader)) {
				const data = chunk as OllamaChatChunk;
				if (data.message?.content) {
					yield data.message.content;
				}
				if (data.done) break;
			}
		} finally {
			reader.releaseLock();
		}
	}
}
