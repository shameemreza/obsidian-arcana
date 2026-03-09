/**
 * .base file generator for Obsidian's Bases plugin.
 * Generates JSON configs for table, cards (kanban), and calendar views.
 */

export type BaseViewType = "table" | "cards" | "calendar";

export interface BaseConfig {
	name: string;
	source: { type: "folder"; config: { path: string } };
	view: {
		type: BaseViewType;
		config: Record<string, unknown>;
	};
	filter: {
		conjunction: "and" | "or";
		conditions: BaseCondition[];
	};
	sort: BaseSort[];
}

export interface BaseCondition {
	field: string;
	operator: string;
	value: unknown;
}

export interface BaseSort {
	field: string;
	order: "asc" | "desc";
}

/**
 * Generate a table view .base config.
 */
export function tableView(options: {
	name: string;
	folderPath: string;
	fields: string[];
	sortField?: string;
	sortOrder?: "asc" | "desc";
	filters?: BaseCondition[];
}): BaseConfig {
	return {
		name: options.name,
		source: { type: "folder", config: { path: options.folderPath } },
		view: {
			type: "table",
			config: { fields: options.fields },
		},
		filter: {
			conjunction: "and",
			conditions: options.filters ?? [],
		},
		sort: options.sortField
			? [
					{
						field: options.sortField,
						order: options.sortOrder ?? "asc",
					},
				]
			: [],
	};
}

/**
 * Generate a cards (kanban) view .base config.
 */
export function cardsView(options: {
	name: string;
	folderPath: string;
	groupBy: string;
	fields: string[];
	sortField?: string;
	sortOrder?: "asc" | "desc";
	filters?: BaseCondition[];
}): BaseConfig {
	return {
		name: options.name,
		source: { type: "folder", config: { path: options.folderPath } },
		view: {
			type: "cards",
			config: {
				groupBy: options.groupBy,
				coverField: "",
				fields: options.fields,
			},
		},
		filter: {
			conjunction: "and",
			conditions: options.filters ?? [],
		},
		sort: options.sortField
			? [
					{
						field: options.sortField,
						order: options.sortOrder ?? "asc",
					},
				]
			: [],
	};
}

/**
 * Generate a calendar view .base config.
 */
export function calendarView(options: {
	name: string;
	folderPath: string;
	dateField: string;
	filters?: BaseCondition[];
}): BaseConfig {
	return {
		name: options.name,
		source: { type: "folder", config: { path: options.folderPath } },
		view: {
			type: "calendar",
			config: { dateField: options.dateField },
		},
		filter: {
			conjunction: "and",
			conditions: options.filters ?? [],
		},
		sort: [],
	};
}

/**
 * Serialize a BaseConfig to JSON string for writing to a .base file.
 */
export function serializeBase(config: BaseConfig): string {
	return JSON.stringify(config, null, 2);
}

/**
 * Generate all standard task view configs for a given task folder.
 */
export function generateTaskViews(taskFolderPath: string): {
	name: string;
	filename: string;
	config: BaseConfig;
}[] {
	const fields = ["title", "status", "priority", "due", "tags"];

	return [
		{
			name: "Tasks - List",
			filename: "Tasks - List.base",
			config: tableView({
				name: "Tasks - List",
				folderPath: taskFolderPath,
				fields,
				sortField: "priority",
				sortOrder: "asc",
			}),
		},
		{
			name: "Tasks - Board",
			filename: "Tasks - Board.base",
			config: cardsView({
				name: "Tasks - Board",
				folderPath: taskFolderPath,
				groupBy: "status",
				fields,
				sortField: "priority",
				sortOrder: "asc",
			}),
		},
		{
			name: "Tasks - Calendar",
			filename: "Tasks - Calendar.base",
			config: calendarView({
				name: "Tasks - Calendar",
				folderPath: taskFolderPath,
				dateField: "due",
			}),
		},
		{
			name: "Tasks - Today",
			filename: "Tasks - Today.base",
			config: tableView({
				name: "Tasks - Today",
				folderPath: taskFolderPath,
				fields,
				sortField: "priority",
				sortOrder: "asc",
				filters: [
					{
						field: "status",
						operator: "not_equals",
						value: "done",
					},
					{
						field: "status",
						operator: "not_equals",
						value: "cancelled",
					},
				],
			}),
		},
		{
			name: "Tasks - Agenda",
			filename: "Tasks - Agenda.base",
			config: tableView({
				name: "Tasks - Agenda",
				folderPath: taskFolderPath,
				fields,
				sortField: "due",
				sortOrder: "asc",
				filters: [
					{
						field: "status",
						operator: "not_equals",
						value: "done",
					},
				],
			}),
		},
	];
}
