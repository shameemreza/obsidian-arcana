import type { ArcanaSettings } from "../../settings";
import type { AIProvider, ChatMessage, ChatOptions } from "../../types";
import { AI_PROVIDERS } from "../../constants";
import { testConnection } from "./streaming";
import { AnthropicProvider } from "./providers/anthropic";
import { GeminiProvider } from "./providers/gemini";
import { OllamaProvider } from "./providers/ollama";

export class AIEngine {
	constructor(private getSettings: () => ArcanaSettings) {}

	getActiveProvider(): AIProvider {
		const s = this.getSettings();

		switch (s.aiProvider) {
			case AI_PROVIDERS.ANTHROPIC:
				return new AnthropicProvider(s.anthropicApiKey, s.anthropicModel);
			case AI_PROVIDERS.GEMINI:
				return new GeminiProvider(s.geminiApiKey, s.geminiModel);
			case AI_PROVIDERS.OLLAMA:
				return new OllamaProvider(s.ollamaEndpoint, s.ollamaModel);
			default:
				throw new Error(`Unknown AI provider: ${s.aiProvider}`);
		}
	}

	async *chat(
		messages: ChatMessage[],
		options: ChatOptions = {},
	): AsyncGenerator<string> {
		const provider = this.getActiveProvider();
		yield* provider.chat(messages, options);
	}

	async chatComplete(
		messages: ChatMessage[],
		options: ChatOptions = {},
	): Promise<string> {
		let result = "";
		for await (const chunk of this.chat(messages, options)) {
			result += chunk;
		}
		return result;
	}

	async testConnection(): Promise<{ ok: boolean; message: string }> {
		const s = this.getSettings();

		switch (s.aiProvider) {
			case AI_PROVIDERS.ANTHROPIC:
				return this.testAnthropic(s);
			case AI_PROVIDERS.GEMINI:
				return this.testGemini(s);
			case AI_PROVIDERS.OLLAMA:
				return this.testOllama(s);
			default:
				return {
					ok: false,
					message: `Unknown provider: ${s.aiProvider}`,
				};
		}
	}

	private async testAnthropic(
		s: ArcanaSettings,
	): Promise<{ ok: boolean; message: string }> {
		if (!s.anthropicApiKey) {
			return { ok: false, message: "API key is not set" };
		}
		return testConnection(
			"https://api.anthropic.com/v1/messages",
			"POST",
			{
				"content-type": "application/json",
				"x-api-key": s.anthropicApiKey,
				"anthropic-version": "2023-06-01",
			},
			JSON.stringify({
				model: s.anthropicModel,
				max_tokens: 1,
				messages: [{ role: "user", content: "hi" }],
			}),
		);
	}

	private async testGemini(
		s: ArcanaSettings,
	): Promise<{ ok: boolean; message: string }> {
		if (!s.geminiApiKey) {
			return { ok: false, message: "API key is not set" };
		}
		const url = `https://generativelanguage.googleapis.com/v1beta/models/${s.geminiModel}:generateContent?key=${s.geminiApiKey}`;
		return testConnection(
			url,
			"POST",
			{ "content-type": "application/json" },
			JSON.stringify({
				contents: [{ role: "user", parts: [{ text: "hi" }] }],
				generationConfig: { maxOutputTokens: 1 },
			}),
		);
	}

	private async testOllama(
		s: ArcanaSettings,
	): Promise<{ ok: boolean; message: string }> {
		const baseUrl =
			s.ollamaEndpoint.replace(/\/+$/, "") || "http://localhost:11434";
		return testConnection(`${baseUrl}/api/tags`, "GET", {});
	}
}
