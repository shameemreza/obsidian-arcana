import { type App, normalizePath } from "obsidian";
import type { ArcanaSettings } from "../settings";
import type { AIEngine } from "./ai/ai-engine";
import type {
	ChatMessage,
	Conversation,
	ConversationMeta,
} from "../types";

const MESSAGE_SEPARATOR = "\n\n---\n\n";
const ROLE_PREFIX_USER = "##### You";
const ROLE_PREFIX_ASSISTANT = "##### Arcana";
const ROLE_PREFIX_SYSTEM = "##### System";
const UNTITLED = "New conversation";

/**
 * Persists chat conversations as markdown files.
 * Uses vault.adapter (filesystem-level) throughout so dot-prefixed
 * folders like `.arcana/chats/` work reliably — Obsidian's high-level
 * vault API doesn't index hidden paths.
 */
export class ChatHistory {
	constructor(
		private app: App,
		private getSettings: () => ArcanaSettings,
		private aiEngine: AIEngine,
	) {}

	private get folderPath(): string {
		return normalizePath(
			this.getSettings().chatHistoryPath || ".arcana/chats",
		);
	}

	private get adapter() {
		return this.app.vault.adapter;
	}

	private debug(msg: string, ...args: unknown[]): void {
		if (this.getSettings().debugLogging) {
			console.log(`[Arcana ChatHistory] ${msg}`, ...args);
		}
	}

	async ensureFolder(): Promise<void> {
		const target = this.folderPath;
		const exists = await this.adapter.exists(target);
		if (exists) return;

		const parts = target.split("/");
		let current = "";
		for (const part of parts) {
			current = current ? `${current}/${part}` : part;
			if (!(await this.adapter.exists(current))) {
				await this.adapter.mkdir(current);
				this.debug("Created folder:", current);
			}
		}
	}

	async save(conversation: Conversation): Promise<string> {
		await this.ensureFolder();

		const filePath = normalizePath(
			conversation.filePath ?? this.generateFilePath(conversation),
		);

		const content = this.serialize(conversation);
		await this.adapter.write(filePath, content);
		this.debug("Saved conversation:", filePath);

		return filePath;
	}

	async load(filePath: string): Promise<Conversation | null> {
		const normalized = normalizePath(filePath);
		if (!(await this.adapter.exists(normalized))) return null;

		try {
			const raw = await this.adapter.read(normalized);
			return this.deserialize(raw, normalized);
		} catch (e) {
			this.debug("Failed to load conversation:", normalized, e);
			return null;
		}
	}

	async list(): Promise<ConversationMeta[]> {
		const folder = this.folderPath;
		if (!(await this.adapter.exists(folder))) return [];

		const listed = await this.adapter.list(folder);
		const metas: ConversationMeta[] = [];

		for (const filePath of listed.files) {
			if (!filePath.endsWith(".md")) continue;

			try {
				const raw = await this.adapter.read(filePath);
				const meta = this.parseMeta(raw, filePath);
				if (meta) metas.push(meta);
			} catch {
				// Skip unreadable files
			}
		}

		metas.sort((a, b) => b.updated - a.updated);
		return metas;
	}

	async delete(filePath: string): Promise<void> {
		const normalized = normalizePath(filePath);
		if (await this.adapter.exists(normalized)) {
			await this.adapter.remove(normalized);
			this.debug("Deleted conversation:", normalized);
		}
	}

