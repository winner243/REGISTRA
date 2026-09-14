export const SUBSCRIPTION_STATUSES = [
  "trialing",
  "active",
  "past_due",
  "canceled",
] as const

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number]

export interface SubscriptionSummary {
  id: string
  organizationId: string
  planCode: string
  status: SubscriptionStatus
  currentPeriodStart: string
  currentPeriodEnd: string
  cancelAtPeriodEnd: boolean
}

export interface PlanSummary {
  code: string
  name: string
  description: string | null
  features: ReadonlyArray<string>
  limits: Readonly<Record<string, number>>
}

export interface LimitEvaluation {
  usage: number
  limit: number | null
  requestedAmount: number
  allowed: boolean
  remaining: number | null
}

export type UsageStatusRow = {
  limitKey: string
  limitValue: number
  used: number
  remaining: number
}

export type BillingErrorCode =
  | "no-subscription"
  | "usage-limit-exceeded"
  | "invalid-amount"
  | "forbidden"
  | "unauthenticated"
  | "internal"

export class BillingError extends Error {
  readonly code: BillingErrorCode

  constructor(code: BillingErrorCode, message: string) {
    super(message)
    this.name = "BillingError"
    this.code = code
  }
}