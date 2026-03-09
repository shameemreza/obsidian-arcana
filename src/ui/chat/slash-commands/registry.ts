import type { SlashCommand } from "./types";
import { taskCommand } from "./commands/task";
import { summarizeCommand } from "./commands/summarize";
import { findCommand } from "./commands/find";
import { organizeCommand } from "./commands/organize";
import { connectCommand } from "./commands/connect";
import { templateCommand } from "./commands/template";
import { focusCommand } from "./commands/focus";
import { nextCommand } from "./commands/next";
import { worktogetherCommand } from "./commands/worktogether";
import { dumpCommand } from "./commands/dump";
import { eveningCommand } from "./commands/evening";

const BUILT_IN_COMMANDS: SlashCommand[] = [
	taskCommand,
	summarizeCommand,
	findCommand,
	organizeCommand,
	connectCommand,
	templateCommand,
	focusCommand,
	nextCommand,
	worktogetherCommand,
	dumpCommand,
	eveningCommand,
];

const commandMap = new Map<string, SlashCommand>();
for (const cmd of BUILT_IN_COMMANDS) {
	commandMap.set(cmd.name, cmd);
}

export function registerCommand(cmd: SlashCommand): void {
	commandMap.set(cmd.name, cmd);
}

export function registerCommands(cmds: SlashCommand[]): void {
	for (const cmd of cmds) {
		commandMap.set(cmd.name, cmd);
	}
}

export function unregisterCommand(name: string): void {
	if (BUILT_IN_COMMANDS.some((c) => c.name === name)) return;
	commandMap.delete(name);
}

export function clearCustomCommands(): void {
	const builtInNames = new Set(BUILT_IN_COMMANDS.map((c) => c.name));
	for (const name of [...commandMap.keys()]) {
		if (!builtInNames.has(name)) {
			commandMap.delete(name);
		}
	}
}

export function getCommand(name: string): SlashCommand | undefined {
	return commandMap.get(name);
}

export function getAllCommands(): SlashCommand[] {
	return [...commandMap.values()];
}

export function filterCommands(query: string): SlashCommand[] {
	const all = getAllCommands();
	if (!query) return all;
	const q = query.toLowerCase();
	return all.filter(
		(c) =>
			c.name.includes(q) ||
			c.description.toLowerCase().includes(q),
	);
}

export interface ParsedSlashCommand {
	command: SlashCommand;
	args: string;
}

export function parseSlashCommand(text: string): ParsedSlashCommand | null {
	const trimmed = text.trim();
	if (!trimmed.startsWith("/")) return null;

	const spaceIdx = trimmed.indexOf(" ");
	const name = spaceIdx === -1
		? trimmed.slice(1)
		: trimmed.slice(1, spaceIdx);
	const args = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1).trim();

	const cmd = commandMap.get(name);
	if (!cmd) return null;

	return { command: cmd, args };
}
