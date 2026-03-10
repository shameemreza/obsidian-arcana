/**
 * Tracks the elapsed time of focus sessions per file path.
 * The /focus timer writes here; task completion reads from here.
 */
export class FocusTracker {
	private sessions = new Map<string, FocusSession>();

	/**
	 * Start (or resume) tracking time for a file.
	 */
	start(filePath: string): void {
		const existing = this.sessions.get(filePath);
		if (existing && existing.active) return;

		this.sessions.set(filePath, {
			startedAt: Date.now(),
			accumulatedMs: existing?.accumulatedMs ?? 0,
			active: true,
		});
	}

	/**
	 * Stop tracking for a file, accumulating elapsed time.
	 */
	stop(filePath: string): void {
		const session = this.sessions.get(filePath);
		if (!session || !session.active) return;

		session.accumulatedMs += Date.now() - session.startedAt;
		session.active = false;
	}

	/**
	 * Get the total accumulated minutes for a file, including
	 * any currently running session. Returns null if no session exists.
	 */
	getElapsedMinutes(filePath: string): number | null {
		const session = this.sessions.get(filePath);
		if (!session) return null;

		let total = session.accumulatedMs;
		if (session.active) {
			total += Date.now() - session.startedAt;
		}
		return Math.round(total / 60_000);
	}

	/**
	 * Clear the session data for a file (after recording actual_time).
	 */
	clear(filePath: string): void {
		this.sessions.delete(filePath);
	}
}

interface FocusSession {
	startedAt: number;
	accumulatedMs: number;
	active: boolean;
}
