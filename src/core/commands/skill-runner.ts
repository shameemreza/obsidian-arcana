/**
 * Agent loop that executes a custom command.
 *
 * 1. Builds a system prompt with tool descriptions.
 * 2. Streams the AI response.
 * 3. Parses <tool_call> blocks from the response.
 * 4. Executes tools, feeds results back into context.
 * 5. Repeats until the AI produces no tool calls or hits max iterations.
 * 6. Routes the final output to chat, a new note, or both.
 */

import type { App } from "obsidian";
import type { AIEngine } from "../ai/ai-engine";
import type { NoteCreator } from "../vault/note-creator";
import type { ChatMessage } from "../../types";
import type { SlashCommandContext } from "../../ui/chat/slash-commands/types";
import type {
	CustomCommand,
	ToolCallRequest,
	ToolCallResult,
	ToolDefinition,
} from "./types";
import { executeVaultTool } from "./vault-tools";

const MAX_ITERATIONS = 6;
const RENDER_THROTTLE_MS = 100;
const TOOL_CALL_REGEX = /<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/g;

export class SkillRunner {
	constructor(
		private app: App,
		private aiEngine: AIEngine,
		private noteCreator: NoteCreator,
	) {}

	async execute(
		command: CustomCommand,
		ctx: SlashCommandContext,
	): Promise<void> {
		const provider = this.aiEngine.getActiveProvider();
		if (!provider.isConfigured()) {
			ctx.finalizeStreaming(
				ctx.addAssistantMessage(""),
				"AI provider isn't configured. Check Arcana settings.",
			);
			return;
		}

		const el = ctx.addAssistantMessage("", true);
		ctx.updateStreaming(el, `Running /${command.name}…`);

		try {
			const systemPrompt = buildSystemPrompt(command);
			const loopMessages: ChatMessage[] = [
				{
					role: "user",
					content: buildInitialUserMessage(command, ctx.args),
					timestamp: Date.now(),
				},
			];

			let finalOutput = "";

			for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
				const aiResponse = await this.streamIteration(
					el,
					ctx,
					loopMessages,
					systemPrompt,
					iteration,
				);

				const toolCalls = parseToolCalls(aiResponse);

				if (toolCalls.length === 0) {
					finalOutput = aiResponse;
					break;
				}

				loopMessages.push({
					role: "assistant",
					content: aiResponse,
					timestamp: Date.now(),
				});

				const results = await this.executeTools(
					command.tools,
					toolCalls,
					el,
					ctx,
				);

				const resultBlock = formatToolResults(results);
				loopMessages.push({
					role: "user",
					content: resultBlock,
					timestamp: Date.now(),
				});

				if (iteration === MAX_ITERATIONS - 1) {
					finalOutput = aiResponse;
				}
			}

			const cleanOutput = stripToolCalls(finalOutput);

			ctx.finalizeStreaming(el, cleanOutput);
			ctx.appendMessage({
				role: "assistant",
				content: cleanOutput,
				timestamp: Date.now(),
			});

			await this.routeOutput(command, cleanOutput, ctx);
		} catch (e) {
			const msg = e instanceof Error ? e.message : "Unknown error";
			ctx.finalizeStreaming(el, `/${command.name} failed: ${msg}`);
		}
	}

	private async streamIteration(
		el: HTMLElement,
		ctx: SlashCommandContext,
		messages: ChatMessage[],
		systemPrompt: string,
		iteration: number,
	): Promise<string> {
		let full = "";
		let lastRender = 0;
		const prefix = iteration > 0 ? "Thinking…\n\n" : "";

		for await (const chunk of this.aiEngine.chat(messages, {
			systemPrompt,
		})) {
			full += chunk;
			const now = Date.now();
			if (now - lastRender >= RENDER_THROTTLE_MS) {
				ctx.updateStreaming(el, prefix + stripToolCalls(full));
				lastRender = now;
			}
		}

		return full;
	}

	private async executeTools(
		toolDefs: ToolDefinition[],
		calls: ToolCallRequest[],
		el: HTMLElement,
		ctx: SlashCommandContext,
	): Promise<ToolCallResult[]> {
		const results: ToolCallResult[] = [];

		for (const call of calls) {
			ctx.updateStreaming(el, `Using tool: ${call.name}…`);

			const toolDef = toolDefs.find((t) => t.name === call.name);
			if (!toolDef) {
				results.push({
					name: call.name,
					content: "",
					error: `Unknown tool "${call.name}". Available: ${toolDefs.map((t) => t.name).join(", ")}`,
				});
				continue;
			}

			if (toolDef.source === "mcp") {
				results.push({
					name: call.name,
					content: "",
					error: "MCP tools are not available yet. They will be added in a future update.",
				});
				continue;
			}

			const result = await executeVaultTool(this.app, toolDef, call);
			results.push(result);
		}

		return results;
	}

	private async routeOutput(
		command: CustomCommand,
		content: string,
		ctx: SlashCommandContext,
	): Promise<void> {
		if (command.output === "chat") return;

		if (command.output === "note" || command.output === "both") {
			const title = `${capitalize(command.name)} - ${new Date().toLocaleDateString()}`;
			await this.noteCreator.createNote({
				title,
				content,
				folder: command.outputFolder,
				open: true,
			});
		}
	}
}

