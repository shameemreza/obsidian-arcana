/**
 * Types for user-defined custom commands (agent skills).
 * Command files live in .arcana/commands/ as markdown with YAML frontmatter.
 */

export type ToolSource = "vault" | "note" | "folder" | "mcp";
export type OutputTarget = "chat" | "note" | "both";

export interface ToolDefinition {
	name: string;
	source: ToolSource;
	description: string;
	/** MCP-only fields — used when source is "mcp" (Phase 9). */
	server?: string;
	tool?: string;
}

export interface CustomCommand {
	/** Slash command name (user types /morning). */
	name: string;
	/** Shown in the autocomplete dropdown. */
	description: string;
	/** Lucide icon name. */
	icon: string;
	/** Where the final result goes. */
	output: OutputTarget;
	/** Target folder when output includes "note". */
	outputFolder?: string;
	/** Tools the AI can call during execution. */
	tools: ToolDefinition[];
	/** The markdown body — instructions for the AI agent. */
	instructions: string;
	/** Path to the source file in the vault. */
	filePath: string;
}

export interface ToolCallRequest {
	name: string;
	input: Record<string, string>;
}

export interface ToolCallResult {
	name: string;
	content: string;
	error?: string;
}
