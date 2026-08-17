/**
 * JARVIS Automation — Notifier
 *
 * Notification delivery is SEPARATE from action execution. Actions run through
 * the ToolRegistry/pipeline; completed (or gated) automations push a bounded
 * notification here. The client polls GET /api/automations/notifications and
 * renders it in the HUD (and speaks it when the JARVIS UI is active).
 *
 * No external push/email/SMS. No persistence — notifications are ephemeral and
 * bounded; they are never stored alongside automations.
 */

import { AUTOMATION_LIMITS, type Automation } from "./types";

export interface JarvisNotification {
  id: string;
  title: string;
  body: string;
  automationId?: string;
  createdAt: number;
  /** Source category: automation | reminder | routine | task | system. */
  category?: string;
  priority?: "low" | "normal" | "high" | "urgent";
  /** When set, pushes with the same key within the bus lifetime are suppressed. */
  dedupeKey?: string;
  /** Client-side read state (server tracks it so HUD sync works). */
  read?: boolean;
  /** Optional related record id (automation/reminder/routine/task id). */
  sourceId?: string;
}

export type NotificationInput = Omit<JarvisNotification, "id" | "createdAt">;

let notificationSeq = 0;

function nextNotificationId(): string {
  notificationSeq += 1;
  return `notif-${Date.now().toString(36)}-${notificationSeq.toString(36)}`;
}

class NotificationBus {
  private notifications: JarvisNotification[] = [];

  push(input: NotificationInput): JarvisNotification {
    if (input.dedupeKey) {
      const existing = this.notifications.find((n) => n.dedupeKey === input.dedupeKey);
      if (existing) return existing;
    }
    const entry: JarvisNotification = {
      id: nextNotificationId(),
      title: input.title,
      body: input.body,
      automationId: input.automationId,
      createdAt: Date.now(),
      category: input.category ?? (input.automationId ? "automation" : "system"),
      priority: input.priority,
      dedupeKey: input.dedupeKey,
      sourceId: input.sourceId,
    };
    this.notifications.push(entry);
    if (this.notifications.length > AUTOMATION_LIMITS.MAX_NOTIFICATIONS) {
      this.notifications.splice(0, this.notifications.length - AUTOMATION_LIMITS.MAX_NOTIFICATIONS);
    }
    return entry;
  }

  /** All notifications, oldest first. */
  getAll(): JarvisNotification[] {
    return [...this.notifications];
  }

  /** Notifications created after `since` (exclusive), oldest first. */
  getSince(since: number): JarvisNotification[] {
    return this.notifications.filter((n) => n.createdAt > since);
  }

  get(id: string): JarvisNotification | undefined {
    const found = this.notifications.find((n) => n.id === id);
    return found ? { ...found } : undefined;
  }

  /** Mark a single notification as read. */
  markRead(id: string): { success: boolean } {
    const found = this.notifications.find((n) => n.id === id);
    if (!found) return { success: false };
    found.read = true;
    return { success: true };
  }

  markAllRead(): { count: number } {
    let count = 0;
    for (const n of this.notifications) {
      if (!n.read) {
        n.read = true;
        count += 1;
      }
    }
    return { count };
  }

  /** Dismiss (remove) a single notification. */
  dismiss(id: string): { success: boolean } {
    const index = this.notifications.findIndex((n) => n.id === id);
    if (index < 0) return { success: false };
    this.notifications.splice(index, 1);
    return { success: true };
  }

  clear(): void {
    this.notifications = [];
  }

  count(): number {
    return this.notifications.length;
  }

  unreadCount(): number {
    return this.notifications.filter((n) => !n.read).length;
  }
}

let instance: NotificationBus | null = null;

export function getNotificationBus(): NotificationBus {
  if (!instance) {
    instance = new NotificationBus();
  }
  return instance;
}

export function resetNotificationBus(): void {
  instance = null;
}

/**
 * Compose a human-readable notification body for a completed automation.
 * Pure helper; the caller decides when/if to notify (cooldowns etc.).
 */
export function buildAutomationNotification(
  automation: Automation,
  message?: string,
): { title: string; body: string } {
  const title = `Automation: ${automation.name}`;
  const body =
    message && message.trim()
      ? message.trim()
      : `Automation "${automation.name}" executed.`;
  return { title, body };
}
