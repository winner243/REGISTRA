export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

export interface InvitationEmailData {
  /** Destinataire (normalisé par le schéma). */
  to: string
  /** Clé d'idempotence de la file outbox (ex. token d'invitation). */
  referenceId: string
  organizationName: string
  role: string
  acceptUrl: string
}

export interface NotificationEmailData {
  /** Destinataire (normalisé par le schéma). */
  to: string
  /** Clé d'idempotence de la file outbox (type de notification + uuid). */
  referenceId: string
  title: string
  body: string
  actionUrl?: string
}

export interface EmailTemplateMap {
  invitation: InvitationEmailData
  notification: NotificationEmailData
}

export type EmailTemplateName = keyof EmailTemplateMap
export type TemplateData<N extends EmailTemplateName> = EmailTemplateMap[N]

/**
 * Supprime les caractères CRLF (retour chariot, saut de ligne) d'une valeur
 * destinée à être utilisée dans un champ d'en-tête email (subject, to…).
 * Protège contre l'injection d'en-têtes email.
 */
function stripCrlf(value: string): string {
  return value.replace(/[\r\n]/g, "")
}

/**
 * Échappe les valeurs interpolées dans le HTML. Obligatoire : les données
 * (nom d'organisation, rôle) proviennent d'entrées utilisateur.
 */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

const ROLE_LABELS: Record<string, string> = {
  owner: "propriétaire",
  admin: "administrateur",
  member: "membre",
}

function renderInvitation(
  data: InvitationEmailData,
): RenderedEmail {
  const organization = escapeHtml(data.organizationName)
  const role = escapeHtml(ROLE_LABELS[data.role] ?? data.role)
  const acceptUrl = escapeHtml(data.acceptUrl)

  return {
    subject: stripCrlf(`${data.organizationName} — Invitation à rejoindre l'équipe`),
    html: `
      <div style="font-family: sans-serif; color: #1f2937; max-width: 560px; margin: 0 auto;">
        <h2 style="font-size: 20px; margin-bottom: 12px;">Vous avez été invité(e) à rejoindre <strong>${organization}</strong></h2>
        <p style="line-height: 1.6;">Rôle proposé : <strong>${role}</strong>.</p>
        <p style="line-height: 1.6;">L'invitation expire dans 7 jours. Un seul compte est autorisé par invitation.</p>
        <p style="margin: 28px 0;">
          <a href="${acceptUrl}" style="background:#2563eb;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;">
            Accepter l'invitation
          </a>
        </p>
        <p style="color:#6b7280;font-size:13px;line-height:1.5;">
          Si le bouton ne fonctionne pas, copiez-collez ce lien :<br />${acceptUrl}
        </p>
        <p style="color:#6b7280;font-size:13px;">Si vous n'attendiez pas cette invitation, ignorez simplement cet e-mail.</p>
      </div>
    `.trim(),
    text: [
      `Vous avez été invité(e) à rejoindre "${data.organizationName}" en tant que ${ROLE_LABELS[data.role] ?? data.role}.`,
      "",
      "L'invitation expire dans 7 jours. Un seul compte est autorisé par invitation.",
      "",
      `Accepter l'invitation : ${data.acceptUrl}`,
      "",
      "Si vous n'attendiez pas cette invitation, ignorez simplement cet e-mail.",
    ].join("\n"),
  }
}

/**
 * Passe un corps multi-lignes (échappé) en paragraphes HTML.
 */
function renderParagraphs(body: string): string {
  return body
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(
      (line) =>
        `<p style="line-height: 1.6; margin: 0 0 12px;">${escapeHtml(line)}</p>`,
    )
    .join("\n")
}

function renderNotification(data: NotificationEmailData): RenderedEmail {
  const title = escapeHtml(data.title)
  const bodyHtml =
    renderParagraphs(data.body) ||
    '<p style="line-height: 1.6;">Une nouvelle activité vient de se produire.</p>'
  const actionUrl = data.actionUrl ? escapeHtml(data.actionUrl) : null

  return {
    subject: stripCrlf(`${data.title} — Notification`),
    html: `
      <div style="font-family: sans-serif; color: #1f2937; max-width: 560px; margin: 0 auto;">
        <h2 style="font-size: 20px; margin-bottom: 12px;">${title}</h2>
        ${bodyHtml}
        ${
          actionUrl
            ? `
        <p style="margin: 28px 0;">
          <a href="${actionUrl}" style="background:#2563eb;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;">
            Voir en détail
          </a>
        </p>
        <p style="color:#6b7280;font-size:13px;line-height:1.5;">
          Si le bouton ne fonctionne pas, copiez-collez ce lien :<br />${actionUrl}
        </p>`
            : ""
        }
        <p style="color:#6b7280;font-size:13px;">Envoyé automatiquement — ne répondez pas à cet e-mail.</p>
      </div>
    `.trim(),
    text: [
      data.title,
      "",
      data.body.trim(),
      actionUrl ? `Voir en détail : ${actionUrl}` : null,
      "",
      "Envoyé automatiquement — ne répondez pas à cet e-mail.",
    ]
      .filter(Boolean)
      .join("\n"),
  }
}

/**
 * Registre des templates. Pour ajouter un email : une entrée ici (type,
 * données, rendu HTML/texte) suffit — rien à changer dans le service.
 */
export const emailTemplates: {
  [N in EmailTemplateName]: (data: TemplateData<N>) => RenderedEmail
} = {
  invitation: renderInvitation,
  notification: renderNotification,
}