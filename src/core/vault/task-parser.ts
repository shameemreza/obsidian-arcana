import type { TaskFrontmatter, TaskPriority, TaskStatus } from "../../types";
import { parseNaturalDate, todayISO } from "../../utils/dates";
import type { AIEngine } from "../ai/ai-engine";

/**
 * Parses natural language text into structured task properties.
 * Uses a combination of regex-based heuristics and optional AI extraction.
 */
export class TaskParser {
	constructor(private aiEngine: AIEngine) {}

	/**
	 * Parse a natural language string into task frontmatter.
	 * Example: "Review vendor submission by Friday #work priority:high"
	 */
	parse(input: string): TaskFrontmatter {
		let text = input.trim();

		const tags = extractTags(text);
		text = removeTags(text);

		const priority = extractPriority(text);
		text = removePriorityMarkers(text);

		const due = extractDueDate(text);
		text = removeDatePhrases(text);

		const title = text.replace(/\s+/g, " ").trim();

		return {
			title: title || "Untitled task",
			status: "inbox" as TaskStatus,
			priority,
			created: todayISO(),
			...(due ? { due } : {}),
			...(tags.length > 0 ? { tags } : {}),
		};
	}

	/**
	 * Use AI to extract richer task properties from natural language.
	 * Falls back to heuristic parsing if AI is unavailable.
	 */
	async parseWithAI(input: string): Promise<TaskFrontmatter> {
		const provider = this.aiEngine.getActiveProvider();
		if (!provider.isConfigured()) {
			return this.parse(input);
		}

		const prompt = [
			"Extract task properties from this text. Respond with ONLY valid JSON, no markdown:",
			'"""',
			input,
			'"""',
			"",
			"JSON format:",
			'{',
			'  "title": "clear task title",',
			'  "due": "YYYY-MM-DD or null",',
			'  "priority": "urgent|high|medium|low|none",',
			'  "tags": ["tag1", "tag2"],',
			'  "context": "project or area name, or null",',
			'  "time_estimate": minutes as number or null,',
			'  "difficulty": "easy|medium|hard (based on task complexity)",',
			'  "trigger": "implementation intention if mentioned, e.g. after lunch, at 2pm, after Deploy PR, or null"',
			'}',
		].join("\n");

		try {
			const response = await this.aiEngine.chatComplete(
				[{ role: "user", content: prompt, timestamp: Date.now() }],
				{ temperature: 0.1, maxTokens: 200 },
			);

			const json = extractJSON(response);
			if (!json) return this.parse(input);

			return {
				title: typeof json.title === "string" ? json.title : input,
				status: "inbox" as TaskStatus,
				priority: validPriority(json.priority) ?? "medium",
				created: todayISO(),
				...(typeof json.due === "string" ? { due: json.due } : {}),
				...(Array.isArray(json.tags) && json.tags.length > 0
					? { tags: json.tags.filter((t: unknown) => typeof t === "string") }
					: {}),
				...(typeof json.context === "string"
					? { context: json.context }
					: {}),
				...(typeof json.time_estimate === "number"
					? { time_estimate: json.time_estimate }
					: {}),
				...(validDifficulty(json.difficulty)
					? { difficulty: json.difficulty as "easy" | "medium" | "hard" }
					: {}),
				...(typeof json.trigger === "string" && json.trigger !== "null"
					? { trigger: json.trigger }
					: {}),
			};
		} catch {
			return this.parse(input);
		}
	}

