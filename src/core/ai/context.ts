import { type App, type TFile, TFolder } from "obsidian";
import type { ArcanaSettings } from "../../settings";

export type ContextMode = "note" | "folder" | "vault";

export interface ContextResult {
	mode: ContextMode;
	label: string;
	content: string;
	tokenEstimate: number;
	mentionedNotes: ResolvedMention[];
}

export interface ResolvedMention {
	name: string;
	path: string;
	content: string;
	tokenEstimate: number;
}

const CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
	return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Build the context block that gets prepended to the system prompt.
 * Combines the selected mode's context with any @[[note]] mentions.
 */
export async function buildContext(
	app: App,
	settings: ArcanaSettings,
	mode: ContextMode,
	userMessage: string,
): Promise<ContextResult> {
	const maxTokens = settings.maxContextTokens;
	const mentions = await resolveNoteMentions(app, userMessage);

	let mentionTokens = 0;
	for (const m of mentions) {
		mentionTokens += m.tokenEstimate;
	}
	const budgetForMode = Math.max(0, maxTokens - mentionTokens);

	let modeContent = "";
	let label = "";

	switch (mode) {
		case "note":
			({ content: modeContent, label } = await buildNoteContext(app, budgetForMode));
			break;
		case "folder":
			({ content: modeContent, label } = await buildFolderContext(app, budgetForMode));
			break;
		case "vault":
			({ content: modeContent, label } = await buildVaultContext(app, userMessage, budgetForMode));
			break;
	}

	let full = "";
	if (modeContent) {
		full += modeContent;
	}
	if (mentions.length > 0) {
		if (full) full += "\n\n";
		full += formatMentions(mentions);
	}

	return {
		mode,
		label,
		content: full,
		tokenEstimate: estimateTokens(full),
		mentionedNotes: mentions,
	};
}

/**
 * Format the context for injection into the system prompt.
 * Includes explicit instructions so the AI knows it can read the content.
 */
export function formatContextForPrompt(
	basePrompt: string,
	ctx: ContextResult,
): string {
	if (!ctx.content) return basePrompt;

	const mentionNote = ctx.mentionedNotes.length > 0
		? `The user referenced ${ctx.mentionedNotes.length} note(s) with @[[name]] syntax. Their full contents are included below — use them to answer.`
		: "";

	const instructions = [
		"VAULT CONTEXT",
		"",
		`You have access to the user's vault content below (${ctx.mode} mode — ${ctx.label}).`,
		"This is live content from their Obsidian vault that has been loaded for you.",
		"Reference this content directly when answering. Quote or summarize from it as needed.",
		"Do NOT tell the user you cannot see their notes — you can. The content is right here.",
		mentionNote,
	].filter(Boolean).join("\n");

	return `${basePrompt}\n\n---\n${instructions}\n\n${ctx.content}`;
}

// ---- Note Context (P2-13) ----

async function buildNoteContext(
	app: App,
	maxTokens: number,
): Promise<{ content: string; label: string }> {
	const file = getActiveFile(app);
	if (!file) return { content: "", label: "No active note" };

	const raw = await app.vault.read(file);
	const trimmed = trimToTokenBudget(raw, maxTokens);

	return {
		content: `## Active note: ${file.path}\n\n${trimmed}`,
		label: file.basename,
	};
}

// ---- Folder Context (P2-14) ----

async function buildFolderContext(
	app: App,
	maxTokens: number,
): Promise<{ content: string; label: string }> {
	const file = getActiveFile(app);
	if (!file?.parent) return { content: "", label: "No active folder" };

	const folder = file.parent;
	const siblings = folder.children
		.filter((f): f is TFile => f instanceof TFolder === false && "extension" in f && (f as TFile).extension === "md")
		.sort((a, b) => b.stat.mtime - a.stat.mtime);

	if (siblings.length === 0) return { content: "", label: folder.name };

	const parts: string[] = [`## Folder: ${folder.path} (${siblings.length} notes)\n`];
	let tokens = estimateTokens(parts[0]);

	for (const sibling of siblings) {
		const raw = await app.vault.read(sibling);
		const preview = raw.slice(0, 2000);
		const entryTokens = estimateTokens(preview) + 10;

		if (tokens + entryTokens > maxTokens) {
			parts.push(`\n... and ${siblings.length - parts.length + 1} more notes (truncated to fit token budget)`);
			break;
		}

		parts.push(`### ${sibling.basename}\n${preview}\n`);
		tokens += entryTokens;
	}

	return {
		content: parts.join("\n"),
		label: folder.name,
	};
}

