import { Notice } from "obsidian";
import type { TaskScanner } from "./task-scanner";
import type { ArcanaSettings } from "../../settings";
import { NOTIFICATION_LEVELS } from "../../constants";

/**
 * Parses a trigger string and returns a Date if it contains a
 * recognizable absolute time reference for today.
 *
 * Supported patterns:
 *   "at 2pm", "at 14:00", "at 2:30 PM", "at 9am"
 *
 * Returns null for non-time triggers like "after standup".
 */
function parseTimeTrigger(trigger: string): Date | null {
	const timePattern =
		/\bat\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i;
	const match = trigger.match(timePattern);
	if (!match) return null;

	let hours = parseInt(match[1], 10);
	const minutes = match[2] ? parseInt(match[2], 10) : 0;
	const meridian = match[3]?.toLowerCase();

	if (meridian === "pm" && hours < 12) hours += 12;
	if (meridian === "am" && hours === 12) hours = 0;
	if (hours > 23 || minutes > 59) return null;

	const now = new Date();
	const target = new Date(
		now.getFullYear(),
		now.getMonth(),
		now.getDate(),
		hours,
		minutes,
		0,
		0,
	);
	return target;
}

/**
 * Determines whether a trigger string references another task by name.
 * Returns the referenced task name or null.
 *
 * Supported patterns:
 *   "after Deploy PR"
 *   "after [[Some Task]]"
 *   "when Review docs is done"
 */
function parseAfterTaskTrigger(trigger: string): string | null {
	const afterPattern = /^after\s+(.+)$/i;
	const whenDonePattern = /^when\s+(.+?)\s+is\s+(?:done|completed?|finished)$/i;

	let match = trigger.match(afterPattern);
	if (match) {
		return match[1].replace(/^\[\[|\]\]$/g, "").trim();
	}

	match = trigger.match(whenDonePattern);
	if (match) {
		return match[1].replace(/^\[\[|\]\]$/g, "").trim();
	}

	return null;
}

interface ScheduledReminder {
	taskTitle: string;
	trigger: string;
	timeoutId: number;
}

/**
 * Monitors task triggers and fires Obsidian Notices at the right time.
 *
 * Two trigger types:
 *   1. Time-based: "at 2pm" fires a Notice at that time today.
 *   2. After-task: "after [Task X]" fires when Task X is completed.
 */
export class TriggerMonitor {
	private scheduled: ScheduledReminder[] = [];
	private initialized = false;

	constructor(
		private taskScanner: TaskScanner,
		private getSettings: () => ArcanaSettings,
	) {}

	/**
	 * Scan all open tasks and schedule time-based reminders.
	 * Call once after layout is ready, and again on metadata changes.
	 */
	async scheduleTimeReminders(): Promise<void> {
		this.clearScheduled();

		const settings = this.getSettings();
		if (settings.notificationLevel === NOTIFICATION_LEVELS.NONE) return;

		const tasks = await this.taskScanner.getOpenTasks();
		const now = Date.now();

		for (const task of tasks) {
			const trigger = task.frontmatter.trigger;
			if (!trigger) continue;

			const targetTime = parseTimeTrigger(trigger);
			if (!targetTime) continue;

			const delay = targetTime.getTime() - now;
			if (delay <= 0) continue;

			const timeoutId = window.setTimeout(() => {
				new Notice(
					`Trigger reminder: "${task.frontmatter.title}" ` +
					`-- you planned to start this ${trigger}`,
					8000,
				);
			}, delay);

			this.scheduled.push({
				taskTitle: task.frontmatter.title,
				trigger,
				timeoutId,
			});
		}

		this.initialized = true;
	}

	/**
	 * Called when a task is completed. Checks whether any other open
	 * task has a trigger referencing the completed task, and if so
	 * fires a nudge Notice.
	 */
	async onTaskCompleted(completedTitle: string): Promise<void> {
		const settings = this.getSettings();
		if (settings.notificationLevel === NOTIFICATION_LEVELS.NONE) return;

		const completedLower = completedTitle.toLowerCase();
		const openTasks = await this.taskScanner.getOpenTasks();

		for (const task of openTasks) {
			const trigger = task.frontmatter.trigger;
			if (!trigger) continue;

			const referencedTask = parseAfterTaskTrigger(trigger);
			if (!referencedTask) continue;

			if (referencedTask.toLowerCase() === completedLower) {
				new Notice(
					`You planned to start "${task.frontmatter.title}" ` +
					`after "${completedTitle}". Ready to begin?`,
					10000,
				);
			}
		}
	}

	/**
	 * Refresh scheduled reminders. Called when task metadata changes.
	 * Debounces to avoid excessive rescanning.
	 */
	refresh(): void {
		if (!this.initialized) return;
		this.scheduleTimeReminders();
	}

	/**
	 * Clean up all scheduled timeouts.
	 */
	destroy(): void {
		this.clearScheduled();
		this.initialized = false;
	}

	private clearScheduled(): void {
		for (const reminder of this.scheduled) {
			window.clearTimeout(reminder.timeoutId);
		}
		this.scheduled = [];
	}
}
