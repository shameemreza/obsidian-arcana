import { TFolder, type TFile } from "obsidian";
import type { SlashCommand, SlashCommandContext } from "../types";

const RENDER_THROTTLE_MS = 100;

export const organizeCommand: SlashCommand = {
	name: "organize",
	description: "Analyze inbox/drafts and suggest where to move notes",
	icon: "folder-tree",

	async execute(ctx: SlashCommandContext): Promise<void> {
		const inboxPath = ctx.plugin.settings.inboxFolderPath || "Inbox";
		const inboxFolder = ctx.plugin.app.vault.getAbstractFileByPath(inboxPath);

		if (!inboxFolder || !(inboxFolder instanceof TFolder)) {
			ctx.finalizeStreaming(
				ctx.addAssistantMessage(""),
				`No "${inboxPath}" folder found. Create one or update the inbox path in settings.`,
			);
			return;
		}

		const notes: TFile[] = [];
		for (const child of inboxFolder.children) {
			if ("extension" in child && (child as TFile).extension === "md") {
				notes.push(child as TFile);
			}
		}

		if (notes.length === 0) {
			ctx.finalizeStreaming(
				ctx.addAssistantMessage(""),
				`Inbox is empty. Nothing to organize.`,
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
		ctx.updateStreaming(el, `Analyzing ${notes.length} notes in ${inboxPath}…`);

		try {
			const intelData = await ctx.plugin.vaultIntel.ensureFresh();
			const folderList = intelData.folders
				.filter((f) => f.path !== inboxPath && f.noteCount > 0)
				.map((f) => f.path)
				.slice(0, 30)
				.join(", ");

			const noteDescriptions: string[] = [];
			for (const note of notes.slice(0, 15)) {
				const content = await ctx.plugin.app.vault.cachedRead(note);
				const preview = content.slice(0, 500);
				noteDescriptions.push(`- "${note.basename}": ${preview}`);
			}

			const prompt = [
				`I have ${notes.length} notes in my "${inboxPath}" folder. Suggest where each should go.`,
				"",
				"Existing folders in my vault:",
				folderList || "(no established folders yet)",
				"",
				"Notes to organize:",
				...noteDescriptions,
				"",
				"For each note, suggest a destination folder and a one-line reason.",
				"If a note should stay in inbox, say so.",
				"You may suggest creating new folders if nothing fits.",
			].join("\n");

			let full = "";
			let lastRender = 0;

			for await (const chunk of ctx.plugin.aiEngine.chat(
				[{ role: "user", content: prompt, timestamp: Date.now() }],
				{ systemPrompt: "You're an expert at knowledge management and note organization." },
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
			ctx.finalizeStreaming(el, `Organization failed: ${msg}`);
		}
	},
};
