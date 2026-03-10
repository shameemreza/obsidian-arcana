import { Notice } from "obsidian";
import type { SlashCommand, SlashCommandContext } from "../types";

export const taskCommand: SlashCommand = {
	name: "task",
	description: "Create a task from natural language",
	icon: "check-square",

	async execute(ctx: SlashCommandContext): Promise<void> {
		if (!ctx.args) {
			ctx.finalizeStreaming(
				ctx.addAssistantMessage(""),
				"Tell me what the task is. For example: `/task Review vendor submission by Friday #work priority:high`",
			);
			return;
		}

		const el = ctx.addAssistantMessage("", true);
		ctx.updateStreaming(el, "Parsing task…");

		try {
			const task = await ctx.plugin.taskParser.parseWithAI(ctx.args);
			const taskFolder = ctx.plugin.settings.taskFolderPath;

			const file = await ctx.plugin.noteCreator.createTask({
				task,
				taskFolder,
			});

			const parts = [`Created task: **${task.title}**`, ""];
			if (task.due) parts.push(`Due: ${task.due}`);
			if (task.priority !== "medium") parts.push(`Priority: ${task.priority}`);
			if (task.tags?.length) parts.push(`Tags: ${task.tags.map((t) => `#${t}`).join(" ")}`);
			if (task.context) parts.push(`Context: ${task.context}`);
			if (task.time_estimate) parts.push(`Estimate: ${task.time_estimate} min`);
			if (task.difficulty) parts.push(`Difficulty: ${task.difficulty}`);
			parts.push("", `Saved to \`${file.path}\``);

			ctx.finalizeStreaming(el, parts.join("\n"));
			new Notice(`Task created: ${task.title}`);
		} catch (e) {
			const msg = e instanceof Error ? e.message : "Unknown error";
			ctx.finalizeStreaming(el, `Failed to create task: ${msg}`);
		}
	},
};
