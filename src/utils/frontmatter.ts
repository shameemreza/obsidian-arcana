import type { TaskFrontmatter } from "../types";

/**
 * Generate YAML frontmatter string from a record of key-value pairs.
 * Handles strings, numbers, booleans, arrays, and dates.
 */
export function generateFrontmatter(
	data: Record<string, unknown>,
): string {
	const lines: string[] = ["---"];

	for (const [key, value] of Object.entries(data)) {
		if (value === undefined || value === null) continue;
		lines.push(formatYamlLine(key, value));
	}

	lines.push("---");
	return lines.join("\n");
}

function formatYamlLine(key: string, value: unknown): string {
	if (Array.isArray(value)) {
		if (value.length === 0) return `${key}: []`;
		return `${key}: [${value.map((v) => formatYamlValue(v)).join(", ")}]`;
	}
	return `${key}: ${formatYamlValue(value)}`;
}

function formatYamlValue(value: unknown): string {
	if (typeof value === "string") {
		if (
			value.includes(":") ||
			value.includes("#") ||
			value.includes('"') ||
			value.includes("'") ||
			value.startsWith(" ") ||
			value.endsWith(" ")
		) {
			return `"${value.replace(/"/g, '\\"')}"`;
		}
		return value;
	}
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}
	return `"${String(value)}"`;
}

/**
 * Build a full note string with frontmatter and body content.
 */
export function buildNoteContent(
	frontmatter: Record<string, unknown>,
	body = "",
): string {
	const fm = generateFrontmatter(frontmatter);
	return body ? `${fm}\n\n${body}` : `${fm}\n`;
}

/**
 * Build a task note from TaskFrontmatter and optional body.
 */
export function buildTaskNote(
	task: TaskFrontmatter,
	body = "",
): string {
	const fm: Record<string, unknown> = {
		title: task.title,
		status: task.status,
		priority: task.priority,
		created: task.created,
	};

	if (task.due) fm.due = task.due;
	if (task.scheduled) fm.scheduled = task.scheduled;
	if (task.completed) fm.completed = task.completed;
	if (task.tags && task.tags.length > 0) fm.tags = task.tags;
	if (task.context) fm.context = task.context;
	if (task.time_estimate != null) fm.time_estimate = task.time_estimate;
	if (task.actual_time != null) fm.actual_time = task.actual_time;
	if (task.difficulty) fm.difficulty = task.difficulty;
	if (task.trigger) fm.trigger = task.trigger;
	if (task.parent_task) fm.parent_task = task.parent_task;
	if (task.subtask_progress) fm.subtask_progress = task.subtask_progress;
	if (task.recurrence) fm.recurrence = task.recurrence;
	if (task.depends_on && task.depends_on.length > 0)
		fm.depends_on = task.depends_on;

	const defaultBody = body || `## Notes\n`;
	return buildNoteContent(fm, defaultBody);
}

/**
 * Slugify a title for use in filenames.
 */
export function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^\w\s-]/g, "")
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 60);
}

/**
 * Generate a task filename: YYYY-MM-DD-slugified-title.md
 */
export function taskFilename(title: string, date?: string): string {
	const dateStr = date ?? new Date().toISOString().slice(0, 10);
	return `${dateStr}-${slugify(title)}.md`;
}
