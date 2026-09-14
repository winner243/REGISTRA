export const AnalyticsEvents = {
  signedUp: "user.signed_up",
  loggedIn: "user.logged_in",
  loggedOut: "user.logged_out",
} as const

export type AnalyticsEvent =
  (typeof AnalyticsEvents)[keyof typeof AnalyticsEvents]

export type AnalyticsProperties = Record<string, string | number | boolean>
