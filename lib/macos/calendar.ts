/**
 * macOS Calendar Integration
 * Read and create calendar events via AppleScript.
 * Read operations are safe (no confirmation).
 * Create operations require confirmation.
 *
 * Uses execFileSync (no shell) for security.
 */

// Lazy-load child_process only when needed (server-side)
let execFileSync: typeof import("child_process").execFileSync | null = null;

function getExecFileSync() {
  if (execFileSync === null) {
    try {
      execFileSync = require("child_process").execFileSync;
    } catch {
      return null;
    }
  }
  return execFileSync;
}

function isMacOS(): boolean {
  return process.platform === "darwin";
}

const CALENDAR_TIMEOUT_MS = 8000;

export interface CalendarEvent {
  title: string;
  startDate: string;
  endDate: string;
  location?: string;
  calendar?: string;
}

export interface CalendarResult {
  available: boolean;
  events: CalendarEvent[];
  count: number;
  dateRange?: string;
  error?: string;
}

export interface CalendarActionResult {
  success: boolean;
  message: string;
  event?: CalendarEvent;
  error?: string;
}

/**
 * Get today's date range as AppleScript-compatible strings.
 */
function getTodayRange(): { startISO: string; endISO: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  return {
    startISO: start.toISOString(),
    endISO: end.toISOString(),
  };
}

/**
 * Get upcoming events for the next N days (default 7).
 */
export function getUpcomingEvents(days: number = 7): CalendarResult {
  if (!isMacOS()) {
    return { available: false, events: [], count: 0, error: "Not running on macOS" };
  }

  try {
    const exec = getExecFileSync();
    if (!exec) {
      return { available: false, events: [], count: 0, error: "child_process not available" };
    }

    const now = new Date();
    const future = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    const script = [
      'tell application "Calendar"',
      "  set output to {}",
      "  set calNames to name of every calendar",
      "  repeat with calName in calNames",
      "    try",
      "      set calEvents to (every event of calendar calName whose start date >= (current date) and start date <= (current date) + (" + days + " * days))",
      "      repeat with evt in calEvents",
      "        set evtTitle to summary of evt",
      "        set evtStart to start date of evt as string",
      "        set evtEnd to end date of evt as string",
      "        set end of output to evtTitle & \"|||\" & evtStart & \"|||\" & evtEnd & \"|||\" & calName",
      "      end repeat",
      "    end try",
      "  end repeat",
      "  set AppleScript's text item delimiters to \"\\n\"",
      "  return output as text",
      "end tell",
    ].join("\n");

    const output = exec("osascript", [], {
      input: script,
      encoding: "utf8",
      shell: false,
      timeout: CALENDAR_TIMEOUT_MS,
      stdio: ["pipe", "pipe", "pipe"],
    }).toString().trim();

    if (!output) {
      return { available: true, events: [], count: 0, dateRange: `Next ${days} days` };
    }

    const events: CalendarEvent[] = output.split("\n").filter(Boolean).map((line) => {
      const [title, startDate, endDate, calendar] = line.split("|||");
      return {
        title: title || "Untitled",
        startDate: startDate || "",
        endDate: endDate || "",
        calendar,
      };
    });

    return { available: true, events, count: events.length, dateRange: `Next ${days} days` };
  } catch {
    return { available: false, events: [], count: 0, error: "Could not read calendar" };
  }
}

/**
 * Get today's events.
 */
export function getTodayEvents(): CalendarResult {
  return getUpcomingEvents(1);
}

/**
 * Create a calendar event. Requires confirmation (handled at tool level).
 * Uses fixed AppleScript — event details are passed as structured data.
 */
export function createCalendarEvent(
  title: string,
  startDate: string,
  endDate?: string,
  location?: string,
  calendarName?: string,
): CalendarActionResult {
  if (!isMacOS()) {
    return { success: false, message: "Not running on macOS" };
  }

  if (!title || typeof title !== "string") {
    return { success: false, message: "Event title is required" };
  }

  if (!startDate || typeof startDate !== "string") {
    return { success: false, message: "Event start date is required" };
  }

  try {
    const exec = getExecFileSync();
    if (!exec) {
      return { success: false, message: "child_process not available" };
    }

    // Build AppleScript to create the event
    const calTarget = calendarName || "Calendar";
    const locLine = location ? `set location of newEvent to "${location.replace(/"/g, '\\"')}"` : "";
    const endLine = endDate
      ? `set end date of newEvent to date "${endDate.replace(/"/g, '\\"')}"`
      : `set end date of newEvent to start date of newEvent + (1 * hours)`;

    const script = [
      'tell application "Calendar"',
      `  set targetCal to calendar "${calTarget.replace(/"/g, '\\"')}"`,
      "  set newEvent to make new event at end of events of targetCal",
      `  set summary of newEvent to "${title.replace(/"/g, '\\"')}"`,
      `  set start date of newEvent to date "${startDate.replace(/"/g, '\\"')}"`,
      endLine,
      locLine,
      "  save",
      "end tell",
    ].join("\n");

    exec("osascript", [], {
      input: script,
      encoding: "utf8",
      shell: false,
      timeout: CALENDAR_TIMEOUT_MS,
      stdio: ["pipe", "pipe", "pipe"],
    });

    return {
      success: true,
      message: `Created calendar event "${title}"`,
      event: { title, startDate, endDate: endDate || "", location, calendar: calendarName },
    };
  } catch {
    return { success: false, message: `Could not create event "${title}"` };
  }
}