// ---- Vault Context (P2-15) ----

async function buildVaultContext(
	app: App,
	query: string,
	maxTokens: number,
): Promise<{ content: string; label: string }> {
	const files = app.vault.getMarkdownFiles();
	if (files.length === 0) return { content: "", label: "Empty vault" };

	const keywords = extractKeywords(query);
	if (keywords.length === 0) {
		return buildRecentNotesContext(app, files, maxTokens);
	}

	const scored = await scoreFiles(app, files, keywords);
	scored.sort((a, b) => b.score - a.score);

	const relevant = scored.filter((s) => s.score > 0).slice(0, 15);
	if (relevant.length === 0) {
		return buildRecentNotesContext(app, files, maxTokens);
	}

	const parts: string[] = [`## Vault search — ${relevant.length} relevant notes\n`];
	let tokens = estimateTokens(parts[0]);

	for (const { file, score } of relevant) {
		const raw = await app.vault.read(file);
		const preview = raw.slice(0, 1500);
		const entryTokens = estimateTokens(preview) + 10;

		if (tokens + entryTokens > maxTokens) {
			parts.push(`\n... more results truncated to fit token budget`);
			break;
		}

		parts.push(`### ${file.basename} (relevance: ${score})\n${preview}\n`);
		tokens += entryTokens;
	}

	return {
		content: parts.join("\n"),
		label: `Vault (${relevant.length} matches)`,
	};
}

async function buildRecentNotesContext(
	app: App,
	files: TFile[],
	maxTokens: number,
): Promise<{ content: string; label: string }> {
	const sorted = [...files].sort((a, b) => b.stat.mtime - a.stat.mtime).slice(0, 10);

	const parts: string[] = ["## Recent vault notes\n"];
	let tokens = estimateTokens(parts[0]);

	for (const file of sorted) {
		const raw = await app.vault.read(file);
		const preview = raw.slice(0, 1000);
		const entryTokens = estimateTokens(preview) + 10;

		if (tokens + entryTokens > maxTokens) break;

		parts.push(`### ${file.basename}\n${preview}\n`);
		tokens += entryTokens;
	}

	return {
		content: parts.join("\n"),
		label: `Vault (recent)`,
	};
}

// ---- @[[note]] Mention Resolution (P2-16) ----

const MENTION_REGEX = /@\[\[([^\]]+)\]\]/g;

export function extractMentions(text: string): string[] {
	const matches: string[] = [];
	let match: RegExpExecArray | null;
	const regex = new RegExp(MENTION_REGEX.source, "g");

	while ((match = regex.exec(text)) !== null) {
		matches.push(match[1]);
	}
	return matches;
}

export function stripMentions(text: string): string {
	return text.replace(MENTION_REGEX, "[[$1]]");
}

async function resolveNoteMentions(
	app: App,
	text: string,
): Promise<ResolvedMention[]> {
	const names = extractMentions(text);
	const results: ResolvedMention[] = [];
	const seen = new Set<string>();

	for (const name of names) {
		const file = app.metadataCache.getFirstLinkpathDest(name, "");
		if (!file || seen.has(file.path)) continue;
		seen.add(file.path);

		const content = await app.vault.read(file);
		results.push({
			name,
			path: file.path,
			content,
			tokenEstimate: estimateTokens(content),
		});
	}

	return results;
}

function formatMentions(mentions: ResolvedMention[]): string {
	return mentions
		.map((m) => `## Mentioned note: ${m.path}\n\n${m.content}`)
		.join("\n\n");
}

