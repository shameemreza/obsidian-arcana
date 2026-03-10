/**
 * Tracks estimation accuracy over time, persisted in plugin data.
 * Stores individual data points and computes running averages.
 */

export interface EstimationRecord {
	estimated: number;
	actual: number;
	ratio: number;
	date: string;
	difficulty?: "easy" | "medium" | "hard";
}

export interface EstimationData {
	records: EstimationRecord[];
}

const MAX_RECORDS = 200;

export function createEmptyEstimationData(): EstimationData {
	return { records: [] };
}

/**
 * Add a new estimation/actual pair to the history.
 * Returns the updated data (caller is responsible for persisting).
 */
export function addEstimationRecord(
	data: EstimationData,
	estimated: number,
	actual: number,
	difficulty?: "easy" | "medium" | "hard",
): EstimationData {
	const ratio = actual / estimated;
	const record: EstimationRecord = {
		estimated,
		actual,
		ratio,
		date: new Date().toISOString().slice(0, 10),
		...(difficulty ? { difficulty } : {}),
	};

	const records = [...data.records, record];
	if (records.length > MAX_RECORDS) {
		records.splice(0, records.length - MAX_RECORDS);
	}

	return { records };
}

/**
 * Compute the average ratio of actual/estimated across all records.
 * A ratio > 1 means the user typically underestimates.
 * A ratio < 1 means the user typically overestimates.
 * Returns null if there are not enough data points (minimum 3).
 */
export function getAverageRatio(data: EstimationData): number | null {
	if (data.records.length < 3) return null;

	const recent = data.records.slice(-50);
	const sum = recent.reduce((acc, r) => acc + r.ratio, 0);
	return sum / recent.length;
}

/**
 * Compute average ratio filtered by difficulty level.
 */
export function getAverageRatioByDifficulty(
	data: EstimationData,
	difficulty: "easy" | "medium" | "hard",
): number | null {
	const filtered = data.records.filter((r) => r.difficulty === difficulty);
	if (filtered.length < 3) return null;

	const recent = filtered.slice(-30);
	const sum = recent.reduce((acc, r) => acc + r.ratio, 0);
	return sum / recent.length;
}

/**
 * Build a human-readable insight about estimation accuracy.
 * Returns null if not enough data exists.
 */
export function getEstimationInsight(
	data: EstimationData,
	difficulty?: "easy" | "medium" | "hard",
): EstimationInsight | null {
	const ratio = difficulty
		? getAverageRatioByDifficulty(data, difficulty)
		: getAverageRatio(data);

	if (ratio == null) return null;

	const pct = Math.abs(ratio - 1) * 100;

	if (pct < 10) {
		return {
			ratio,
			message: "Your time estimates have been quite accurate.",
			direction: "accurate",
			percentage: Math.round(pct),
		};
	}

	if (ratio > 1) {
		return {
			ratio,
			message: `You usually underestimate by about ${Math.round(pct)}%.`,
			direction: "under",
			percentage: Math.round(pct),
		};
	}

	return {
		ratio,
		message: `You usually overestimate by about ${Math.round(pct)}%.`,
		direction: "over",
		percentage: Math.round(pct),
	};
}

/**
 * Adjust a user's estimate based on their historical accuracy.
 * Returns the adjusted value in minutes, or null if not enough data.
 */
export function adjustEstimate(
	data: EstimationData,
	estimateMinutes: number,
	difficulty?: "easy" | "medium" | "hard",
): number | null {
	const ratio = difficulty
		? getAverageRatioByDifficulty(data, difficulty)
		: getAverageRatio(data);

	if (ratio == null) return null;

	const pct = Math.abs(ratio - 1) * 100;
	if (pct < 10) return null;

	return Math.round(estimateMinutes * ratio);
}

export interface EstimationInsight {
	ratio: number;
	message: string;
	direction: "under" | "over" | "accurate";
	percentage: number;
}
