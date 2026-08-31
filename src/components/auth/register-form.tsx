"use client"

import { useActionState, useState, type FormEvent } from "react"
import Link from "next/link"

import { signUp, type AuthResult } from "@/lib/auth/actions"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AuthCard } from "@/components/auth/auth-card"

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD_LENGTH = 8

const initialState: AuthResult = {}

export function RegisterForm() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [clientError, setClientError] = useState<string | null>(null)

  const [state, formAction, pending] = useActionState(signUp, initialState)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setClientError(null)

    if (!EMAIL_PATTERN.test(email)) {
      setClientError("Adresse email invalide.")
      return
    }
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
    formData.set("email", email)
    formData.set("password", password)
    formData.set("confirmPassword", confirmPassword)
    formAction(formData)
  }

  const error = state?.error ?? clientError
  const success = state?.success

  return (
    <AuthCard
      title="Créer un compte"
      description="Rejoins-nous et accède à ton espace."
      footer={
        <>
          Déjà un compte ?{" "}
          <Link
            href="/login"
            className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
          >
            Se connecter
          </Link>
        </>
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

          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Mot de passe</Label>
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
            {pending ? "Création du compte…" : "Créer mon compte"}
          </Button>
        </form>
      )}
    </AuthCard>
  )
}
