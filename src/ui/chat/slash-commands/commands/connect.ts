import type { SlashCommand, SlashCommandContext } from "../types";

const RENDER_THROTTLE_MS = 100;

export const connectCommand: SlashCommand = {
	name: "connect",
	description: "Find notes related to the current note",
	icon: "git-branch",

	async execute(ctx: SlashCommandContext): Promise<void> {
		const file = ctx.plugin.app.workspace.getActiveFile();
		if (!file) {
			ctx.finalizeStreaming(
				ctx.addAssistantMessage(""),
				"No active note. Open a note first so I can find connections.",
			);
			return;
		}

		const provider = ctx.plugin.aiEngine.getActiveProvider();
		if (!provider.isConfigured()) {
			ctx.finalizeStreaming(
				ctx.addAssistantMessage(""),
				"AI provider isn't configured. Check Arcana settings.",
			);
			return;
		}

		const el = ctx.addAssistantMessage("", true);
		ctx.updateStreaming(el, `Finding connections for "${file.basename}"…`);

		try {
			const content = await ctx.plugin.app.vault.read(file);
			const allFiles = ctx.plugin.app.vault.getMarkdownFiles()
				.filter((f) => f.path !== file.path);

			const keywords = extractKeywordsFromContent(content, file.basename);
			const candidates: { path: string; basename: string; score: number; preview: string }[] = [];

			for (const other of allFiles) {
				const cache = ctx.plugin.app.metadataCache.getFileCache(other);
				const title = other.basename.toLowerCase();
				let score = 0;

				for (const kw of keywords) {
					if (title.includes(kw)) score += 4;
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

				if (cache?.links) {
					const links = cache.links.map((l) => l.link.toLowerCase());
					const myName = file.basename.toLowerCase();
					if (links.some((l) => l.includes(myName))) score += 5;
				}

				const backlinks = ctx.plugin.app.metadataCache.getFileCache(file);
				if (backlinks?.links) {
					const myLinks = backlinks.links.map((l) => l.link.toLowerCase());
					if (myLinks.some((l) => l.includes(other.basename.toLowerCase()))) {
						score += 5;
					}
				}

				if (score > 0) {
					const raw = await ctx.plugin.app.vault.cachedRead(other);
					const preview = raw.split("\n").find((l) => l.trim())?.slice(0, 100) ?? "";
					candidates.push({ path: other.path, basename: other.basename, score, preview });
				}
			}

			candidates.sort((a, b) => b.score - a.score);
			const top = candidates.slice(0, 10);

			if (top.length === 0) {
				const prompt = [
					`I'm looking at "${file.basename}". Here's its content:`,
					content.slice(0, 4000),
					"",
					"Here are some notes in my vault:",
					...allFiles.slice(0, 40).map((f) => `- ${f.basename} (${f.path})`),
					"",
					"Which of these notes might be related to my current note, and why? Suggest connections I should make with [[wikilinks]].",
				].join("\n");

				let full = "";
				let lastRender = 0;

				for await (const chunk of ctx.plugin.aiEngine.chat(
					[{ role: "user", content: prompt, timestamp: Date.now() }],
					{ systemPrompt: "You help connect ideas across a knowledge base. Be specific about why notes relate." },
				)) {
					full += chunk;
					const now = Date.now();
					if (now - lastRender >= RENDER_THROTTLE_MS) {
						ctx.updateStreaming(el, full);
						lastRender = now;
					}
				}

				ctx.finalizeStreaming(el, full);
				return;
			}

			const parts = [`Connections for **${file.basename}**:\n`];
			for (const c of top) {
				parts.push(`- **[[${c.basename}]]** — \`${c.path}\` (strength: ${c.score})`);
				if (c.preview) parts.push(`  > ${c.preview}`);
			}
			parts.push("", "Consider linking these notes together with `[[wikilinks]]`.");

			ctx.finalizeStreaming(el, parts.join("\n"));
		} catch (e) {
			const msg = e instanceof Error ? e.message : "Unknown error";
			ctx.finalizeStreaming(el, `Connection search failed: ${msg}`);
		}
	},
};

function extractKeywordsFromContent(content: string, title: string): string[] {
	const text = `${title} ${content.slice(0, 3000)}`;
	const STOP = new Set([
		"a", "an", "the", "is", "are", "was", "were", "be", "been",
		"have", "has", "had", "do", "does", "did", "will", "would",
		"could", "should", "may", "might", "can", "i", "me", "my",
		"we", "our", "you", "your", "he", "she", "it", "they", "this",
		"that", "what", "which", "who", "how", "when", "where", "why",
		"about", "for", "with", "from", "to", "of", "in", "on", "at",
		"by", "and", "or", "not", "but", "if", "so", "then", "as",
		"just", "also", "more", "some", "any", "all", "no", "very",
	]);

	const words = text
		.toLowerCase()
		.replace(/[^\w\s-]/g, " ")
		.split(/\s+/)
		.filter((w) => w.length > 3 && !STOP.has(w));

	const freq = new Map<string, number>();
	for (const w of words) {
		freq.set(w, (freq.get(w) ?? 0) + 1);
	}

	return [...freq.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, 15)
		.map(([w]) => w);
}
