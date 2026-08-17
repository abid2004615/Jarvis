/**
 * JARVIS Personal Reminders — Natural-language time helper
 *
 * A deterministic, conservative parser for common relative/absolute time
 * phrases. It is used by tests and internal callers to build concrete dueAt
 * timestamps; it does NOT parse conversation on the user's behalf. The model
 * is the primary natural-language parser (instructed in the system prompt to
 * compute concrete timestamps via get_current_time).
 *
 * Only unambiguous phrases are parsed; anything else returns null.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const TIME_OF_DAY_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;
const DATE_TIME_RE = /^(\d{4})-(\d{2})-(\d{2})\s+(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)$/;

/** Parse "in N minutes/hours/days/weeks" (returns ms timestamp or null). */
export function parseRelativeTime(text: string, now: number): number | null {
  const normalized = text.trim().toLowerCase();

  const inMatch = normalized.match(/^in\s+(\d+)\s*(minute|minutes|min|mins|hour|hours|hr|hrs|day|days|week|weeks)?\b/);
  if (inMatch) {
    const amount = Number(inMatch[1]);
    const unit = (inMatch[2] ?? "minutes").toLowerCase();
    if (!Number.isFinite(amount) || amount < 1 || amount > 3650) return null;
    let ms = 0;
    if (unit.startsWith("min")) ms = amount * MINUTE_MS;
    else if (unit.startsWith("h")) ms = amount * HOUR_MS;
    else if (unit.startsWith("d")) ms = amount * DAY_MS;
    else if (unit.startsWith("w")) ms = amount * 7 * DAY_MS;
    return now + ms;
  }

  if (/^in\s+an\s+hour$/.test(normalized)) return now + HOUR_MS;
  if (/^in\s+half\s+an\s+hour$/.test(normalized)) return now + 30 * MINUTE_MS;
  if (/^in\s+a\s+day$/.test(normalized)) return now + DAY_MS;
  if (/^in\s+a\s+week$/.test(normalized)) return now + 7 * DAY_MS;

  return null;
}

/** Parse "today/tomorrow at HH:MM" and "at HH:MM" (returns ms or null). */
export function parseTimeOfDayPhrase(text: string, now: number): number | null {
  const normalized = text.trim().toLowerCase();

  let dayOffset = 0;
  let timeStr: string | null = null;

  const todayMatch = normalized.match(/^today\s+at\s+(.+)$/);
  const tomorrowMatch = normalized.match(/^tomorrow\s+at\s+(.+)$/);
  const atMatch = normalized.match(/^at\s+(.+)$/);
  const bareMatch = TIME_OF_DAY_RE.test(normalized) ? normalized : null;

  if (todayMatch) {
    dayOffset = 0;
    timeStr = todayMatch[1].trim();
  } else if (tomorrowMatch) {
    dayOffset = 1;
    timeStr = tomorrowMatch[1].trim();
  } else if (atMatch) {
    dayOffset = 0;
    timeStr = atMatch[1].trim();
  } else if (bareMatch) {
    timeStr = bareMatch;
  } else {
    return null;
  }

  const timeMatch = TIME_OF_DAY_RE.exec(timeStr ?? "");
  if (!timeMatch) return null;
  const hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2]);

  const base = new Date(now);
  base.setHours(0, 0, 0, 0);
  base.setDate(base.getDate() + dayOffset);
  base.setHours(hours, minutes, 0, 0);

  // "at HH:MM" with no day qualifier means today; if already past, tomorrow.
  if (!todayMatch && !tomorrowMatch && (dayOffset === 0) && base.getTime() <= now) {
    base.setDate(base.getDate() + 1);
  }

  return base.getTime();
}

/** Parse "YYYY-MM-DD [at] HH:MM" (returns ms or null). */
export function parseExactDateTime(text: string): number | null {
  const normalized = text.trim().toLowerCase();
  const match = DATE_TIME_RE.exec(normalized);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const hours = Number(match[4]);
  const minutes = Number(match[5]);
  const date = new Date(year, month, day, hours, minutes, 0, 0);
  if (Number.isNaN(date.getTime())) return null;
  return date.getTime();
}

/** Try every parser in order; returns null when nothing unambiguous matches. */
export function parseReminderTime(text: string, now: number): number | null {
  const exact = parseExactDateTime(text);
  if (exact !== null) return exact;
  const timeOfDay = parseTimeOfDayPhrase(text, now);
  if (timeOfDay !== null) return timeOfDay;
  return parseRelativeTime(text, now);
}
