"use client";

import { useCallback, useEffect, useState } from "react";

import "@/styles/notification-center.css";

import type { NotificationView } from "@/lib/automation/client";
import {
  clearNotifications,
  dismissNotification,
  fetchNotificationInbox,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/automation/client";

function formatTime(value: number): string {
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface NotificationCenterProps {
  refreshKey?: number;
  onSpeak?: (text: string) => void;
}

export function NotificationCenter({ refreshKey = 0, onSpeak }: NotificationCenterProps) {
  const [notifications, setNotifications] = useState<NotificationView[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [offline, setOffline] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const load = useCallback(async () => {
    const inbox = await fetchNotificationInbox();
    setNotifications(inbox.notifications);
    setUnread(inbox.unreadCount);
    setOffline(false);
  }, []);

  useEffect(() => {
    let active = true;
    fetchNotificationInbox()
      .then((inbox) => {
        if (!active) return;
        setNotifications(inbox.notifications);
        setUnread(inbox.unreadCount);
        setOffline(false);
      })
      .catch(() => {
        if (active) setOffline(true);
      });
    return () => {
      active = false;
    };
  }, [refreshKey]);

  const read = useCallback(
    async (notification: NotificationView) => {
      if (!notification.read) {
        setUnread((current) => Math.max(0, current - 1));
        void markNotificationRead(notification.id);
      }
      const body = `${notification.title}: ${notification.body}`;
      if (onSpeak) onSpeak(body);
    },
    [onSpeak],
  );

  const dismiss = useCallback(
    async (id: string) => {
      setNotifications((current) => current.filter((n) => n.id !== id));
      await dismissNotification(id);
    },
    [],
  );

  const readAll = useCallback(async () => {
    setUnread(0);
    setNotifications((current) => current.map((n) => ({ ...n, read: true })));
    await markAllNotificationsRead();
  }, []);

  const clearAll = useCallback(async () => {
    setNotifications([]);
    setUnread(0);
    setConfirmClear(false);
    await clearNotifications();
  }, []);

  return (
    <div className="notification-center">
      <button
        type="button"
        className="notification-toggle"
        onClick={() => {
          setOpen((current) => !current);
          if (!open) void load();
        }}
        aria-expanded={open}
      >
        NOTIFICATIONS{unread > 0 ? ` (${unread})` : ""}
      </button>
      {open && (
        <div className="notification-popover">
          <div className="notification-head">
            <span className="notification-title">INBOX</span>
            <div className="notification-head-actions">
              <button type="button" className="notification-btn" onClick={() => void readAll()} disabled={unread === 0}>
                Read all
              </button>
              {confirmClear ? (
                <>
                  <span className="notification-confirm-text">Clear all?</span>
                  <button type="button" className="notification-btn danger" onClick={() => void clearAll()}>
                    Yes
                  </button>
                  <button type="button" className="notification-btn" onClick={() => setConfirmClear(false)}>
                    No
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="notification-btn danger"
                  onClick={() => setConfirmClear(true)}
                  disabled={notifications.length === 0}
                >
                  Clear
                </button>
              )}
            </div>
          </div>
          {offline ? (
            <div className="notification-empty">Offline — could not load notifications.</div>
          ) : notifications.length === 0 ? (
            <div className="notification-empty">No notifications yet.</div>
          ) : (
            <ul className="notification-list">
              {notifications.map((n) => (
                <li key={n.id} className={`notification-item${n.read ? " read" : ""}`}>
                  <div className="notification-item-head">
                    <span className="notification-category">{n.category ?? "system"}</span>
                    <span className="notification-time">{formatTime(n.createdAt)}</span>
                  </div>
                  <div className="notification-title">{n.title}</div>
                  <div className="notification-body">{n.body}</div>
                  <div className="notification-actions">
                    <button type="button" className="notification-btn" onClick={() => void read(n)}>
                      {n.read ? "Open" : "Read"}
                    </button>
                    <button type="button" className="notification-btn danger" onClick={() => void dismiss(n.id)}>
                      Dismiss
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default NotificationCenter;
