/**
 * .base file generator for Obsidian's Bases core plugin.
 *
 * Bases files are YAML, not JSON. The schema uses:
 *   filters   - narrow which vault files are included
 *   properties - display names for columns
 *   views     - one or more view definitions (table, cards, etc.)
 *
 * Reference: https://help.obsidian.md/bases/syntax
 */

import { normalizePath, TFile } from "obsidian";
import type { App } from "obsidian";
import { TASK_STATUSES } from "../constants";
import type { TaskViewName } from "../types";

// ---------------------------------------------------------------------------
// YAML building helpers
// ---------------------------------------------------------------------------

/**
 * Global filters block that restricts to the task folder and
 * notes whose frontmatter `status` is a recognised Arcana task status.
 */
function globalFilters(folderPath: string): string[] {
	return [
		"filters:",
		"  and:",
		`    - file.inFolder("${folderPath}")`,
		"    - or:",
		...TASK_STATUSES.map((s) => `        - 'status == "${s}"'`),
	];
}

function propertiesBlock(): string[] {
	return [
		"properties:",
		"  status:",
		"    displayName: Status",
		"  priority:",
		"    displayName: Priority",
		"  due:",
		"    displayName: Due",
		"  tags:",
		"    displayName: Tags",
		"  parent_task:",
		"    displayName: Parent",
		"  subtask_progress:",
		"    displayName: Progress",
	];
}

function orderLines(fields: string[]): string[] {
	return [
		"    order:",
		...fields.map((f) => `      - ${f}`),
	];
}

const STD_COLUMNS = [
	"file.name",
	"note.status",
	"note.priority",
	"note.due",
	"note.tags",
	"note.subtask_progress",
	"note.parent_task",
];

const DUE_FIRST_COLUMNS = [
	"note.due",
	"file.name",
	"note.status",
	"note.priority",
	"note.tags",
	"note.subtask_progress",
	"note.parent_task",
];

// ---------------------------------------------------------------------------
// Per-view YAML builders
// ---------------------------------------------------------------------------

function buildList(folder: string): string {
	return [
		...globalFilters(folder),
		...propertiesBlock(),
		"views:",
		"  - type: table",
		"    name: All Tasks",
		...orderLines(STD_COLUMNS),
	].join("\n") + "\n";
}

function buildBoard(folder: string): string {
	return [
		...globalFilters(folder),
		...propertiesBlock(),
		"views:",
		"  - type: cards",
		"    name: Task Board",
		"    groupBy:",
		"      property: note.status",
		"      direction: ASC",
		...orderLines(["file.name", "note.priority", "note.due", "note.tags", "note.subtask_progress", "note.parent_task"]),
	].join("\n") + "\n";
}

function buildCalendar(folder: string): string {
	return [
		...globalFilters(folder),
		...propertiesBlock(),
		"views:",
		"  - type: table",
		"    name: Task Schedule",
		...orderLines(DUE_FIRST_COLUMNS),
	].join("\n") + "\n";
}

function buildToday(folder: string): string {
	return [
		...globalFilters(folder),
		...propertiesBlock(),
		"views:",
		"  - type: table",
		"    name: Due Today",
		"    filters:",
		"      and:",
		`        - 'status != "done" && status != "cancelled"'`,
		"        - 'due <= today()'",
		...orderLines(STD_COLUMNS),
	].join("\n") + "\n";
}

function buildAgenda(folder: string): string {
	return [
		...globalFilters(folder),
		...propertiesBlock(),
		"views:",
		"  - type: table",
		"    name: Upcoming",
		"    filters:",
		"      and:",
		`        - 'status != "done" && status != "cancelled"'`,
		...orderLines(DUE_FIRST_COLUMNS),
	].join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Registry and public API
// ---------------------------------------------------------------------------

interface ViewDef {
	key: TaskViewName;
	label: string;
	filename: string;
	build: (folder: string) => string;
}

const VIEW_DEFS: ViewDef[] = [
	{ key: "list", label: "All Tasks", filename: "All Tasks.base", build: buildList },
	{ key: "board", label: "Task Board", filename: "Task Board.base", build: buildBoard },
	{ key: "calendar", label: "Task Schedule", filename: "Task Schedule.base", build: buildCalendar },
	{ key: "today", label: "Due Today", filename: "Due Today.base", build: buildToday },
	{ key: "agenda", label: "Upcoming", filename: "Upcoming.base", build: buildAgenda },
];

const LEGACY_FILENAMES = [
	"Tasks - List.base",
	"Tasks - Board.base",
	"Tasks - Calendar.base",
	"Tasks - Today.base",
	"Tasks - Agenda.base",
];

/**
 * Remove .base files left over from older naming schemes.
 */
async function cleanupLegacyFiles(app: App): Promise<void> {
	for (const name of LEGACY_FILENAMES) {
		const file = app.vault.getAbstractFileByPath(normalizePath(name));
		if (file instanceof TFile) {
			await app.vault.delete(file);
		}
	}
}

/**
 * Write .base files to the vault root for all enabled task views.
 * Overwrites existing files; skips disabled views.
 * Removes leftover files from previous naming schemes.
 * Returns the number of files written.
 */
export async function writeTaskViews(
	app: App,
	taskFolderPath: string,
	enabledViews: Record<TaskViewName, boolean>,
): Promise<number> {
	await cleanupLegacyFiles(app);

	let written = 0;

	for (const def of VIEW_DEFS) {
		if (!enabledViews[def.key]) continue;

		const filePath = normalizePath(def.filename);
		const content = def.build(taskFolderPath);
		const existing = app.vault.getAbstractFileByPath(filePath);

		if (existing instanceof TFile) {
			await app.vault.modify(existing, content);
		} else {
			await app.vault.create(filePath, content);
		}

		written++;
	}

	return written;
}
