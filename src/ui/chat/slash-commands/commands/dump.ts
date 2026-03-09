import { Notice } from "obsidian";
import type { SlashCommand, SlashCommandContext } from "../types";

export const dumpCommand: SlashCommand = {
	name: "dump",
	description: "Brain dump \u2014 capture messy thoughts, extract tasks and notes",
	icon: "brain",

	async execute(ctx: SlashCommandContext): Promise<void> {
		if (!ctx.args) {
			ctx.finalizeStreaming(
				ctx.addAssistantMessage(""),
				[
					"Brain dump mode. Just pour everything out after the command:",
					"",
					"`/dump I need to call the dentist and also finish the Q3 report, oh and remind me to buy milk. I had an idea about restructuring the onboarding flow, maybe using progressive disclosure...`",
					"",
					"I'll sort through the mess and create tasks, notes, and reminders from it.",
				].join("\n"),
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
		ctx.updateStreaming(el, "Processing your brain dump\u2026");

		try {
			const prompt = [
				"The user just did a brain dump. Process this raw stream-of-consciousness text and extract structured items.",
				"",
				"Raw input:",
				'"""',
				ctx.args,
				'"""',
				"",
				"Extract and categorize everything into JSON. Respond with ONLY valid JSON, no markdown fences:",
				"{",
				'  "tasks": [{"title": "...", "priority": "high|medium|low", "due": "YYYY-MM-DD or null"}],',
				'  "notes": [{"title": "...", "content": "..."}],',
				'  "reminders": [{"title": "...", "when": "natural language time or null"}]',
				"}",
				"",
				"Rules:",
				"- Action items become tasks (things to DO)",
				"- Ideas and thoughts become notes (things to REMEMBER)",
				"- Time-sensitive mentions become reminders",
				"- Clean up the language but preserve the user's intent",
				"- It's fine if some categories are empty",
			].join("\n");

			const response = await ctx.plugin.aiEngine.chatComplete(
				[{ role: "user", content: prompt, timestamp: Date.now() }],
				{ temperature: 0.1, maxTokens: 1500 },
			);

			const json = extractJSON(response);
			if (!json) {
				ctx.finalizeStreaming(el, "Couldn't parse the brain dump. Try rephrasing or being more specific.");
				return;
			}

			const tasks = Array.isArray(json.tasks) ? json.tasks : [];
			const notes = Array.isArray(json.notes) ? json.notes : [];
			const reminders = Array.isArray(json.reminders) ? json.reminders : [];

			const parts: string[] = ["Here's what I extracted:\n"];
			let createdCount = 0;

			if (tasks.length > 0) {
				parts.push("**Tasks:**");
				for (const t of tasks) {
					if (typeof t.title !== "string") continue;
					try {
						const task = await ctx.plugin.taskParser.parseWithAI(
							`${t.title}${t.due ? ` by ${t.due}` : ""}${t.priority ? ` priority:${t.priority}` : ""}`,
						);
						await ctx.plugin.noteCreator.createTask({
							task,
							taskFolder: ctx.plugin.settings.taskFolderPath,
						});
						parts.push(`- [x] ${task.title}${task.due ? ` (due ${task.due})` : ""}`);
						createdCount++;
					} catch {
						parts.push(`- [ ] ${t.title} *(failed to create)*`);
					}
				}
				parts.push("");
			}

			if (notes.length > 0) {
				parts.push("**Notes:**");
				for (const n of notes) {
					if (typeof n.title !== "string") continue;
					try {
						await ctx.plugin.noteCreator.createNote({
							title: n.title,
							content: typeof n.content === "string" ? n.content : "",
						});
						parts.push(`- ${n.title}`);
						createdCount++;
					} catch {
						parts.push(`- ${n.title} *(failed to create)*`);
					}
				}
				parts.push("");
			}

			if (reminders.length > 0) {
				parts.push("**Reminders:**");
				for (const r of reminders) {
					if (typeof r.title !== "string") continue;
					try {
						const task = await ctx.plugin.taskParser.parseWithAI(
							`${r.title}${typeof r.when === "string" ? ` by ${r.when}` : ""}`,
						);
						await ctx.plugin.noteCreator.createTask({
							task,
							taskFolder: ctx.plugin.settings.taskFolderPath,
						});
						parts.push(`- ${r.title}${typeof r.when === "string" ? ` (${r.when})` : ""}`);
						createdCount++;
					} catch {
						parts.push(`- ${r.title} *(failed to create)*`);
					}
				}
				parts.push("");
			}

			parts.push(`---\nCreated **${createdCount}** items. Your head should feel lighter now.`);
			ctx.finalizeStreaming(el, parts.join("\n"));

			if (createdCount > 0) {
				new Notice(`Brain dump processed: ${createdCount} items created`);
			}
		} catch (e) {
			const msg = e instanceof Error ? e.message : "Unknown error";
			ctx.finalizeStreaming(el, `Brain dump processing failed: ${msg}`);
		}
	},
};

function extractJSON(text: string): Record<string, unknown> | null {
	const match = text.match(/\{[\s\S]*\}/);
	if (!match) return null;
	try {
		return JSON.parse(match[0]) as Record<string, unknown>;
	} catch {
		return null;
	}
}
