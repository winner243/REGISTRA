import type { SupabaseClient } from "@supabase/supabase-js"

import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { createSupabaseServerClient } from "@/lib/supabase/server"
import { isEmailConfigured } from "@/lib/email"
import {
  NotificationError,
  type EmailNotificationDescriptor,
  type NotificationChannel,
  type NotificationTemplate,
} from "@/lib/notifications/types"

export interface NotifyInput {
  /** Destinataire de la notification (propriétaire de la ligne in-app). */
  userId: string
  /** Email du destinataire, fourni par l'appelant SJ pour l'envoi email. */
  email?: string
  /** Organisation liée (null = notification globale plateforme). */
  organizationId?: string | null
  /** Type de notification (catalogue `notification_templates`). */
  type: string
  title: string
  body?: string | null
  /** Données contextuelles minimales, non sensibles. */
  data?: Record<string, unknown>
}

export interface NotifyResult {
  /** Id de la ligne in-app créée (null en mode dégradé / sans canal in-app). */
  notificationId: string | null
  /** Email à envoyer en tâche de fond si éligible (canal + préférences). */
  email: EmailNotificationDescriptor | null
}

/** Vrai quand le canal est permis par le template de notification. */
export function isChannelAllowed(
  template: NotificationTemplate,
  channel: NotificationChannel,
): boolean {
  return template.enabled && template.channels.includes(channel)
}

/**
 * (PUR) Décide si un email doit être expédié pour cette notification :
 * le canal email est permis par le template, un destinataire est fourni,
 * la préférence de l'utilisateur est activée et l'email est configuré
 * (provider). Sinon → null (in-app seule).
 */
export function resolveEmailDelivery(
  input: Pick<NotifyInput, "email" | "type" | "title" | "body">,
  template: NotificationTemplate,
  options: { emailEnabled: boolean; emailConfigured?: boolean },
): EmailNotificationDescriptor | null {
  if (!isChannelAllowed(template, "email")) {
    return null
  }
  if (!input.email || !options.emailEnabled) {
    return null
  }
  const configured = options.emailConfigured ?? isEmailConfigured()
  if (!configured) {
    return null
  }
  return {
    to: input.email,
    referenceId: `${input.type}:${crypto.randomUUID()}`,
    title: input.title,
    body: input.body ?? "",
  }
}

/**
 * Service générique de notifications. Le rendu des emails reste confié à
 * l'EmailService (templates TS échappés) ; le canal `push` est RÉSERVÉ pour
 * l'avenir (aucun envoi implémenté).
 *
 * Le catalogue des types est lu via le client serveur (RLS : catalogue en
 * lecture publique), la création in-app et la préférence email via le client
 * admin (`service_role`). Sans clé admin (mode local dégradé), le service
 * ne crée rien mais produira quand même le descripteur email : l'email est
 * simplement dégradé, jamais faux. Le destinataire ne voit jamais une in-app
 * dont la création a échoué.
 */
export class NotificationService {
  constructor(
    private readonly getAdmin: () => Promise<SupabaseClient | null> = createSupabaseAdminClient,
    private readonly getServer: () => Promise<SupabaseClient | null> = createSupabaseServerClient,
  ) {}

  /** Type de notification depuis le catalogue (null si inconnu/inaccessible). */
  async getTemplate(name: string): Promise<NotificationTemplate | null> {
    const client = (await this.getServer()) ?? (await this.getAdmin())
    if (!client) {
      return null
    }
    const { data, error } = await client
      .from("notification_templates")
      .select("name, description, channels, enabled")
      .eq("name", name)
      .maybeSingle()
    if (error || !data) {
      return null
    }
    return {
      name: String(data.name),
      description: String(data.description),
      channels: (data.channels ?? []) as NotificationChannel[],
      enabled: Boolean(data.enabled),
    }
  }

  /** La préférence email est-elle activée ? (défaut : activée). */
  async isEmailEnabled(userId: string): Promise<boolean> {
    const admin = await this.getAdmin()
    if (!admin) {
      return true
    }
    const { data, error } = await admin
      .from("notification_preferences")
      .select("enabled")
      .eq("user_id", userId)
      .eq("channel", "email")
      .maybeSingle()
    if (error || !data) {
      return true
    }
    return data.enabled !== false
  }

  /**
   * Crée la notification in-app et rend le descripteur email éligible.
   * L'appelant expédie l'email en tâche de fond (`after()` sur les Server
   * Actions) via l'EmailService — une notification n'ouvre jamais de blocage.
   */
  async notify(input: NotifyInput): Promise<NotifyResult> {
    const template = await this.getTemplate(input.type)
    if (!template || !isChannelAllowed(template, "in_app")) {
      throw new NotificationError(
        "template-error",
        `Type de notification inconnu ou inactif : ${input.type}.`,
      )
    }

    let notificationId: string | null = null
    const admin = await this.getAdmin()
    if (admin) {
      const { data, error } = await admin.rpc("create_notification", {
        p_user_id: input.userId,
        p_type: input.type,
        p_title: input.title,
        p_body: input.body ?? null,
        p_organization_id: input.organizationId ?? null,
        p_data: (input.data ?? {}) as object,
      })
      if (error) {
        throw new NotificationError(
          "internal",
          "Impossible de créer la notification.",
          { cause: error },
        )
      }
      notificationId = typeof data === "string" ? data : null
    }

    const emailEnabled = await this.isEmailEnabled(input.userId)
    const email = resolveEmailDelivery(input, template, { emailEnabled })

    return { notificationId, email }
  }

  /**
   * Notification in-app destinée à CHAQUE membre d'une organisation
   * (multi-tenant). Retourne le nombre de lignes créées.
   */
  async notifyOrganization(
    organizationId: string,
    input: Omit<NotifyInput, "userId" | "organizationId" | "email">,
  ): Promise<number> {
    const template = await this.getTemplate(input.type)
    if (!template || !isChannelAllowed(template, "in_app")) {
      throw new NotificationError(
        "template-error",
        `Type de notification inconnu ou inactif : ${input.type}.`,
      )
    }
    const admin = await this.getAdmin()
    if (!admin) {
      return 0
    }
    const { data, error } = await admin.rpc("notify_organization_members", {
      p_organization_id: organizationId,
      p_type: input.type,
      p_title: input.title,
      p_body: input.body ?? null,
      p_data: (input.data ?? {}) as object,
    })
    if (error) {
      throw new NotificationError(
        "internal",
        "Impossible de notifier l'organisation.",
        { cause: error },
      )
    }
    return typeof data === "number" ? data : 0
  }
}

/** Instance partagée du service de notifications. */
export const notificationService = new NotificationService()