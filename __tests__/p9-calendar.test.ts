/**
 * P9 Tests — Calendar Integration
 */

import { getUpcomingEvents, getTodayEvents, createCalendarEvent } from "@/lib/macos/calendar";

describe("P9 — Calendar Integration", () => {
  test("getUpcomingEvents returns structured result", () => {
    const result = getUpcomingEvents(7);
    expect(typeof result.available).toBe("boolean");
    expect(Array.isArray(result.events)).toBe(true);
    expect(typeof result.count).toBe("number");
  });

  test("getTodayEvents returns structured result", () => {
    const result = getTodayEvents();
    expect(typeof result.available).toBe("boolean");
    expect(Array.isArray(result.events)).toBe(true);
  });

  test("createCalendarEvent returns structured result", () => {
    const result = createCalendarEvent("", "");
    expect(result.success).toBe(false);
  });

  test("createCalendarEvent requires title", () => {
    const result = createCalendarEvent("", "2026-08-20 14:00");
    expect(result.success).toBe(false);
  });

  test("createCalendarEvent requires startDate", () => {
    const result = createCalendarEvent("Test Event", "");
    expect(result.success).toBe(false);
  });
});
