"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"

import {
  dismissNotification,
  markNotificationsRead,
} from "@/lib/notifications/actions"
import type { NotificationRecord } from "@/lib/notifications/types"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

function NotificationItem({
  notification,
  onMarkRead,
  onDismiss,
}: {
  notification: NotificationRecord
  onMarkRead: (id: string) => void
  onDismiss: (id: string) => void
}) {
  const read = notification.read_at !== null

  return (
    <li
      className={cn(
        "flex flex-col gap-2 rounded-lg border p-4 sm:flex-row sm:items-start sm:justify-between",
        !read && "border-primary/30 bg-muted/50",
      )}
    >
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Badge variant={read ? "secondary" : "default"}>
            {notification.type}
          </Badge>
          {!read && <span className="size-1.5 rounded-full bg-primary" />}
        </div>
        <p className="text-sm font-medium text-foreground">
          {notification.title}
        </p>
        {notification.body ? (
          <p className="text-sm text-muted-foreground">
            {notification.body}
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {formatDate(notification.created_at)}
        </p>
      </div>

      <div className="flex items-center gap-2 sm:flex-col">
        {!read ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onMarkRead(notification.id)}
          >
            Marquer comme lue
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => onDismiss(notification.id)}
        >
          Supprimer
        </Button>
      </div>
    </li>
  )
}

export function NotificationsList({
  notifications = [],
}: {
  notifications: NotificationRecord[]
  preferences: { channel: string; enabled: boolean }[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [items, setItems] = useState(notifications)

  const unread = items.filter((n) => n.read_at === null)

  function markRead(ids: string[]) {
    startTransition(async () => {
      const result = await markNotificationsRead(ids)
      if (!result?.error) {
        setItems((prev) =>
          prev.map((n) =>
            ids.includes(n.id)
              ? { ...n, read_at: n.read_at ?? new Date().toISOString() }
              : n,
          ),
        )
      }
      router.refresh()
    })
  }

  function dismiss(id: string) {
    startTransition(async () => {
      const result = await dismissNotification(id)
      if (!result?.error) {
        setItems((prev) => prev.filter((n) => n.id !== id))
      }
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {items.length} notification{items.length > 1 ? "s" : ""}
          {unread.length > 0
            ? ` — ${unread.length} non lue${unread.length > 1 ? "s" : ""}`
            : ""}
        </p>
        {unread.length > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => markRead(unread.map((n) => n.id))}
          >
            Tout marquer comme lu
          </Button>
        ) : null}
      </div>

      {items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Aucune notification pour le moment.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              onMarkRead={(id) => markRead([id])}
              onDismiss={dismiss}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
