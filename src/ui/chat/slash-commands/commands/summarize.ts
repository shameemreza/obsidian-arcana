import type { SlashCommand, SlashCommandContext } from "../types";

const RENDER_THROTTLE_MS = 100;

export const summarizeCommand: SlashCommand = {
	name: "summarize",
	description: "Summarize pasted content or the current note",
	icon: "file-text",

	async execute(ctx: SlashCommandContext): Promise<void> {
		const provider = ctx.plugin.aiEngine.getActiveProvider();
		if (!provider.isConfigured()) {
			ctx.finalizeStreaming(
				ctx.addAssistantMessage(""),
				"AI provider isn't configured. Check Arcana settings.",
			);
			return;
		}

		let content: string;
		let sourceLabel: string;

		if (ctx.args.trim()) {
			content = ctx.args.trim();
			sourceLabel = "pasted content";
		} else {
			const file = ctx.plugin.app.workspace.getActiveFile();
			if (!file) {
				ctx.finalizeStreaming(
					ctx.addAssistantMessage(""),
					"Nothing to summarize. Paste some text after the command, or open a note first.\n\nExample: `/summarize [paste your text here]`",
				);
				return;
			}

			content = await ctx.plugin.app.vault.read(file);
			if (!content.trim()) {
				ctx.finalizeStreaming(
					ctx.addAssistantMessage(""),
					`**${file.basename}** is empty — nothing to summarize.`,
				);
				return;
			}
			sourceLabel = file.basename;
		}

		const el = ctx.addAssistantMessage("", true);
		let full = "";
		let lastRender = 0;

		try {
			const prompt = [
				`Summarize this concisely. Source: "${sourceLabel}"`,
				"",
				"Content:",
				content.slice(0, 12000),
			].join("\n");

			for await (const chunk of ctx.plugin.aiEngine.chat(
				[{ role: "user", content: prompt, timestamp: Date.now() }],
				{ systemPrompt: "You write clear, concise summaries. No fluff." },
			)) {
				full += chunk;
				const now = Date.now();
				if (now - lastRender >= RENDER_THROTTLE_MS) {
					ctx.updateStreaming(el, full);
					lastRender = now;
				}
			}
		} catch (e) {
			const msg = e instanceof Error ? e.message : "Unknown error";
			full = full ? `${full}\n\n---\n*Error: ${msg}*` : `*Error: ${msg}*`;
		}

		ctx.finalizeStreaming(el, full);
	},
};
