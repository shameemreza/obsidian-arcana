/**
 * Scans .arcana/commands/ for markdown files with YAML frontmatter
 * and returns CustomCommand[] to register as slash commands.
 *
 * Obsidian's vault API (getAbstractFileByPath, TFolder.children)
 * does not reliably track dotfolders like .arcana/. This loader
 * uses vault.getMarkdownFiles() filtered by path prefix and the
 * adapter API for folder creation to work around that limitation.
 */

import { type App, type TFile, normalizePath } from "obsidian";
import type {
	CustomCommand,
	ToolDefinition,
	ToolSource,
	OutputTarget,
} from "./types";

const COMMANDS_FOLDER = ".arcana/commands";
const COMMANDS_PREFIX = ".arcana/commands/";

const VALID_SOURCES: ToolSource[] = ["vault", "note", "folder", "mcp"];
const VALID_OUTPUTS: OutputTarget[] = ["chat", "note", "both"];

export class SkillLoader {
	constructor(private app: App) {}

	async loadAll(): Promise<CustomCommand[]> {
		await this.ensureFolder();
		await this.ensureExampleCommands();

		const commandFiles = this.app.vault
			.getMarkdownFiles()
			.filter((f) => f.path.startsWith(COMMANDS_PREFIX));

		const commands: CustomCommand[] = [];

		for (const file of commandFiles) {
			try {
				const cmd = await this.parseFile(file);
				if (cmd) commands.push(cmd);
			} catch (e) {
				console.warn(
					`[Arcana] Failed to parse command file ${file.path}:`,
					e,
				);
			}
		}

		return commands;
	}

	async parseFile(file: TFile): Promise<CustomCommand | null> {
		const raw = await this.app.vault.read(file);
		const { frontmatter, body } = parseFrontmatter(raw);

		if (!frontmatter.name || typeof frontmatter.name !== "string") {
			console.warn(`[Arcana] Command file missing "name": ${file.path}`);
			return null;
		}

		const name = String(frontmatter.name).toLowerCase().replace(/\s+/g, "-");
		const description = String(frontmatter.description ?? `Custom command: ${name}`);
		const icon = String(frontmatter.icon ?? "terminal");
		const output = parseOutput(frontmatter.output);
		const outputFolder = frontmatter.output_folder
			? String(frontmatter.output_folder)
			: undefined;

		const tools = parseTools(frontmatter.tools);
		const instructions = body.trim();

		if (!instructions) {
			console.warn(`[Arcana] Command file has no instructions: ${file.path}`);
			return null;
		}

		return {
			name,
			description,
			icon,
			output,
			outputFolder,
			tools,
			instructions,
			filePath: file.path,
		};
	}

	getCommandsFolder(): string {
		return COMMANDS_FOLDER;
	}

	/**
	 * Use the adapter API for folder creation - it works reliably
	 * for dotfolders unlike vault.createFolder().
	 */
	private async ensureFolder(): Promise<void> {
		const adapter = this.app.vault.adapter;
		const parentPath = normalizePath(".arcana");
		if (!(await adapter.exists(parentPath))) {
			await adapter.mkdir(parentPath);
		}
		const path = normalizePath(COMMANDS_FOLDER);
		if (!(await adapter.exists(path))) {
			await adapter.mkdir(path);
		}
	}

	private async ensureExampleCommands(): Promise<void> {
		const adapter = this.app.vault.adapter;
		const hasFiles = this.app.vault
			.getMarkdownFiles()
			.some((f) => f.path.startsWith(COMMANDS_PREFIX));

		if (hasFiles) return;

		const folderExists = await adapter.exists(normalizePath(COMMANDS_FOLDER));
		if (!folderExists) return;

		for (const example of EXAMPLE_COMMANDS) {
			const path = normalizePath(`${COMMANDS_FOLDER}/${example.filename}`);
			if (!(await adapter.exists(path))) {
				await this.app.vault.create(path, example.content);
			}
		}
	}
}

// ── Frontmatter Parser ──────────────────────────────────────

interface ParsedFile {
	frontmatter: Record<string, unknown>;
	body: string;
}

function parseFrontmatter(raw: string): ParsedFile {
	const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
	if (!match) {
		return { frontmatter: {}, body: raw };
	}

	const yamlBlock = match[1];
	const body = match[2];

	const fm: Record<string, unknown> = {};
	let currentKey = "";
	let inArray = false;
	const arrayItems: unknown[] = [];

	for (const line of yamlBlock.split("\n")) {
		const trimmed = line.trimEnd();

		if (inArray) {
			if (trimmed.startsWith("  - ") || trimmed.startsWith("  -\t")) {
				const itemYaml = trimmed.slice(4).trim();
				const obj = parseInlineYamlObject(itemYaml);
				arrayItems.push(obj ?? itemYaml);
				continue;
			}
			fm[currentKey] = arrayItems.slice();
			arrayItems.length = 0;
			inArray = false;
		}

		const kvMatch = trimmed.match(/^(\w[\w_-]*):\s*(.*)$/);
		if (!kvMatch) continue;

		const key = kvMatch[1];
		let value: string | unknown = kvMatch[2].trim();

		if (value === "" || value === undefined) {
			currentKey = key;
			inArray = true;
			arrayItems.length = 0;
			continue;
		}

		if (typeof value === "string" && value.startsWith("[") && value.endsWith("]")) {
			fm[key] = value
				.slice(1, -1)
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean);
			continue;
		}

		if (typeof value === "string") {
			value = stripQuotes(value);
		}

		fm[key] = value;
	}

	if (inArray) {
		fm[currentKey] = arrayItems.slice();
	}

	return { frontmatter: fm, body };
}