// ---- Token Budget Helper ----

function trimToTokenBudget(text: string, maxTokens: number): string {
	const maxChars = maxTokens * CHARS_PER_TOKEN;
	if (text.length <= maxChars) return text;
	return text.slice(0, maxChars) + "\n\n... (truncated to fit token budget)";
}

// ---- Keyword Extraction ----

const STOP_WORDS = new Set([
	"a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
	"have", "has", "had", "do", "does", "did", "will", "would", "could",
	"should", "may", "might", "can", "shall", "i", "me", "my", "we", "our",
	"you", "your", "he", "she", "it", "they", "them", "this", "that",
	"what", "which", "who", "how", "when", "where", "why", "about", "for",
	"with", "from", "into", "to", "of", "in", "on", "at", "by", "and",
	"or", "not", "but", "if", "so", "then", "than", "as", "just", "also",
	"more", "some", "any", "all", "no", "very", "too", "here", "there",
]);

function extractKeywords(text: string): string[] {
	return text
		.toLowerCase()
		.replace(MENTION_REGEX, "")
		.replace(/[^\w\s-]/g, " ")
		.split(/\s+/)
		.filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

async function scoreFiles(
	app: App,
	files: TFile[],
	keywords: string[],
): Promise<{ file: TFile; score: number }[]> {
	const results: { file: TFile; score: number }[] = [];

	for (const file of files) {
		const cache = app.metadataCache.getFileCache(file);
		const title = file.basename.toLowerCase();
		let score = 0;

		for (const kw of keywords) {
			if (title.includes(kw)) score += 3;
		}

		if (cache?.tags) {
			const tags = cache.tags.map((t) => t.tag.toLowerCase());
			for (const kw of keywords) {
				if (tags.some((t) => t.includes(kw))) score += 2;
			}
		}

		if (cache?.headings) {
			const headings = cache.headings.map((h) => h.heading.toLowerCase());
			for (const kw of keywords) {
				if (headings.some((h) => h.includes(kw))) score += 1;
			}
		}

		if (cache?.frontmatter) {
			const fmStr = JSON.stringify(cache.frontmatter).toLowerCase();
			for (const kw of keywords) {
				if (fmStr.includes(kw)) score += 1;
			}
		}

		results.push({ file, score });
	}

	return results;
}

// ---- Helpers ----

/**
 * Get the active file from the workspace. Uses workspace.getActiveFile()
 * which returns the last-focused file even when the sidebar (chat panel)
 * has focus — unlike getActiveViewOfType(MarkdownView) which returns null
 * when a non-editor view is active.
 */
function getActiveFile(app: App): TFile | null {
	return app.workspace.getActiveFile();
}

/**
 * Compute a quick token estimate for the current context mode
 * without reading full file contents — used for the UI counter.
 */
export async function estimateContextTokens(
	app: App,
	settings: ArcanaSettings,
	mode: ContextMode,
	pendingText: string,
): Promise<number> {
	const mentionNames = extractMentions(pendingText);
	let mentionTokens = 0;
	for (const name of mentionNames) {
		const file = app.metadataCache.getFirstLinkpathDest(name, "");
		if (file) mentionTokens += Math.ceil(file.stat.size / CHARS_PER_TOKEN);
	}

	let modeTokens = 0;
	switch (mode) {
		case "note": {
			const file = getActiveFile(app);
			if (file) modeTokens = Math.ceil(file.stat.size / CHARS_PER_TOKEN);
			break;
		}
		case "folder": {
			const file = getActiveFile(app);
			if (file?.parent) {
				const siblings = file.parent.children.filter(
					(f): f is TFile => "extension" in f && (f as TFile).extension === "md",
				);
				for (const s of siblings) {
					modeTokens += Math.ceil(s.stat.size / CHARS_PER_TOKEN);
				}
			}
			break;
		}
		case "vault": {
			modeTokens = 2000;
			break;
		}
	}

	return Math.min(modeTokens + mentionTokens, settings.maxContextTokens);
}
