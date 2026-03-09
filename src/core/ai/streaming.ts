import { requestUrl } from "obsidian";

export interface SSEEvent {
	event?: string;
	data: string;
}

/**
 * Parse a Server-Sent Events stream into individual events.
 * Handles events spanning multiple chunks correctly per the SSE spec.
 */
export async function* parseSSE(
	reader: ReadableStreamDefaultReader<Uint8Array>,
): AsyncGenerator<SSEEvent> {
	const decoder = new TextDecoder();
	let buffer = "";
	let currentEvent: string | undefined;
	let dataLines: string[] = [];

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;

		buffer += decoder.decode(value, { stream: true });

		while (true) {
			const idx = buffer.indexOf("\n");
			if (idx === -1) break;

			const line = buffer.slice(0, idx).replace(/\r$/, "");
			buffer = buffer.slice(idx + 1);

			if (line === "") {
				if (dataLines.length > 0) {
					yield { event: currentEvent, data: dataLines.join("\n") };
				}
				currentEvent = undefined;
				dataLines = [];
			} else if (line.startsWith("event:")) {
				currentEvent =
					line.charAt(6) === " " ? line.slice(7) : line.slice(6);
			} else if (line.startsWith("data:")) {
				dataLines.push(
					line.charAt(5) === " " ? line.slice(6) : line.slice(5),
				);
			}
		}
	}

	if (dataLines.length > 0) {
		yield { event: currentEvent, data: dataLines.join("\n") };
	}
}

/**
 * Parse a newline-delimited JSON stream (used by Ollama).
 */
export async function* parseNDJSON(
	reader: ReadableStreamDefaultReader<Uint8Array>,
): AsyncGenerator<unknown> {
	const decoder = new TextDecoder();
	let buffer = "";

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;

		buffer += decoder.decode(value, { stream: true });

		while (true) {
			const idx = buffer.indexOf("\n");
			if (idx === -1) break;

			const line = buffer.slice(0, idx).trim();
			buffer = buffer.slice(idx + 1);

			if (!line) continue;
			try {
				yield JSON.parse(line);
			} catch {
				// Skip malformed JSON lines
			}
		}
	}

	const remaining = buffer.trim();
	if (remaining) {
		try {
			yield JSON.parse(remaining);
		} catch {
			// Skip malformed trailing data
		}
	}
}

/**
 * Fetch with streaming support and request timeout.
 * Timeout applies to the initial connection only — once streaming starts,
 * the timeout is cleared so long responses aren't interrupted.
 */
export async function fetchStreaming(
	url: string,
	init: RequestInit,
	timeoutMs = 30_000,
): Promise<Response> {
	const controller = new AbortController();
	const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

	try {
		const response = await fetch(url, {
			...init,
			signal: controller.signal,
		});

		if (!response.ok) {
			const text = await response.text().catch(() => "");
			throw new Error(
				`API error ${response.status}: ${extractErrorMessage(text, response.status)}`,
			);
		}

		window.clearTimeout(timeout);
		return response;
	} catch (error) {
		window.clearTimeout(timeout);
		if (error instanceof DOMException && error.name === "AbortError") {
			throw new Error(`Request timed out after ${timeoutMs}ms`);
		}
		throw error;
	}
}

function extractErrorMessage(body: string, status: number): string {
	try {
		const json = JSON.parse(body);
		if (typeof json?.error?.message === "string") return json.error.message;
		if (typeof json?.message === "string") return json.message;
		if (typeof json?.error === "string") return json.error;
	} catch {
		// Body isn't JSON — use it as-is
	}
	return body.slice(0, 200) || `HTTP ${status}`;
}

/**
 * Retry with exponential backoff. Only retries on transient errors
 * (rate limits, server errors, timeouts).
 */
export async function withRetry<T>(
	fn: () => Promise<T>,
	maxRetries = 2,
	baseDelayMs = 1000,
): Promise<T> {
	let lastError: Error = new Error("No attempts made");

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			return await fn();
		} catch (error) {
			lastError =
				error instanceof Error ? error : new Error(String(error));

			const msg = lastError.message.toLowerCase();
			const isRetryable =
				msg.includes("429") ||
				msg.includes("500") ||
				msg.includes("502") ||
				msg.includes("503") ||
				msg.includes("timed out") ||
				msg.includes("network") ||
				msg.includes("econnreset") ||
				msg.includes("fetch failed");

			if (!isRetryable || attempt >= maxRetries) break;

			const delay = baseDelayMs * Math.pow(2, attempt);
			const jitter = delay * 0.1 * Math.random();
			await new Promise<void>((resolve) =>
				window.setTimeout(resolve, delay + jitter),
			);
		}
	}

	throw lastError;
}

/**
 * Test a provider connection using Obsidian's requestUrl (works on all platforms).
 */
export async function testConnection(
	url: string,
	method: string,
	headers: Record<string, string>,
	body?: string,
): Promise<{ ok: boolean; message: string }> {
	try {
		await requestUrl({ url, method, headers, body });
		return { ok: true, message: "Connection successful" };
	} catch (error) {
		const msg =
			error instanceof Error ? error.message : String(error);
		return { ok: false, message: msg };
	}
}
