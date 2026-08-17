/**
 * JARVIS Automation — Client helpers
 *
 * Browser-safe fetch wrappers for the automations API. The client never sends
 * authorization flags — the server derives them. Delete always requires an
 * explicit confirm, mirroring the server's confirmation policy.
 */

export interface AutomationSummaryView {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  trigger: {
    type: string;
    at?: string;
    dayOfWeek?: number;
    minutes?: number;
    metric?: string;
    operator?: string;
    value?: number | string;
    date?: string;
  };
  action?: { toolId: string };
  requiresConfirmation: boolean;
  createdAt: number;
  updatedAt: number;
  lastRunAt?: number;
  nextRunAt?: number;
  lastResult?: string;
}

export interface NotificationView {
  id: string;
  title: string;
  body: string;
  automationId?: string;
  createdAt: number;
  category?: string;
  priority?: "low" | "normal" | "high" | "urgent";
  read?: boolean;
  sourceId?: string;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    throw new Error(`Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export async function fetchAutomations(): Promise<AutomationSummaryView[]> {
  try {
    const data = await request<{ automations: AutomationSummaryView[] }>("/api/automations");
    return data.automations ?? [];
  } catch {
    return [];
  }
}

export async function setAutomationEnabled(id: string, enabled: boolean): Promise<void> {
  await request(`/api/automations/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ enabled }),
  });
}

export async function runAutomationNow(id: string): Promise<{ message?: string }> {
  return request<{ message?: string }>(`/api/automations/${id}`, { method: "POST" }).catch(() => ({}));
}

export async function deleteAutomation(id: string): Promise<void> {
  await request(`/api/automations/${id}`, {
    method: "DELETE",
    body: JSON.stringify({ confirm: true }),
  });
}

export async function fetchNotifications(since: number): Promise<NotificationView[]> {
  try {
    const data = await request<{ notifications: NotificationView[] }>(
      `/api/automations/notifications?since=${since}`,
    );
    return data.notifications ?? [];
  } catch {
    return [];
  }
}

/** Fetch the full notification inbox (all categories). */
export async function fetchNotificationInbox(since = 0): Promise<{
  count: number;
  unreadCount: number;
  notifications: NotificationView[];
}> {
  try {
    return await request<{ count: number; unreadCount: number; notifications: NotificationView[] }>(
      `/api/notifications?since=${since}`,
    );
  } catch {
    return { count: 0, unreadCount: 0, notifications: [] };
  }
}

export async function markNotificationRead(id: string): Promise<void> {
  await request(`/api/notifications/${id}`, { method: "POST" }).catch(() => undefined);
}

export async function dismissNotification(id: string): Promise<void> {
  await request(`/api/notifications/${id}`, { method: "DELETE" }).catch(() => undefined);
}

export async function markAllNotificationsRead(): Promise<void> {
  await request("/api/notifications", { method: "POST" }).catch(() => undefined);
}

export async function clearNotifications(): Promise<void> {
  await request("/api/notifications", {
    method: "DELETE",
    body: JSON.stringify({ confirm: true }),
  }).catch(() => undefined);
}