	/**
	 * Ask the AI to generate a short title based on the opening exchange.
	 * Uses both the user's first message and the assistant's response
	 * so the title reflects what actually happened, not just the prompt.
	 */
	async generateTitle(messages: ChatMessage[]): Promise<string> {
		try {
			const provider = this.aiEngine.getActiveProvider();
			if (!provider.isConfigured()) return UNTITLED;

			const firstUser = messages.find((m) => m.role === "user");
			const firstAssistant = messages.find(
				(m) => m.role === "assistant" && m.content.length > 0,
			);

			if (!firstUser) return UNTITLED;

			const excerpt = firstAssistant
				? firstAssistant.content.slice(0, 500)
				: "";

			const prompt = excerpt
				? `User asked:\n${firstUser.content}\n\nAssistant replied:\n${excerpt}`
				: firstUser.content;

			const result = await this.aiEngine.chatComplete(
				[
					{
						role: "user",
						content: prompt,
						timestamp: Date.now(),
					},
				],
				{
					systemPrompt:
						"Generate a concise, accurate title (3\u20136 words) that captures what this conversation is about based on both the question and the answer. Return ONLY the title text, nothing else. No quotes, no punctuation at the end, no explanation.",
					maxTokens: 30,
					temperature: 0.3,
				},
			);

			const cleaned = result
				.trim()
				.replace(/^["']|["']$/g, "")
				.replace(/[.!?]+$/, "")
				.trim();

			return cleaned || UNTITLED;
		} catch {
			return UNTITLED;
		}
	}

	/**
	 * Rename a conversation file when it gets a real title.
	 * Returns the new file path.
	 */
	async renameForTitle(conversation: Conversation): Promise<string> {
		if (!conversation.filePath) return "";

		const oldPath = normalizePath(conversation.filePath);
		const newPath = normalizePath(this.generateFilePath(conversation));

		if (newPath === oldPath) return oldPath;
		if (!(await this.adapter.exists(oldPath))) return oldPath;
		if (await this.adapter.exists(newPath)) return oldPath;

		try {
			await this.adapter.rename(oldPath, newPath);
			this.debug("Renamed:", oldPath, "→", newPath);
			return newPath;
		} catch (e) {
			this.debug("Rename failed:", e);
			return oldPath;
		}
	}

	// ── Frontmatter parsing (metadata only) ─────────────────────

	private parseMeta(
		raw: string,
		filePath: string,
	): ConversationMeta | null {
		const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
		if (!fmMatch) return null;

		const fm = fmMatch[1];
		const title = this.extractFmValue(fm, "title") || "Untitled";
		const id =
			this.extractFmValue(fm, "conversation_id") ||
			this.idFromPath(filePath);
		const created = this.parseDate(this.extractFmValue(fm, "created"));
		const updated = this.parseDate(this.extractFmValue(fm, "updated"));
		const countStr = this.extractFmValue(fm, "message_count");
		const messageCount = countStr ? parseInt(countStr, 10) : 0;

		return { id, title, created, updated, messageCount, filePath };
	}

	// ── Serialization ──────────────────────────────────────────

	private serialize(conv: Conversation): string {
		const fm = [
			"---",
			`title: "${this.escapeYaml(conv.title)}"`,
			`created: ${new Date(conv.created).toISOString()}`,
			`updated: ${new Date(conv.updated).toISOString()}`,
			`conversation_id: ${conv.id}`,
			`message_count: ${conv.messages.length}`,
			"---",
		].join("\n");

		if (conv.messages.length === 0) return fm + "\n";

		const body = conv.messages
			.map((m) => this.serializeMessage(m))
			.join(MESSAGE_SEPARATOR);

		return `${fm}\n${MESSAGE_SEPARATOR}${body}\n`;
	}

	private serializeMessage(msg: ChatMessage): string {
		const time = this.formatTime(msg.timestamp);
		let prefix: string;

		switch (msg.role) {
			case "user":
				prefix = ROLE_PREFIX_USER;
				break;
			case "assistant":
				prefix = ROLE_PREFIX_ASSISTANT;
				break;
			default:
				prefix = ROLE_PREFIX_SYSTEM;
		}

		return `${prefix} \u2014 ${time}\n\n${msg.content}`;
	}

	private deserialize(
		raw: string,
		filePath: string,
	): Conversation | null {
		const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
		if (!fmMatch) return null;

		const fm = fmMatch[1];
		const title = this.extractFmValue(fm, "title") || UNTITLED;
		const id =
			this.extractFmValue(fm, "conversation_id") ||
			this.idFromPath(filePath);
		const created = this.parseDate(this.extractFmValue(fm, "created"));
		const updated = this.parseDate(this.extractFmValue(fm, "updated"));

		const body = raw.slice(fmMatch[0].length);
		const messages = this.parseMessages(body);

		return { id, title, created, updated, messages, filePath };
	}

	private parseMessages(body: string): ChatMessage[] {
		const rolePattern = /^##### (You|Arcana|System) \u2014 (.+)$/gm;
		const messages: ChatMessage[] = [];
		const matches: { role: string; time: string; index: number }[] = [];

		let m: RegExpExecArray | null;
		while ((m = rolePattern.exec(body)) !== null) {
			matches.push({ role: m[1], time: m[2], index: m.index });
		}

		for (let i = 0; i < matches.length; i++) {
			const match = matches[i];
			const headerEnd = body.indexOf("\n", match.index) + 1;
			const contentEnd =
				i + 1 < matches.length
					? body.lastIndexOf(
							MESSAGE_SEPARATOR.trim(),
							matches[i + 1].index,
						)
					: body.length;

			const content = body.slice(headerEnd, contentEnd).trim();
			const role =
				match.role === "You"
					? "user"
					: match.role === "Arcana"
						? "assistant"
						: "system";

			messages.push({
				role: role as ChatMessage["role"],
				content,
				timestamp: this.parseTimeString(match.time),
			});
		}

		return messages;
	}

	// ── Helpers ─────────────────────────────────────────────────

	private generateFilePath(conv: Conversation): string {
		const date = new Date(conv.created);
		const dateStr = date.toISOString().slice(0, 10);
		const slug = this.slugify(conv.title);
		const shortId = conv.id.slice(0, 6);
		const name =
			slug && slug !== "new-conversation"
				? `${dateStr}-${slug}.md`
				: `${dateStr}-${shortId}.md`;
		return `${this.folderPath}/${name}`;
	}

	private slugify(text: string): string {
		return text
			.toLowerCase()
			.replace(/[^\w\s-]/g, "")
			.replace(/\s+/g, "-")
			.replace(/-+/g, "-")
			.replace(/^-|-$/g, "")
			.slice(0, 50);
	}

	private escapeYaml(text: string): string {
		return text.replace(/"/g, '\\"');
	}

	private extractFmValue(block: string, key: string): string {
		const pattern = new RegExp(`^${key}:\\s*(.+)$`, "m");
		const match = block.match(pattern);
		if (!match) return "";
		return match[1].trim().replace(/^["']|["']$/g, "");
	}

	private parseDate(value: string): number {
		if (!value) return Date.now();
		const d = new Date(value);
		return Number.isNaN(d.getTime()) ? Date.now() : d.getTime();
	}

	private parseTimeString(time: string): number {
		const d = new Date(time);
		if (!Number.isNaN(d.getTime())) return d.getTime();
		return Date.now();
	}

	private formatTime(ts: number): string {
		return new Date(ts).toLocaleString("en-US", {
			year: "numeric",
			month: "short",
			day: "numeric",
			hour: "numeric",
			minute: "2-digit",
		});
	}

	private idFromPath(filePath: string): string {
		const base = filePath.split("/").pop() || "";
		return base.replace(/\.md$/, "");
	}

	static generateId(): string {
		const ts = Date.now().toString(36);
		const rand = Math.random().toString(36).slice(2, 8);
		return `${ts}-${rand}`;
	}
}
