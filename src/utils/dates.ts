/**
 * Natural language date parser.
 * Handles relative phrases ("tomorrow", "next friday", "in 3 days")
 * and common formats ("March 15", "2026-03-15", "3/15/2026").
 *
 * Returns an ISO date string (YYYY-MM-DD) or null if unparseable.
 */
export function parseNaturalDate(input: string): string | null {
	const text = input.trim().toLowerCase();
	if (!text) return null;

	const now = new Date();
	const today = stripTime(now);

	// ISO format: 2026-03-15
	const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
	if (isoMatch) return text;

	// US format: 3/15/2026 or 03/15/2026
	const usMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
	if (usMatch) {
		const [, m, d, y] = usMatch;
		return formatDate(new Date(Number(y), Number(m) - 1, Number(d)));
	}

	// Relative: today, tomorrow, yesterday
	if (text === "today") return formatDate(today);
	if (text === "tomorrow") return formatDate(addDays(today, 1));
	if (text === "yesterday") return formatDate(addDays(today, -1));

	// "in N days/weeks/months"
	const inMatch = text.match(
		/^in\s+(\d+)\s+(day|days|week|weeks|month|months)$/,
	);
	if (inMatch) {
		const n = Number(inMatch[1]);
		const unit = inMatch[2];
		if (unit.startsWith("day")) return formatDate(addDays(today, n));
		if (unit.startsWith("week"))
			return formatDate(addDays(today, n * 7));
		if (unit.startsWith("month")) return formatDate(addMonths(today, n));
	}

	// "next Monday", "next Friday", etc.
	const nextDayMatch = text.match(
		/^next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/,
	);
	if (nextDayMatch) {
		const target = DAY_NAMES.indexOf(nextDayMatch[1]);
		if (target >= 0) return formatDate(nextWeekday(today, target));
	}

	// Just a day name: "monday", "friday"
	const dayOnlyMatch = text.match(
		/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/,
	);
	if (dayOnlyMatch) {
		const target = DAY_NAMES.indexOf(dayOnlyMatch[1]);
		if (target >= 0) return formatDate(nextWeekday(today, target));
	}

	// "March 15" or "March 15, 2026"
	const monthDayMatch = text.match(
		/^(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:\s*,?\s*(\d{4}))?$/,
	);
	if (monthDayMatch) {
		const month = MONTH_NAMES.indexOf(monthDayMatch[1]);
		const day = Number(monthDayMatch[2]);
		const year = monthDayMatch[3] ? Number(monthDayMatch[3]) : now.getFullYear();
		if (month >= 0) return formatDate(new Date(year, month, day));
	}

	// "end of week" / "end of month"
	if (text === "end of week" || text === "eow") {
		const friday = nextWeekday(today, 5);
		return formatDate(friday);
	}
	if (text === "end of month" || text === "eom") {
		const eom = new Date(
			now.getFullYear(),
			now.getMonth() + 1,
			0,
		);
		return formatDate(eom);
	}

	return null;
}

/**
 * Format a date to a user-friendly relative string.
 */
export function formatRelativeDate(dateStr: string): string {
	const date = new Date(dateStr + "T00:00:00");
	const today = stripTime(new Date());
	const diffDays = Math.round(
		(date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
	);

	if (diffDays === 0) return "Today";
	if (diffDays === 1) return "Tomorrow";
	if (diffDays === -1) return "Yesterday";
	if (diffDays > 0 && diffDays <= 7)
		return DAY_DISPLAY_NAMES[date.getDay()];
	if (diffDays < 0) return `${Math.abs(diffDays)} days ago`;
	return date.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year:
			date.getFullYear() !== today.getFullYear()
				? "numeric"
				: undefined,
	});
}

/**
 * Get today's date as YYYY-MM-DD.
 */
export function todayISO(): string {
	return formatDate(new Date());
}

// --- Exported Helpers ---

export function addDays(d: Date, n: number): Date {
	const result = new Date(d);
	result.setDate(result.getDate() + n);
	return result;
}

export function addMonths(d: Date, n: number): Date {
	const result = new Date(d);
	result.setMonth(result.getMonth() + n);
	return result;
}

export function formatDate(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

// --- Internal Helpers ---

const DAY_NAMES = [
	"sunday",
	"monday",
	"tuesday",
	"wednesday",
	"thursday",
	"friday",
	"saturday",
];

const DAY_DISPLAY_NAMES = [
	"Sunday",
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
];

const MONTH_NAMES = [
	"january",
	"february",
	"march",
	"april",
	"may",
	"june",
	"july",
	"august",
	"september",
	"october",
	"november",
	"december",
];

function stripTime(d: Date): Date {
	return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function nextWeekday(from: Date, targetDay: number): Date {
	const current = from.getDay();
	let diff = targetDay - current;
	if (diff <= 0) diff += 7;
	return addDays(from, diff);
}
