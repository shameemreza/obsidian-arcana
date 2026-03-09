import { TFolder, type TFile, normalizePath } from "obsidian";
import type { SlashCommand, SlashCommandContext } from "../types";
import { todayISO } from "../../../../utils/dates";
import { buildNoteContent } from "../../../../utils/frontmatter";

const RENDER_THROTTLE_MS = 100;

export const eveningCommand: SlashCommand = {
	name: "evening",
	description: "End-of-day review \u2014 reflect and plan tomorrow",
	icon: "moon",

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
		ctx.updateStreaming(el, "Pulling together your day\u2026");

		try {
			const today = todayISO();
			const taskFolder = ctx.plugin.settings.taskFolderPath;

			const { completed, open } = await collectTodayTasks(ctx, taskFolder, today);

			const prompt = [
				"You're helping with an end-of-day review. Be brief and warm.",
				"",
				`Date: ${today}`,
				"",
				completed.length > 0
					? `Completed today (${completed.length}):\n${completed.map((t) => `- ${t}`).join("\n")}`
					: "No tasks completed today.",
				"",
				open.length > 0
					? `Still open (${open.length}):\n${open.map((t) => `- ${t}`).join("\n")}`
					: "No open tasks remaining.",
				"",
				"Structure the review as:",
				"1. Quick summary of what got done (acknowledge the wins)",
				"2. Note what's still open without judgment",
				"3. Ask: 'What went well today?'",
				"4. Ask: 'What's your top priority for tomorrow?'",
				"",
				"Keep it conversational. No lecture. Like a friend checking in at the end of the day.",
			].join("\n");

			let full = "";
			let lastRender = 0;

			for await (const chunk of ctx.plugin.aiEngine.chat(
				[{ role: "user", content: prompt, timestamp: Date.now() }],
				{ systemPrompt: "End-of-day review partner. Brief, warm, no fluff. Acknowledge wins." },
			)) {
				full += chunk;
				const now = Date.now();
				if (now - lastRender >= RENDER_THROTTLE_MS) {
					ctx.updateStreaming(el, full);
					lastRender = now;
				}
			}

			ctx.finalizeStreaming(el, full);

			await saveToDailyNote(ctx, today, completed, open);

			ctx.appendMessage({
				role: "assistant",
				content: full,
				timestamp: Date.now(),
			});
		} catch (e) {
			const msg = e instanceof Error ? e.message : "Unknown error";
			ctx.finalizeStreaming(el, `Evening review failed: ${msg}`);
		}
	},
};

async function collectTodayTasks(
	ctx: SlashCommandContext,
	folderPath: string,
	today: string,
): Promise<{ completed: string[]; open: string[] }> {
	const app = ctx.plugin.app;
	const folder = app.vault.getAbstractFileByPath(folderPath);
	const completed: string[] = [];
	const open: string[] = [];

	if (!folder || !(folder instanceof TFolder)) return { completed, open };

	for (const child of folder.children) {
		if (!("extension" in child) || (child as TFile).extension !== "md") continue;
		const file = child as TFile;
		const cache = app.metadataCache.getFileCache(file);
		const fm = cache?.frontmatter;
		if (!fm) continue;

		const title = (fm.title as string) ?? file.basename;
		const status = fm.status as string | undefined;

		if (status === "done") {
			const completedDate = fm.completed as string | undefined;
			if (completedDate === today || file.stat.mtime > todayStartMs()) {
				completed.push(title);
			}
		} else if (status !== "cancelled") {
			const due = fm.due as string | undefined;
			const scheduled = fm.scheduled as string | undefined;
			if (due === today || scheduled === today || due && due < today) {
				open.push(`${title}${due && due < today ? " (overdue)" : ""}`);
			}
		}
	}

	return { completed, open };
}

function todayStartMs(): number {
	const now = new Date();
	return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

async function saveToDailyNote(
	ctx: SlashCommandContext,
	today: string,
	completed: string[],
	open: string[],
): Promise<void> {
	const dailyFolder = ctx.plugin.settings.dailyNoteFolderPath;
	const app = ctx.plugin.app;

	const dailyPath = normalizePath(`${dailyFolder}/${today}.md`);
	const existing = app.vault.getAbstractFileByPath(dailyPath);

	const reviewSection = [
		"",
		"## Evening Review",
		"",
		completed.length > 0
			? `**Completed (${completed.length}):**\n${completed.map((t) => `- [x] ${t}`).join("\n")}`
			: "No tasks completed today.",
		"",
		open.length > 0
			? `**Still open (${open.length}):**\n${open.map((t) => `- [ ] ${t}`).join("\n")}`
			: "All caught up!",
		"",
		"**What went well?**\n- ",
		"",
		"**Top priority for tomorrow?**\n- ",
	].join("\n");

	if (existing && existing instanceof TFolder === false) {
		const current = await app.vault.read(existing as TFile);
		await app.vault.modify(existing as TFile, current + "\n" + reviewSection);
	} else {
		const folder = app.vault.getAbstractFileByPath(dailyFolder);
		if (!folder) {
			await app.vault.createFolder(normalizePath(dailyFolder));
		}

		const content = buildNoteContent(
			{ title: `Daily Note - ${today}`, date: today },
			reviewSection,
		);
		await app.vault.create(dailyPath, content);
	}
}
