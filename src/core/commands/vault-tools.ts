/**
 * Vault-only tool implementations for custom commands.
 * These execute during the agent loop when the AI calls a tool.
 *
 * source: vault  - keyword search across the vault
 * source: note   - read a specific note by name
 * source: folder - read all notes in a folder
 */

import { type App, type TFile, TFolder } from "obsidian";
import type { ToolDefinition, ToolCallRequest, ToolCallResult } from "./types";

const MAX_NOTE_CHARS = 8000;
const MAX_RESULTS = 10;

export function executeVaultTool(
	app: App,
	toolDef: ToolDefinition,
	call: ToolCallRequest,
): Promise<ToolCallResult> {
	switch (toolDef.source) {
		case "vault":
			return vaultSearch(app, call);
		case "note":
			return readNote(app, call);
		case "folder":
			return readFolder(app, call);
		default:
			return Promise.resolve({
				name: call.name,
				content: "",
				error: `Tool source "${toolDef.source}" is not available yet.`,
			});
	}
}

async function vaultSearch(
	app: App,
	call: ToolCallRequest,
): Promise<ToolCallResult> {
	const query = (call.input.query ?? "").toLowerCase().trim();
	if (!query) {
		return { name: call.name, content: "No search query provided.", error: "missing_query" };
	}

	const keywords = query.split(/\s+/).filter((w) => w.length > 1);
	const files = app.vault.getMarkdownFiles();
	const scored: { file: TFile; score: number; preview: string }[] = [];

	for (const file of files) {
		let score = 0;
		const basename = file.basename.toLowerCase();

		for (const kw of keywords) {
			if (basename.includes(kw)) score += 3;
		}

		const cache = app.metadataCache.getFileCache(file);
		if (cache?.tags) {
			const tags = cache.tags.map((t) => t.tag.toLowerCase());
			for (const kw of keywords) {
				if (tags.some((t) => t.includes(kw))) score += 2;
			}
		}

		if (cache?.headings) {
			const headings = cache.headings.map((h) => h.heading.toLowerCase());
			for (const kw of keywords) {
				if (headings.some((h) => h.includes(kw))) score += 2;
			}
		}

		if (cache?.frontmatter) {
			const fmStr = JSON.stringify(cache.frontmatter).toLowerCase();
			for (const kw of keywords) {
				if (fmStr.includes(kw)) score += 1;
			}
		}

		if (score > 0) {
			const content = await app.vault.cachedRead(file);
			for (const kw of keywords) {
				if (content.toLowerCase().includes(kw)) score += 1;
			}
			scored.push({
				file,
				score,
				preview: content.slice(0, 1500),
			});
		}
	}

	scored.sort((a, b) => b.score - a.score);
	const top = scored.slice(0, MAX_RESULTS);

	if (top.length === 0) {
		return { name: call.name, content: `No notes found matching "${query}".` };
	}

	const parts = top.map(
		(r) => `## ${r.file.basename} (${r.file.path})\nRelevance: ${r.score}\n\n${r.preview}`,
	);

	return {
		name: call.name,
		content: `Found ${top.length} note(s) matching "${query}":\n\n${parts.join("\n\n---\n\n")}`,
	};
}

async function readNote(
	app: App,
	call: ToolCallRequest,
): Promise<ToolCallResult> {
	const noteName = (call.input.name ?? call.input.note ?? "").trim();
	if (!noteName) {
		return { name: call.name, content: "No note name provided.", error: "missing_name" };
	}

	const file = app.metadataCache.getFirstLinkpathDest(noteName, "");
	if (!file) {
		return {
			name: call.name,
			content: `Note "${noteName}" not found in the vault.`,
			error: "not_found",
		};
	}

	const content = await app.vault.cachedRead(file);
	const trimmed = content.length > MAX_NOTE_CHARS
		? content.slice(0, MAX_NOTE_CHARS) + "\n\n... (truncated)"
		: content;

	return {
		name: call.name,
		content: `## ${file.basename} (${file.path})\n\n${trimmed}`,
	};
}

async function readFolder(
	app: App,
	call: ToolCallRequest,
): Promise<ToolCallResult> {
	const folderPath = (call.input.folder ?? call.input.path ?? "").trim();
	if (!folderPath) {
		return { name: call.name, content: "No folder path provided.", error: "missing_folder" };
	}

	const abstractFile = app.vault.getAbstractFileByPath(folderPath);
	if (!abstractFile || !(abstractFile instanceof TFolder)) {
		return {
			name: call.name,
			content: `Folder "${folderPath}" not found.`,
			error: "not_found",
		};
	}

	const mdFiles = abstractFile.children.filter(
		(f): f is TFile => "extension" in f && (f as TFile).extension === "md",
	) as TFile[];

	if (mdFiles.length === 0) {
		return { name: call.name, content: `Folder "${folderPath}" has no markdown files.` };
	}

	mdFiles.sort((a, b) => b.stat.mtime - a.stat.mtime);

	const parts: string[] = [];
	let totalChars = 0;

	for (const file of mdFiles) {
		const raw = await app.vault.cachedRead(file);
		const charBudget = Math.max(500, MAX_NOTE_CHARS - totalChars);
		const preview = raw.slice(0, charBudget);
		parts.push(`## ${file.basename}\n\n${preview}`);
		totalChars += preview.length;
		if (totalChars >= MAX_NOTE_CHARS) break;
	}

	return {
		name: call.name,
		content: `Folder "${folderPath}" - ${mdFiles.length} note(s):\n\n${parts.join("\n\n---\n\n")}`,
	};
}
