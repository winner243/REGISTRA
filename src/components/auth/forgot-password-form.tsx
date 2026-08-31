"use client"

import { useActionState, useState, type FormEvent } from "react"
import Link from "next/link"

import { forgotPassword, type AuthResult } from "@/lib/auth/actions"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AuthCard } from "@/components/auth/auth-card"

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const initialState: AuthResult = {}

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("")
  const [clientError, setClientError] = useState<string | null>(null)

  const [state, formAction, pending] = useActionState(
    forgotPassword,
    initialState
  )

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setClientError(null)

    if (!EMAIL_PATTERN.test(email)) {
      setClientError("Adresse email invalide.")
      return
    }

    const formData = new FormData()
    formData.set("email", email)
    formAction(formData)
  }

  const error = state?.error ?? clientError
  const success = state?.success

  return (
    <AuthCard
      title="Mot de passe oublié ?"
      description="Saisis ton email pour recevoir un lien de réinitialisation."
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
        <Alert className="py-2.5">
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="vous@exemple.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
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
            {pending ? "Envoi en cours…" : "Envoyer le lien"}
          </Button>
        </form>
      )}
    </AuthCard>
  )
}
