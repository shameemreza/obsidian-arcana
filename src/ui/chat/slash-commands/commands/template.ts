import { Notice } from "obsidian";
import type { SlashCommand, SlashCommandContext } from "../types";

const RENDER_THROTTLE_MS = 100;

export const templateCommand: SlashCommand = {
	name: "template",
	description: "Generate a note template with AI",
	icon: "file-plus-2",

	async execute(ctx: SlashCommandContext): Promise<void> {
		if (!ctx.args) {
			ctx.finalizeStreaming(
				ctx.addAssistantMessage(""),
				"Describe the template you want. For example: `/template meeting notes for weekly standup`",
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
		ctx.updateStreaming(el, "Generating template…");

		try {
			const prompt = [
				`Create an Obsidian note template for: "${ctx.args}"`,
				"",
				"Requirements:",
				"- Start with YAML frontmatter (between --- delimiters) with relevant properties",
				"- Use Markdown headings and structure",
				"- Include placeholder text in brackets like [Project name] where the user should fill in",
				"- Use Obsidian features: tags, wikilinks placeholders, checkboxes where appropriate",
				"- Keep it practical and ready to use",
				"",
				"Return ONLY the template content, no explanations around it.",
			].join("\n");

			let full = "";
			let lastRender = 0;

			for await (const chunk of ctx.plugin.aiEngine.chat(
				[{ role: "user", content: prompt, timestamp: Date.now() }],
				{ systemPrompt: "You create practical Obsidian note templates. Clean formatting, no fluff." },
			)) {
				full += chunk;
				const now = Date.now();
				if (now - lastRender >= RENDER_THROTTLE_MS) {
					ctx.updateStreaming(el, full);
					lastRender = now;
				}
			}

			const titleMatch = ctx.args.match(/^(.+?)(?:\s+for\s+|\s+template\s*$|\s*$)/i);
			const title = titleMatch
				? `Template - ${titleMatch[1].trim()}`
				: `Template - ${ctx.args.slice(0, 50)}`;

			const templateContent = full.replace(/^```\w*\n?/, "").replace(/\n?```$/, "");

			await ctx.plugin.noteCreator.createNote({
				title,
				content: templateContent,
				open: true,
			});

			const result = full + `\n\n---\nSaved as **${title}** and opened.`;
			ctx.finalizeStreaming(el, result);
			new Notice(`Template created: ${title}`);
		} catch (e) {
			const msg = e instanceof Error ? e.message : "Unknown error";
			ctx.finalizeStreaming(el, `Template generation failed: ${msg}`);
		}
	},
};
