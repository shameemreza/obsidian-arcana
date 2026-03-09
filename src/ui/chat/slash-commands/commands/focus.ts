import type { SlashCommand, SlashCommandContext } from "../types";

export const focusCommand: SlashCommand = {
	name: "focus",
	description: "Start a focus timer countdown",
	icon: "timer",

	async execute(ctx: SlashCommandContext): Promise<void> {
		const settings = ctx.plugin.settings;
		let minutes = settings.focusWorkMinutes;

		if (ctx.args) {
			const parsed = parseInt(ctx.args, 10);
			if (!isNaN(parsed) && parsed > 0 && parsed <= 240) {
				minutes = parsed;
			}
		}

		const file = ctx.plugin.app.workspace.getActiveFile();
		const taskLabel = file ? `"${file.basename}"` : "your current task";

		const el = ctx.addAssistantMessage("", true);
		const endTime = Date.now() + minutes * 60 * 1000;

		const formatTime = (ms: number): string => {
			const totalSec = Math.max(0, Math.ceil(ms / 1000));
			const m = Math.floor(totalSec / 60);
			const s = totalSec % 60;
			return `${m}:${s.toString().padStart(2, "0")}`;
		};

		ctx.updateStreaming(el, buildTimerMessage(taskLabel, minutes, formatTime(minutes * 60 * 1000), false));
		ctx.setInputEnabled(true);

		const interval = window.setInterval(() => {
			const remaining = endTime - Date.now();
			if (remaining <= 0) {
				window.clearInterval(interval);
				ctx.finalizeStreaming(el, buildTimerComplete(taskLabel, minutes));
				return;
			}
			ctx.updateStreaming(el, buildTimerMessage(taskLabel, minutes, formatTime(remaining), true));
		}, 1000);

		ctx.plugin.registerInterval(interval);
	},
};

function buildTimerMessage(taskLabel: string, total: number, remaining: string, ticking: boolean): string {
	const header = ticking ? "Focus session in progress" : "Focus session started";
	return [
		`**${header}** - ${total} minutes on ${taskLabel}`,
		"",
		`\`${remaining}\` remaining`,
		"",
		"Stay focused. I'll let you know when time's up.",
	].join("\n");
}

function buildTimerComplete(taskLabel: string, minutes: number): string {
	return [
		`**Focus session complete!**`,
		"",
		`You worked ${minutes} minutes on ${taskLabel}.`,
		"",
		"Time for a break. Stand up, stretch, get some water.",
	].join("\n");
}
