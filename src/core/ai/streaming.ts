import { Platform, requestUrl } from "obsidian";

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
 * Fetch with streaming support.
 *
 * Desktop (Electron): Uses Node.js https/http modules to bypass CORS.
 * Mobile: Uses Obsidian's requestUrl (full response, not true streaming).
 *
 * Both return a standard Response with a readable body stream.
 */
export async function fetchStreaming(
	url: string,
	init: RequestInit,
	timeoutMs = 30_000,
): Promise<Response> {
	if (Platform.isDesktop) {
		return fetchStreamingDesktop(url, init, timeoutMs);
	}
	return fetchStreamingMobile(url, init);
}

/* ------------------------------------------------------------------ */
/*  Desktop: Node.js https/http (available in Electron, bypasses CORS) */
/* ------------------------------------------------------------------ */

// Node.js require is available at runtime (esbuild outputs CJS, builtins are external)
declare const require: (id: string) => NodeHttpModule;

interface NodeHttpModule {
	request(
		options: Record<string, unknown>,
		callback: (res: NodeIncomingMessage) => void,
	): NodeClientRequest;
}

interface NodeIncomingMessage {
	statusCode?: number;
	on(event: "data", listener: (chunk: Uint8Array) => void): void;
	on(event: "end", listener: () => void): void;
	on(event: "error", listener: (err: Error) => void): void;
	destroy(): void;
}

interface NodeClientRequest {
	on(event: "error", listener: (err: Error) => void): void;
	write(data: string): void;
	end(): void;
	destroy(): void;
}

async function fetchStreamingDesktop(
	url: string,
	init: RequestInit,
	timeoutMs: number,
): Promise<Response> {
	return new Promise<Response>((resolve, reject) => {
		const parsed = new URL(url);
		const isSecure = parsed.protocol === "https:";
		const mod: NodeHttpModule = require(isSecure ? "https" : "http");

		const options: Record<string, unknown> = {
			hostname: parsed.hostname,
			port:
				parsed.port || (isSecure ? 443 : 80),
			path: parsed.pathname + parsed.search,
			method: (init.method ?? "GET").toUpperCase(),
			headers: init.headers as Record<string, string>,
		};

		const req = mod.request(options, (res: NodeIncomingMessage) => {
			clearTimeout(timer);

			const status = res.statusCode ?? 500;

			if (status >= 400) {
				const chunks: Uint8Array[] = [];
				res.on("data", (chunk: Uint8Array) => {
					chunks.push(chunk);
				});
				res.on("end", () => {
					const body = new TextDecoder().decode(concatBytes(chunks));
					reject(
						new Error(
							`API error ${status}: ${extractErrorMessage(body, status)}`,
						),
					);
				});
				return;
			}

			const stream = new ReadableStream<Uint8Array>({
				start(controller) {
					res.on("data", (chunk: Uint8Array) => {
						controller.enqueue(new Uint8Array(chunk));
					});
					res.on("end", () => controller.close());
					res.on("error", (err: Error) => controller.error(err));
				},
				cancel() {
					res.destroy();
				},
			});

			resolve(new Response(stream, { status }));
		});

		const timer = setTimeout(() => {
			req.destroy();
			reject(new Error(`Request timed out after ${timeoutMs}ms`));
		}, timeoutMs);

		req.on("error", (err: Error) => {
			clearTimeout(timer);
			reject(err);
		});

		if (init.body) {
			req.write(init.body as string);
		}
		req.end();
	});
}

/* ------------------------------------------------------------------ */
/*  Mobile: Obsidian requestUrl (bypasses CORS, but non-streaming)     */
/* ------------------------------------------------------------------ */

async function fetchStreamingMobile(
	url: string,
	init: RequestInit,
): Promise<Response> {
	const response = await requestUrl({
		url,
		method: init.method ?? "GET",
		headers: init.headers as Record<string, string>,
		body: typeof init.body === "string" ? init.body : undefined,
	});

	const encoder = new TextEncoder();
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(encoder.encode(response.text));
			controller.close();
		},
	});

	return new Response(stream, { status: response.status });
}

/* ------------------------------------------------------------------ */
/*  Shared utilities                                                    */
/* ------------------------------------------------------------------ */

function concatBytes(chunks: Uint8Array[]): Uint8Array {
	const total = chunks.reduce((sum, c) => sum + c.length, 0);
	const result = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.length;
	}
	return result;
}

function extractErrorMessage(body: string, status: number): string {
	try {
		const json = JSON.parse(body);
		if (typeof json?.error?.message === "string") return json.error.message;
		if (typeof json?.message === "string") return json.message;
		if (typeof json?.error === "string") return json.error;
	} catch {
		// Body isn't JSON - use it as-is
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
