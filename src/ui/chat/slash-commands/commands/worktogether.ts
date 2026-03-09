import type { SlashCommand, SlashCommandContext } from "../types";

const RENDER_THROTTLE_MS = 100;

export const worktogetherCommand: SlashCommand = {
	name: "worktogether",
	description: "Start an AI body-double co-working session",
	icon: "users",

	async execute(ctx: SlashCommandContext): Promise<void> {
		const provider = ctx.plugin.aiEngine.getActiveProvider();
		if (!provider.isConfigured()) {
			ctx.finalizeStreaming(
				ctx.addAssistantMessage(""),
				"AI provider isn't configured. Check Arcana settings.",
			);
			return;
		}

		if (!ctx.args) {
			ctx.finalizeStreaming(
				ctx.addAssistantMessage(""),
				[
					"Let's work together. Tell me:",
					"",
					"`/worktogether [what you're working on] [duration in minutes]`",
					"",
					"Example: `/worktogether reviewing vendor proposals 45`",
				].join("\n"),
			);
			return;
		}

		const { task, duration } = parseWorkArgs(ctx.args, ctx.plugin.settings.bodyDoubleInterval);
		const checkInInterval = ctx.plugin.settings.bodyDoubleInterval;
		const startTime = Date.now();
		const endTime = startTime + duration * 60 * 1000;

		const startEl = ctx.addAssistantMessage("", true);
		let startContent = "";
		let lastRender = 0;

		try {
			const prompt = [
				"You're an AI body-double / co-working partner. The user is about to start a focused work session.",
				`They're working on: "${task}"`,
				`Duration: ${duration} minutes`,
				`You'll check in every ${checkInInterval} minutes.`,
				"",
				"Give a brief, encouraging start message. Acknowledge what they're working on.",
				"Be warm but not over the top. Like a friend sitting across the table at a coffee shop.",
				"End with something like 'I'll check in with you in X minutes.'",
			].join("\n");

			for await (const chunk of ctx.plugin.aiEngine.chat(
				[{ role: "user", content: prompt, timestamp: Date.now() }],
				{ systemPrompt: "You're a supportive co-working partner. Brief, warm, no fluff." },
			)) {
				startContent += chunk;
				const now = Date.now();
				if (now - lastRender >= RENDER_THROTTLE_MS) {
					ctx.updateStreaming(startEl, startContent);
					lastRender = now;
				}
			}
			ctx.finalizeStreaming(startEl, startContent);

			ctx.appendMessage({
				role: "assistant",
				content: startContent,
				timestamp: Date.now(),
			});
		} catch (e) {
			const msg = e instanceof Error ? e.message : "Unknown error";
			ctx.finalizeStreaming(startEl, `Couldn't start session: ${msg}`);
			return;
		}

		let checkInCount = 0;
		const checkInMs = checkInInterval * 60 * 1000;

		const interval = window.setInterval(async () => {
			const now = Date.now();
			const elapsed = Math.round((now - startTime) / 60000);

			if (now >= endTime) {
				window.clearInterval(interval);
				await sendSessionEnd(ctx, task, duration);
				return;
			}

			checkInCount++;
			await sendCheckIn(ctx, task, elapsed, duration, checkInCount);
		}, checkInMs);

		ctx.plugin.registerInterval(interval);
		ctx.setInputEnabled(true);
	},
};

function parseWorkArgs(args: string, defaultDuration: number): { task: string; duration: number } {
	const durationMatch = args.match(/\b(\d{1,3})\s*(?:min(?:utes?)?|m)?\s*$/i);
	let duration = defaultDuration * 3;
	let task = args;

	if (durationMatch) {
		const parsed = parseInt(durationMatch[1], 10);
		if (parsed > 0 && parsed <= 480) {
			duration = parsed;
			task = args.slice(0, durationMatch.index).trim();
		}
	}

	return { task: task || "focused work", duration };
}

async function sendCheckIn(
	ctx: SlashCommandContext,
	task: string,
	elapsed: number,
	total: number,
	count: number,
): Promise<void> {
	const remaining = total - elapsed;
	const el = ctx.addAssistantMessage("", true);
	let content = "";
	let lastRender = 0;

	try {
		const prompt = [
			`Check-in #${count} for body-double session.`,
			`Task: "${task}"`,
			`Elapsed: ${elapsed} minutes. Remaining: ${remaining} minutes.`,
			"",
			"Send a brief, friendly check-in. Ask how it's going or if they need help.",
			"Keep it to 1-2 sentences max. Varied, don't repeat the same phrasing each time.",
		].join("\n");

		for await (const chunk of ctx.plugin.aiEngine.chat(
			[{ role: "user", content: prompt, timestamp: Date.now() }],
			{ systemPrompt: "Brief co-working check-in. One or two sentences. Warm, not pushy." },
		)) {
			content += chunk;
			const now = Date.now();
			if (now - lastRender >= RENDER_THROTTLE_MS) {
				ctx.updateStreaming(el, content);
				lastRender = now;
			}
		}
	} catch {
		content = `Check-in: ${elapsed}min in, ${remaining}min left. How's it going?`;
	}

	ctx.finalizeStreaming(el, content);
	ctx.appendMessage({ role: "assistant", content, timestamp: Date.now() });
}

async function sendSessionEnd(
	ctx: SlashCommandContext,
	task: string,
	duration: number,
): Promise<void> {
	const el = ctx.addAssistantMessage("", true);
	let content = "";
	let lastRender = 0;

	try {
		const prompt = [
			"The body-double co-working session just ended.",
			`Task: "${task}"`,
			`Total duration: ${duration} minutes`,
			"",
			"Summarize the session. Be encouraging but not cheesy.",
			"Mention the time worked and ask if they're ready for the next task.",
			'Something like: "You worked 47 minutes on \'Review vendor submission.\' Nice. Ready for the next task?"',
		].join("\n");

		for await (const chunk of ctx.plugin.aiEngine.chat(
			[{ role: "user", content: prompt, timestamp: Date.now() }],
			{ systemPrompt: "Session wrap-up. Brief, warm, encouraging." },
		)) {
			content += chunk;
			const now = Date.now();
			if (now - lastRender >= RENDER_THROTTLE_MS) {
				ctx.updateStreaming(el, content);
				lastRender = now;
			}
		}
	} catch {
		content = `Session complete. You worked ${duration} minutes on "${task}". Nice work. Ready for something else?`;
	}

	ctx.finalizeStreaming(el, content);
	ctx.appendMessage({ role: "assistant", content, timestamp: Date.now() });
}