// ── Prompt Construction ─────────────────────────────────────

function buildSystemPrompt(command: CustomCommand): string {
	const toolSection =
		command.tools.length > 0
			? buildToolDescriptions(command.tools)
			: "No tools are available for this command.";

	return [
		"You are an AI agent executing a custom command inside Obsidian.",
		"Follow the instructions below. Be concise and actionable.",
		"",
		"AVAILABLE TOOLS",
		"",
		toolSection,
		"",
		"HOW TO CALL TOOLS",
		"",
		"To call a tool, output a <tool_call> block with a JSON object:",
		"",
		'<tool_call>{"name": "tool_name", "input": {"param": "value"}}</tool_call>',
		"",
		"You can call multiple tools in one response. Each needs its own <tool_call> block.",
		"After tool results come back, continue reasoning and produce your final answer.",
		"When you have enough information, write your final response WITHOUT any <tool_call> blocks.",
		"",
		"TOOL INPUT FORMATS",
		"",
		'- vault tools (source: vault): {"query": "search terms"}',
		'- note tools (source: note): {"name": "Note Name"}',
		'- folder tools (source: folder): {"folder": "Folder/Path"}',
		"",
		"IMPORTANT RULES",
		"",
		"- Only call tools that are listed above.",
		"- If a tool returns an error or no results, skip it and work with what you have.",
		"- Do not make up information. Use tool results as your source of truth.",
		"- Your final response should NOT contain any <tool_call> blocks.",
		"- Keep responses concise and well-structured.",
	].join("\n");
}

function buildToolDescriptions(tools: ToolDefinition[]): string {
	return tools
		.map(
			(t) =>
				`- **${t.name}** (source: ${t.source}): ${t.description}`,
		)
		.join("\n");
}

function buildInitialUserMessage(
	command: CustomCommand,
	args: string,
): string {
	const parts = [
		`Execute the "/${command.name}" command.`,
		"",
		"INSTRUCTIONS:",
		"",
		command.instructions,
	];

	if (args.trim()) {
		parts.push("", "USER INPUT:", "", args.trim());
	}

	return parts.join("\n");
}

// ── Tool Call Parsing ────────────────────────────────────────

function parseToolCalls(text: string): ToolCallRequest[] {
	const calls: ToolCallRequest[] = [];
	const regex = new RegExp(TOOL_CALL_REGEX.source, "g");
	let match: RegExpExecArray | null;

	while ((match = regex.exec(text)) !== null) {
		try {
			const parsed = JSON.parse(match[1]) as {
				name?: string;
				input?: Record<string, string>;
			};
			if (parsed.name) {
				calls.push({
					name: parsed.name,
					input: parsed.input ?? {},
				});
			}
		} catch {
			// Malformed JSON - skip this tool call
		}
	}

	return calls;
}

function stripToolCalls(text: string): string {
	return text.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, "").trim();
}

function formatToolResults(results: ToolCallResult[]): string {
	const parts = results.map((r) => {
		if (r.error) {
			return `<tool_result name="${r.name}" error="${r.error}">\n${r.content || "No data returned."}\n</tool_result>`;
		}
		return `<tool_result name="${r.name}">\n${r.content}\n</tool_result>`;
	});

	return [
		"Here are the tool results. Use them to continue your work:",
		"",
		...parts,
		"",
		"Now continue with your response. If you need more data, call another tool.",
		"Otherwise, write your final answer (without any <tool_call> blocks).",
	].join("\n");
}

function capitalize(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
}
