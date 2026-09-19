import { describe, expect, it } from "vitest"

import { emailTemplates, escapeHtml } from "./templates"

describe("escapeHtml", () => {
  it("échappe les cinq caractères sensibles", () => {
    expect(escapeHtml(`<script>&"'`)).toBe("&lt;script&gt;&amp;&quot;&#39;")
  })

  it("laisse un texte sain intact", () => {
    expect(escapeHtml("Acme Corp")).toBe("Acme Corp")
  })
})

describe("emailTemplates.invitation", () => {
  const data = {
    to: "boss@acme.test",
    referenceId: "token-x",
    organizationName: "Acme & Sons",
    role: "admin",
    acceptUrl: "https://app.example.com/invitations/accept?token=abc",
  }

  it("rend un sujet avec le nom de l'organisation", () => {
    const { subject } = emailTemplates.invitation(data)
    expect(subject).toContain("Acme & Sons")
  })

  it("échappe le nom d'organisation dans le HTML", () => {
    const { html } = emailTemplates.invitation(data)
    expect(html).toContain("Acme &amp; Sons")
    expect(html).not.toContain("<script")
  })

  it("inclut le lien d'acceptation dans le texte brut", () => {
    const { text } = emailTemplates.invitation(data)
    expect(text).toContain(data.acceptUrl)
    expect(text).toContain("administrateur")
  })

  it("conserve le rôle brut quand il n'a pas de libellé connu", () => {
    const { text } = emailTemplates.invitation({ ...data, role: "auditor" })
    expect(text).toContain("auditor")
  })
})

describe("emailTemplates.notification", () => {
  it("échappe le titre et le corps multi-paragraphes", () => {
    const { html } = emailTemplates.notification({
      to: "boss@acme.test",
      referenceId: "general:abc",
      title: "Alerte <script>",
      body: "Premier <b>paragraphe</b>.\n\nDeuxième.",
    })
    expect(html).toContain("Alerte &lt;script&gt;")
    expect(html).not.toContain("<script>")
    expect(html).toContain("Premier &lt;b&gt;paragraphe&lt;/b&gt;.")
    expect(html).toContain("Deuxième.")
  })

  it("inclut un lien d'action quand fourni, sinon ne l'ajoute pas", () => {
    const withAction = emailTemplates.notification({
      to: "boss@acme.test",
      referenceId: "general:abc",
      title: "Nouveauté",
      body: "Rien de spécial.",
      actionUrl: "https://app.example.com/dashboard/notifications?id=x",
    })
    expect(withAction.html).toContain("Voir en détail")
    expect(withAction.text).toContain("Voir en détail : https://app.example.com")

    const withoutAction = emailTemplates.notification({
      to: "boss@acme.test",
      referenceId: "general:abc",
      title: "Nouveauté",
      body: "Rien de spécial.",
    })
    expect(withoutAction.html).not.toContain("Voir en détail")
  })

  it("produit un corps réellement vide quand aucun contenu", () => {
    const { text } = emailTemplates.notification({
      to: "boss@acme.test",
      referenceId: "general:abc",
      title: "Rien",
      body: "",
    })
    expect(text).not.toContain("undefined")
  })
})