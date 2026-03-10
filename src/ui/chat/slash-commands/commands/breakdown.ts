import { Notice } from "obsidian";
import type { SlashCommand, SlashCommandContext } from "../types";

export const breakdownCommand: SlashCommand = {
	name: "breakdown",
	description: "Break the current task into smaller subtasks using AI",
	icon: "list-tree",

	async execute(ctx: SlashCommandContext): Promise<void> {
		const file = ctx.plugin.app.workspace.getActiveFile();
		if (!file) {
			ctx.finalizeStreaming(
				ctx.addAssistantMessage(""),
				"Open a task note first, then run `/breakdown` to split it into subtasks.",
			);
			return;
		}

		if (!ctx.plugin.taskChunking.canChunk(file)) {
			ctx.finalizeStreaming(
				ctx.addAssistantMessage(""),
				"The active note is not a chunking-eligible task. It must be an open task note with a valid status.",
			);
			return;
		}

		const provider = ctx.plugin.aiEngine.getActiveProvider();
		if (!provider.isConfigured()) {
			ctx.finalizeStreaming(
				ctx.addAssistantMessage(""),
				"AI provider is not configured. Set up an AI provider in Arcana settings to use task breakdown.",
			);
			return;
		}

		const el = ctx.addAssistantMessage("", true);
		ctx.updateStreaming(el, "Analyzing task and generating subtasks...");

		try {
			const subtasks =
				await ctx.plugin.taskChunking.generateSubtasks(file);

			if (subtasks.length === 0) {
				ctx.finalizeStreaming(
					el,
					"Could not generate subtasks for this task. Try adding more detail to the task notes.",
				);
				return;
			}

			ctx.updateStreaming(
				el,
				`Creating ${subtasks.length} subtask(s)...`,
			);

			const files =
				await ctx.plugin.taskChunking.createSubtasks(file, subtasks);

			const lines = ["Broke this task into subtasks:", ""];
			for (const sub of subtasks) {
				let line = `- **${sub.title}**`;
				if (sub.time_estimate) line += ` (~${sub.time_estimate} min)`;
				if (sub.description) line += `\n  ${sub.description}`;
				lines.push(line);
			}
			lines.push(
				"",
				`Created ${files.length} subtask note(s). Parent progress has been updated.`,
			);

			ctx.finalizeStreaming(el, lines.join("\n"));
			new Notice(`Created ${files.length} subtask(s)`);
		} catch (e) {
			const msg = e instanceof Error ? e.message : "Unknown error";
			ctx.finalizeStreaming(
				el,
				`Failed to break down task: ${msg}`,
			);
		}
	},
};