function stripQuotes(s: string): string {
	if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
		return s.slice(1, -1);
	}
	return s;
}

function parseInlineYamlObject(text: string): Record<string, string> | null {
	const pairs: Record<string, string> = {};
	let found = false;

	const parts = text.split(/\n|(?<=\S)\s{2,}(?=\w)/);
	for (const part of parts) {
		const kv = part.match(/^(\w[\w_-]*):\s*(.+)$/);
		if (kv) {
			pairs[kv[1]] = stripQuotes(kv[2].trim());
			found = true;
		}
	}

	if (!found) return null;
	return pairs;
}

function parseTools(raw: unknown): ToolDefinition[] {
	if (!Array.isArray(raw)) return [];

	const tools: ToolDefinition[] = [];
	for (const item of raw) {
		if (typeof item === "string") {
			const parsed = parseInlineYamlObject(item);
			if (parsed?.name && parsed?.source) {
				tools.push(buildToolDef(parsed));
			}
			continue;
		}
		if (typeof item === "object" && item !== null) {
			const obj = item as Record<string, string>;
			if (obj.name && obj.source) {
				tools.push(buildToolDef(obj));
			}
		}
	}
	return tools;
}

function buildToolDef(obj: Record<string, string>): ToolDefinition {
	const source = VALID_SOURCES.includes(obj.source as ToolSource)
		? (obj.source as ToolSource)
		: "vault";

	return {
		name: obj.name,
		source,
		description: obj.description ?? `${source} tool: ${obj.name}`,
		...(obj.server ? { server: obj.server } : {}),
		...(obj.tool ? { tool: obj.tool } : {}),
	};
}

function parseOutput(raw: unknown): OutputTarget {
	if (typeof raw === "string" && VALID_OUTPUTS.includes(raw as OutputTarget)) {
		return raw as OutputTarget;
	}
	return "chat";
}

// ── Example Command Files ───────────────────────────────────

const EXAMPLE_COMMANDS: { filename: string; content: string }[] = [
	{
		filename: "morning.md",
		content: `---
name: morning
description: Morning briefing with tasks, priorities, and plan for the day
icon: sunrise
output: chat
tools:
  - name: open_tasks
    source: vault
    description: Search for open tasks in the vault.
  - name: daily_note
    source: note
    description: Read today's daily note if it exists.
  - name: recent_notes
    source: folder
    description: Read recent notes from a folder.
---

You are a morning briefing assistant.

Use the available tools to understand what's on the user's plate today.
Start by searching for open tasks, then check if a daily note exists for today.

Write a brief, energizing morning briefing covering:

1. **Today's tasks** - open tasks sorted by priority and due date.
2. **Overdue items** - anything past its due date (flag these clearly).
3. **Suggested focus** - pick the 2-3 most important things and explain why.

Keep it concise. No filler. Like a sharp colleague handing you a one-page brief
at the start of the day.

If a tool returns nothing useful, skip that section and work with what you have.
`,
	},
	{
		filename: "weekly-review.md",
		content: `---
name: weekly-review
description: Weekly review of what happened and what's next
icon: calendar-check
output: note
output_folder: Weekly Notes
tools:
  - name: completed_tasks
    source: vault
    description: Search for tasks completed this week.
  - name: open_tasks
    source: vault
    description: Search for open and overdue tasks.
  - name: recent_notes
    source: vault
    description: Search for notes created or modified this week.
---

You are a weekly review assistant.

Use the available tools to gather what happened this week and what's coming up.

Search for completed tasks (look for status "done"), open tasks, and recent notes.

Write a weekly review covering:

1. **Wins** - tasks completed this week. Acknowledge the progress.
2. **Still open** - remaining tasks, sorted by priority.
3. **Notes created** - new notes or ideas captured this week.
4. **Next week** - suggest 3 priorities for the coming week based on what's open.

Be warm but direct. This is a reflection, not a report. End with one question
that helps the user think about what they want next week to look like.
`,
	},
	{
		filename: "brainstorm.md",
		content: `---
name: brainstorm
description: Brainstorm ideas using context from your vault
icon: lightbulb
output: chat
tools:
  - name: related_notes
    source: vault
    description: Search for notes related to the brainstorm topic.
  - name: read_note
    source: note
    description: Read a specific note for deeper context.
---

You are a creative brainstorming partner.

The user will provide a topic or question after the /brainstorm command.
Use the tools to find relevant context from their vault first.

Then generate 5-7 creative ideas that:
- Build on what already exists in their notes
- Offer unexpected connections between topics
- Range from practical to ambitious
- Include one "wild card" idea that pushes boundaries

For each idea, give it a short title and 1-2 sentences explaining it.
Reference specific notes when an idea connects to existing work.

Keep the energy high. This should feel like a productive whiteboard session.
`,
	},
];
