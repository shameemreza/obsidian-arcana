import type { SlashCommand, SlashCommandContext } from "../types";
import type { TaskFrontmatter, TaskStatus, TaskPriority } from "../../../../types";
import { extractTasksFromContent } from "../../../../core/vault/task-parser";
import { todayISO } from "../../../../utils/dates";

export const extractTasksCommand: SlashCommand = {
	name: "extract",
	description: "Detect action items in the current note and create tasks",
	icon: "list-checks",

	async execute(ctx: SlashCommandContext): Promise<void> {
		const provider = ctx.plugin.aiEngine.getActiveProvider();
		if (!provider.isConfigured()) {
			ctx.finalizeStreaming(
				ctx.addAssistantMessage(""),
				"AI provider is not configured. Set up an AI provider in Arcana settings to use this command.",
			);
			return;
		}

		const activeFile = ctx.plugin.app.workspace.getActiveFile();
		let noteContent = ctx.args;

		if (!noteContent && activeFile) {
			noteContent = await ctx.plugin.app.vault.read(activeFile);
		}

		if (!noteContent) {
			ctx.finalizeStreaming(
				ctx.addAssistantMessage(""),
				"No content to analyze. Open a note or provide text after `/extract`.",
			);
			return;
		}

		const el = ctx.addAssistantMessage("", true);
		ctx.updateStreaming(el, "Analyzing note for action items...");

		try {
			const items = await extractTasksFromContent(
				ctx.plugin.aiEngine,
				noteContent,
			);

			if (items.length === 0) {
				ctx.finalizeStreaming(
					el,
					"No action items detected in this note.",
				);
				return;
			}

			const lines = [`**Found ${items.length} action item(s):**\n`];
			for (let i = 0; i < items.length; i++) {
				const t = items[i];
				const due = t.due ? ` (due: ${t.due})` : "";
				const pri = t.priority ? ` [${t.priority}]` : "";
				lines.push(`${i + 1}. ${t.title}${due}${pri}`);
			}
			lines.push("");
			lines.push("Creating task notes...");
			ctx.updateStreaming(el, lines.join("\n"));

			const settings = ctx.plugin.settings;
			let created = 0;

			for (const item of items) {
				const task: TaskFrontmatter = {
					title: item.title,
					status:
						(settings.defaultTaskStatus as TaskStatus) || "inbox",
					priority: (item.priority ||
						settings.defaultTaskPriority ||
						"medium") as TaskPriority,
					created: todayISO(),
					...(item.due &&
					item.due.match(/^\d{4}-\d{2}-\d{2}$/)
						? { due: item.due }
						: {}),
				};

				try {
					await ctx.plugin.noteCreator.createTask({
						task,
						taskFolder: settings.taskFolderPath,
					});
					created++;
				} catch {
					// Skip failed individual task creation
				}
			}

			lines.pop();
			lines.push("");
			lines.push(
				`Created ${created} task(s) in \`${settings.taskFolderPath}/\`.`,
			);
			ctx.finalizeStreaming(el, lines.join("\n"));
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			ctx.finalizeStreaming(el, `Failed to extract tasks: ${msg}`);
		}
	},
};
