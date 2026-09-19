export const NOTIFICATION_CHANNELS = ["in_app", "email", "push"] as const

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number]

export interface NotificationTemplate {
  name: string
  description: string
  channels: NotificationChannel[]
  enabled: boolean
}

export interface NotificationRecord {
  id: string
  organization_id: string | null
  user_id: string
  type: string
  title: string
  body: string | null
  data: Record<string, unknown>
  read_at: string | null
  created_at: string
}

export type NotificationErrorCode =
  | "internal"
  | "template-error"
  | "forbidden"
  | "not-configured"

export class NotificationError extends Error {
  readonly code: NotificationErrorCode

  constructor(
    code: NotificationErrorCode,
    message: string,
    options: { cause?: unknown } = {},
  ) {
    super(message)
    this.name = "NotificationError"
    this.code = code
    if (options.cause !== undefined) {
      this.cause = options.cause
    }
  }
}

/** Descripteur d'un email à expédier (via l'EmailService, file outbox). */
export interface EmailNotificationDescriptor {
  to: string
  /** Clé d'idempotence de la file outbox (unique par type de notification). */
  referenceId: string
  title: string
  body: string
  actionUrl?: string
}