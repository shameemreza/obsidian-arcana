import type { TFile } from "obsidian";
import type { SlashCommand, SlashCommandContext } from "../types";

export const findCommand: SlashCommand = {
	name: "find",
	description: "Search your vault for relevant notes",
	icon: "search",

	async execute(ctx: SlashCommandContext): Promise<void> {
		if (!ctx.args) {
			ctx.finalizeStreaming(
				ctx.addAssistantMessage(""),
				"What should I look for? For example: `/find meeting notes about Q3 budget`",
			);
			return;
		}

		const el = ctx.addAssistantMessage("", true);
		ctx.updateStreaming(el, "Searching vault…");

		try {
			const files = ctx.plugin.app.vault.getMarkdownFiles();
			const keywords = extractSearchKeywords(ctx.args);
			const scored = await scoreAndRank(ctx, files, keywords);
			const top = scored.slice(0, 8);

			if (top.length === 0) {
				ctx.finalizeStreaming(el, `No results for "${ctx.args}". Try different keywords.`);
				return;
			}

			const parts = [`Found **${top.length}** notes matching "${ctx.args}":\n`];

			for (const { file, score, preview } of top) {
				parts.push(`**[[${file.basename}]]** - \`${file.path}\` (score: ${score})`);
				if (preview) parts.push(`> ${preview}\n`);
			}

			ctx.finalizeStreaming(el, parts.join("\n"));
		} catch (e) {
			const msg = e instanceof Error ? e.message : "Unknown error";
			ctx.finalizeStreaming(el, `Search failed: ${msg}`);
		}
	},
};

interface ScoredFile {
	file: TFile;
	score: number;
	preview: string;
}

const STOP_WORDS = new Set([
	"a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
	"have", "has", "had", "do", "does", "did", "will", "would", "could",
	"should", "may", "might", "can", "i", "me", "my", "we", "our",
	"you", "your", "he", "she", "it", "they", "this", "that", "what",
	"which", "who", "how", "when", "where", "why", "about", "for",
	"with", "from", "to", "of", "in", "on", "at", "by", "and", "or",
	"not", "but", "if", "so", "then", "as", "just", "also",
]);

function extractSearchKeywords(text: string): string[] {
	return text
		.toLowerCase()
		.replace(/[^\w\s-]/g, " ")
		.split(/\s+/)
		.filter((w) => w.length > 2 && !STOP_WORDS.has(w));
}

async function scoreAndRank(
	ctx: SlashCommandContext,
	files: TFile[],
	keywords: string[],
): Promise<ScoredFile[]> {
	const app = ctx.plugin.app;
	const results: ScoredFile[] = [];

	for (const file of files) {
		const cache = app.metadataCache.getFileCache(file);
		const title = file.basename.toLowerCase();
		let score = 0;

		for (const kw of keywords) {
			if (title.includes(kw)) score += 5;
		}

		if (cache?.tags) {
			const tags = cache.tags.map((t) => t.tag.toLowerCase());
			for (const kw of keywords) {
				if (tags.some((t) => t.includes(kw))) score += 3;
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
			const raw = await app.vault.cachedRead(file);
			const preview = findMatchingLine(raw, keywords);
			results.push({ file, score, preview });
		}
	}

	results.sort((a, b) => b.score - a.score);
	return results;
}

function findMatchingLine(content: string, keywords: string[]): string {
	const lines = content.split("\n").filter((l) => l.trim());
	const lower = lines.map((l) => l.toLowerCase());

	for (let i = 0; i < lower.length; i++) {
		if (keywords.some((kw) => lower[i].includes(kw))) {
			return lines[i].slice(0, 120).trim();
		}
	}
	return lines[0]?.slice(0, 120).trim() ?? "";
}
