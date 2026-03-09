import { TFolder, type TFile } from "obsidian";
import type { SlashCommand, SlashCommandContext } from "../types";

const RENDER_THROTTLE_MS = 100;

export const nextCommand: SlashCommand = {
	name: "next",
	description: "AI recommends your next task with a first micro-step",
	icon: "arrow-right-circle",

	async execute(ctx: SlashCommandContext): Promise<void> {
		const provider = ctx.plugin.aiEngine.getActiveProvider();
		if (!provider.isConfigured()) {
			ctx.finalizeStreaming(
				ctx.addAssistantMessage(""),
				"AI provider isn't configured. Check Arcana settings.",
			);
			return;
		}

		const el = ctx.addAssistantMessage("", true);
		ctx.updateStreaming(el, "Analyzing your tasks…");

		try {
			const taskFolder = ctx.plugin.settings.taskFolderPath;
			const tasks = await collectOpenTasks(ctx, taskFolder);

			if (tasks.length === 0) {
				ctx.finalizeStreaming(el, "No open tasks found. Create some with `/task` first.");
				return;
			}

			const hour = new Date().getHours();
			const timeOfDay = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
			const chronotype = ctx.plugin.settings.chronotype;

			const prompt = [
				"You are a productivity coach helping someone with ADHD decide what to work on RIGHT NOW.",
				"",
				"Rules:",
				"- Recommend exactly ONE task. Not a list, not options, one clear action.",
				"- Include a 'first micro-step', the very first physical/mental action to start (e.g., 'Open the vendor doc and read the first paragraph').",
				"- Factor in time of day, energy patterns, and due dates.",
				"- Urgent/overdue tasks take priority unless there's a good reason not to.",
				"- Don't be preachy. Be direct and warm.",
				"",
				`Time of day: ${timeOfDay} (${hour}:00)`,
				`Chronotype: ${chronotype}`,
				"",
				"Open tasks:",
				...tasks.map((t) => `- ${t}`),
			].join("\n");

			let full = "";
			let lastRender = 0;

			for await (const chunk of ctx.plugin.aiEngine.chat(
				[{ role: "user", content: prompt, timestamp: Date.now() }],
				{ systemPrompt: "You give direct, actionable task recommendations. One task. One micro-step. No fluff." },
			)) {
				full += chunk;
				const now = Date.now();
				if (now - lastRender >= RENDER_THROTTLE_MS) {
					ctx.updateStreaming(el, full);
					lastRender = now;
				}
			}

			ctx.finalizeStreaming(el, full);
		} catch (e) {
			const msg = e instanceof Error ? e.message : "Unknown error";
			ctx.finalizeStreaming(el, `Failed to analyze tasks: ${msg}`);
		}
	},
};

async function collectOpenTasks(ctx: SlashCommandContext, folderPath: string): Promise<string[]> {
	const app = ctx.plugin.app;
	const folder = app.vault.getAbstractFileByPath(folderPath);
	if (!folder || !(folder instanceof TFolder)) return [];

	const tasks: string[] = [];

	for (const child of folder.children) {
		if (!("extension" in child) || (child as TFile).extension !== "md") continue;
		const file = child as TFile;
		const cache = app.metadataCache.getFileCache(file);
		const fm = cache?.frontmatter;
		if (!fm) continue;

		const status = fm.status as string | undefined;
		if (status === "done" || status === "cancelled") continue;

		const parts = [fm.title ?? file.basename];
		if (fm.priority && fm.priority !== "medium") parts.push(`[${fm.priority}]`);
		if (fm.due) parts.push(`due: ${fm.due}`);
		if (fm.scheduled) parts.push(`scheduled: ${fm.scheduled}`);
		if (fm.tags?.length) parts.push(`tags: ${(fm.tags as string[]).join(", ")}`);
		if (fm.time_estimate) parts.push(`~${fm.time_estimate}min`);
		if (fm.status) parts.push(`(${fm.status})`);

		tasks.push(parts.join(" "));
	}

	return tasks;
}
