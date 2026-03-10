/**
 * Recurrence pattern parsing and next occurrence calculation.
 *
 * Supported patterns:
 *   "daily", "weekly", "monthly"
 *   "every N days", "every N weeks", "every N months"
 *   "weekdays"
 *   RRule subset: FREQ=DAILY, FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR
 */

import { addDays, addMonths, formatDate } from "../../utils/dates";

export interface RecurrenceInfo {
	frequency: "daily" | "weekly" | "monthly";
	interval: number;
	byDay?: number[];
}

const RRULE_DAY_MAP: Record<string, number> = {
	SU: 0,
	MO: 1,
	TU: 2,
	WE: 3,
	TH: 4,
	FR: 5,
	SA: 6,
};

export function parseRecurrence(pattern: string): RecurrenceInfo | null {
	const text = pattern.trim();
	if (!text) return null;

	if (/^(daily|every\s+day)$/i.test(text)) {
		return { frequency: "daily", interval: 1 };
	}
	if (/^(weekly|every\s+week)$/i.test(text)) {
		return { frequency: "weekly", interval: 1 };
	}
	if (/^(monthly|every\s+month)$/i.test(text)) {
		return { frequency: "monthly", interval: 1 };
	}
	if (/^(weekdays|every\s+weekday)$/i.test(text)) {
		return { frequency: "weekly", interval: 1, byDay: [1, 2, 3, 4, 5] };
	}

	const intervalMatch = text.match(
		/^every\s+(\d+)\s+(day|days|week|weeks|month|months)$/i,
	);
	if (intervalMatch) {
		const n = Number(intervalMatch[1]);
		const unit = intervalMatch[2].toLowerCase();
		if (unit.startsWith("day")) return { frequency: "daily", interval: n };
		if (unit.startsWith("week"))
			return { frequency: "weekly", interval: n };
		if (unit.startsWith("month"))
			return { frequency: "monthly", interval: n };
	}

	const rruleText = text.replace(/^RRULE:/i, "");
	if (/FREQ=/i.test(rruleText)) {
		return parseRRule(rruleText);
	}

	return null;
}

function parseRRule(rrule: string): RecurrenceInfo | null {
	const parts = rrule.split(";");
	const params: Record<string, string> = {};
	for (const part of parts) {
		const eq = part.indexOf("=");
		if (eq < 0) continue;
		params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1).toUpperCase();
	}

	const freq = params["FREQ"];
	if (!freq) return null;

	let frequency: RecurrenceInfo["frequency"];
	if (freq === "DAILY") frequency = "daily";
	else if (freq === "WEEKLY") frequency = "weekly";
	else if (freq === "MONTHLY") frequency = "monthly";
	else return null;

	const interval = params["INTERVAL"] ? Number(params["INTERVAL"]) : 1;
	if (isNaN(interval) || interval < 1) return null;

	let byDay: number[] | undefined;
	if (params["BYDAY"]) {
		byDay = params["BYDAY"]
			.split(",")
			.map((d) => RRULE_DAY_MAP[d.trim()])
			.filter((n) => n !== undefined);
		if (byDay.length === 0) byDay = undefined;
	}

	return { frequency, interval, byDay };
}

/**
 * Compute the next due date based on a recurrence pattern.
 *
 * Uses the previous due date as anchor when available, falling back
 * to the completion date. Guarantees the result is in the future.
 */
export function computeNextDue(
	baseDate: string | undefined,
	completedDate: string,
	pattern: string,
): string | null {
	const info = parseRecurrence(pattern);
	if (!info) return null;

	const anchor = baseDate || completedDate;
	const anchorDate = new Date(anchor + "T00:00:00");

	let next = advance(anchorDate, info);

	if (info.byDay && info.byDay.length > 0) {
		next = nextMatchingDay(next, info.byDay);
	}

	const today = new Date();
	today.setHours(0, 0, 0, 0);

	let safety = 0;
	while (next <= today && safety < 400) {
		next = advance(next, info);
		if (info.byDay && info.byDay.length > 0) {
			next = nextMatchingDay(next, info.byDay);
		}
		safety++;
	}

	return formatDate(next);
}

function advance(d: Date, info: RecurrenceInfo): Date {
	switch (info.frequency) {
		case "daily":
			return addDays(d, info.interval);
		case "weekly":
			return addDays(d, 7 * info.interval);
		case "monthly":
			return addMonths(d, info.interval);
	}
}

function nextMatchingDay(from: Date, days: number[]): Date {
	const daySet = new Set(days);
	let d = new Date(from);
	for (let i = 0; i < 7; i++) {
		if (daySet.has(d.getDay())) return d;
		d = addDays(d, 1);
	}
	return from;
}