	/**
	 * Use AI to suggest an implementation intention for a task.
	 * Returns a concrete "when X, I will start" suggestion, or null.
	 */
	async suggestTrigger(
		title: string,
		notes?: string,
		due?: string,
		scheduled?: string,
	): Promise<string | null> {
		const provider = this.aiEngine.getActiveProvider();
		if (!provider.isConfigured()) return null;

		const parts = [`Task: ${title}`];
		if (notes) parts.push(`Notes: ${notes.slice(0, 300)}`);
		if (due) parts.push(`Due: ${due}`);
		if (scheduled) parts.push(`Scheduled: ${scheduled}`);

		const prompt = [
			"Suggest a concrete implementation intention for this task.",
			"An implementation intention is a specific plan: 'after [event/time], I will start this task.'",
			"",
			"Rules:",
			"- Be specific and actionable",
			"- Tie it to a concrete event or time the user can recognize",
			"- Keep it short, under 15 words",
			"- Do NOT include quotes around the suggestion",
			"- Respond with ONLY the trigger text, nothing else",
			"",
			parts.join("\n"),
		].join("\n");

		try {
			const response = await this.aiEngine.chatComplete(
				[{ role: "user", content: prompt, timestamp: Date.now() }],
				{ temperature: 0.3, maxTokens: 50 },
			);
			const cleaned = response.trim().replace(/^["']|["']$/g, "");
			return cleaned.length > 0 && cleaned.length < 200 ? cleaned : null;
		} catch {
			return null;
		}
	}

	/**
	 * Use AI to classify a task's difficulty based on its title and notes.
	 * Returns null if AI is unavailable or classification fails.
	 */
	async suggestDifficulty(
		title: string,
		notes?: string,
	): Promise<"easy" | "medium" | "hard" | null> {
		const provider = this.aiEngine.getActiveProvider();
		if (!provider.isConfigured()) return null;

		const context = notes
			? `Title: ${title}\nNotes: ${notes.slice(0, 500)}`
			: `Title: ${title}`;

		const prompt = [
			"Classify this task's difficulty. Respond with ONLY one word: easy, medium, or hard.",
			"",
			"- easy: quick, routine, single-step, under 15 minutes",
			"- medium: some thought required, multiple steps, 15-60 minutes",
			"- hard: complex, research needed, many steps, over 60 minutes",
			"",
			context,
		].join("\n");

		try {
			const response = await this.aiEngine.chatComplete(
				[{ role: "user", content: prompt, timestamp: Date.now() }],
				{ temperature: 0, maxTokens: 10 },
			);

			const cleaned = response.trim().toLowerCase();
			if (cleaned === "easy" || cleaned === "medium" || cleaned === "hard") {
				return cleaned;
			}
			const match = cleaned.match(/\b(easy|medium|hard)\b/);
			return match ? (match[1] as "easy" | "medium" | "hard") : null;
		} catch {
			return null;
		}
	}
}

// --- Extraction Helpers ---

function extractTags(text: string): string[] {
	const matches = text.match(/#[\w-]+/g);
	if (!matches) return [];
	return [...new Set(matches.map((t) => t.replace(/^#/, "")))];
}

function removeTags(text: string): string {
	return text.replace(/#[\w-]+/g, "").trim();
}

const PRIORITY_MAP: Record<string, TaskPriority> = {
	urgent: "urgent",
	"!!!!": "urgent",
	"!!!": "high",
	high: "high",
	"!!": "medium",
	medium: "medium",
	"!": "low",
	low: "low",
	none: "none",
};

function extractPriority(text: string): TaskPriority {
	const explicit = text.match(
		/priority:\s*(urgent|high|medium|low|none)/i,
	);
	if (explicit) return PRIORITY_MAP[explicit[1].toLowerCase()] ?? "medium";

	const bangMatch = text.match(/(!{1,4})(?:\s|$)/);
	if (bangMatch) return PRIORITY_MAP[bangMatch[1]] ?? "medium";

	if (/\b(asap|critical|urgent)\b/i.test(text)) return "urgent";
	if (/\b(important|high\s*pri)\b/i.test(text)) return "high";

	return "medium";
}

function removePriorityMarkers(text: string): string {
	return text
		.replace(/priority:\s*(urgent|high|medium|low|none)/gi, "")
		.replace(/!{1,4}(?:\s|$)/g, " ")
		.replace(/\b(asap|critical)\b/gi, "")
		.trim();
}

const DATE_PHRASES = [
	/\bby\s+(.+?)(?:\s*$|\s+#|\s+priority:)/i,
	/\bdue\s+(.+?)(?:\s*$|\s+#|\s+priority:)/i,
	/\bbefore\s+(.+?)(?:\s*$|\s+#|\s+priority:)/i,
	/\bon\s+(.+?)(?:\s*$|\s+#|\s+priority:)/i,
];

function extractDueDate(text: string): string | undefined {
	for (const pattern of DATE_PHRASES) {
		const match = text.match(pattern);
		if (match) {
			const parsed = parseNaturalDate(match[1].trim());
			if (parsed) return parsed;
		}
	}
	return undefined;
}

function removeDatePhrases(text: string): string {
	let result = text;
	for (const pattern of DATE_PHRASES) {
		result = result.replace(pattern, " ");
	}
	return result.trim();
}

export interface ExtractedActionItem {
	title: string;
	due?: string;
	priority?: string;
}

/**
 * Use AI to detect action items in arbitrary note content.
 * Returns an empty array when AI is unavailable or nothing is found.
 */
export async function extractTasksFromContent(
	aiEngine: AIEngine,
	content: string,
): Promise<ExtractedActionItem[]> {
	const provider = aiEngine.getActiveProvider();
	if (!provider.isConfigured()) return [];

	const prompt = [
		"Analyze the following note and extract every action item, task, or to-do.",
		"For each one, provide a clear title, optional due date (YYYY-MM-DD), and priority.",
		"",
		"Respond with ONLY valid JSON (no markdown fences):",
		'{ "tasks": [{ "title": "...", "due": "YYYY-MM-DD or null", "priority": "medium" }] }',
		"",
		'If no action items exist, respond: { "tasks": [] }',
		"",
		"Note content:",
		'"""',
		content.slice(0, 8000),
		'"""',
	].join("\n");

	try {
		const response = await aiEngine.chatComplete(
			[{ role: "user", content: prompt, timestamp: Date.now() }],
			{ temperature: 0.1, maxTokens: 1000 },
		);

		const json = extractJSON(response);
		if (!json || !Array.isArray(json.tasks)) return [];

		return (json.tasks as Record<string, unknown>[])
			.filter(
				(t) => typeof t.title === "string" && (t.title as string).trim(),
			)
			.map((t) => ({
				title: t.title as string,
				...(typeof t.due === "string" && t.due !== "null"
					? { due: t.due }
					: {}),
				...(typeof t.priority === "string"
					? { priority: t.priority }
					: {}),
			}));
	} catch {
		return [];
	}
}

function extractJSON(
	text: string,
): Record<string, unknown> | null {
	const match = text.match(/\{[\s\S]*\}/);
	if (!match) return null;
	try {
		return JSON.parse(match[0]) as Record<string, unknown>;
	} catch {
		return null;
	}
}

const VALID_PRIORITIES = new Set([
	"urgent",
	"high",
	"medium",
	"low",
	"none",
]);

function validPriority(value: unknown): TaskPriority | null {
	if (typeof value === "string" && VALID_PRIORITIES.has(value)) {
		return value as TaskPriority;
	}
	return null;
}

const VALID_DIFFICULTIES = new Set(["easy", "medium", "hard"]);

function validDifficulty(value: unknown): boolean {
	return typeof value === "string" && VALID_DIFFICULTIES.has(value);
}
