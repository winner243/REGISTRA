"use client"

import { useActionState, useEffect, useState, type FormEvent } from "react"
import Link from "next/link"

import { resetPassword, type AuthResult } from "@/lib/auth/actions"
import { isSupabaseConfigured } from "@/lib/supabase/env"
import { createSupabaseBrowserClient } from "@/lib/supabase/client"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AuthCard } from "@/components/auth/auth-card"

const MIN_PASSWORD_LENGTH = 8

const initialState: AuthResult = {}

export function ResetPasswordForm() {
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [clientError, setClientError] = useState<string | null>(null)
  const configured = isSupabaseConfigured()
  const [checkedSession, setCheckedSession] = useState(!configured)
  const [hasSession, setHasSession] = useState(false)

  const [state, formAction, pending] = useActionState(
    resetPassword,
    initialState
  )

  // Le lien de réinitialisation arrive avec le jeton de session dans le hash
  // de l'URL. On force l'échange de ce jeton en cookies via le client navigateur.
  useEffect(() => {
    if (!configured) return

    const browserClient = createSupabaseBrowserClient()
    if (!browserClient) return

    let cancelled = false

    browserClient.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return
      setHasSession(Boolean(session))
      setCheckedSession(true)
    })

    return () => {
      cancelled = true
    }
  }, [configured])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setClientError(null)

    if (password.length < MIN_PASSWORD_LENGTH) {
      setClientError(
        `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`
      )
      return
    }
    if (password !== confirmPassword) {
      setClientError("Les mots de passe ne correspondent pas.")
      return
    }

    const formData = new FormData()
    formData.set("password", password)
    formData.set("confirmPassword", confirmPassword)
    formAction(formData)
  }

  const error = state?.error ?? clientError
  const success = state?.success

  return (
    <AuthCard
      title="Nouveau mot de passe"
      description="Choisis un nouveau mot de passe pour ton compte."
      footer={
        <Link
          href="/login"
          className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
        >
          Retour à la connexion
        </Link>
      }
    >
      {success ? (
        <div className="flex flex-col gap-4">
          <Alert className="py-2.5">
            <AlertDescription>{success}</AlertDescription>
          </Alert>
          <Button render={<Link href="/login" />}>Se connecter</Button>
        </div>
      ) : !checkedSession ? (
        <p className="text-sm text-muted-foreground">
          Vérification de ta session…
        </p>
      ) : !hasSession ? (
        <div className="flex flex-col gap-4">
          <Alert variant="destructive" className="py-2.5">
            <AlertDescription>
              Lien de réinitialisation invalide ou expiré. Demande un nouveau
              lien depuis la page de récupération.
            </AlertDescription>
          </Alert>
          <Button render={<Link href="/forgot-password" />}>
            Mot de passe oublié ?
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Nouveau mot de passe</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              placeholder="8 caractères minimum"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={pending}
              aria-invalid={Boolean(error)}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              disabled={pending}
              aria-invalid={Boolean(error)}
            />
          </div>

          {error && (
            <Alert variant="destructive" className="py-2.5">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={pending}>
            {pending ? "Mise à jour…" : "Mettre à jour le mot de passe"}
          </Button>
        </form>
      )}
    </AuthCard>
  )
}
