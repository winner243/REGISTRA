"use client"

import { useActionState, useState, type FormEvent } from "react"
import Link from "next/link"

import { login, type AuthResult } from "@/lib/auth/actions"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AuthCard } from "@/components/auth/auth-card"

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const initialState: AuthResult = {}

export function LoginForm({ next }: { next?: string }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [clientError, setClientError] = useState<string | null>(null)

  const [state, formAction, pending] = useActionState(login, initialState)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setClientError(null)

    if (!EMAIL_PATTERN.test(email)) {
      setClientError("Adresse email invalide.")
      return
    }
    if (!password) {
      setClientError("Le mot de passe est requis.")
      return
    }

    const formData = new FormData()
    formData.set("email", email)
    formData.set("password", password)
    if (next) {
      formData.set("next", next)
    }
    formAction(formData)
  }

  const error = state?.error ?? clientError

  return (
    <AuthCard
      title="Connexion"
      description="Connecte-toi pour accéder à ton espace."
      footer={
        <>
          Pas encore de compte ?{" "}
          <Link
            href="/register"
            className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
          >
            Créer un compte
          </Link>
        </>
      }
    >
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
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            disabled={pending}
            aria-invalid={Boolean(error)}
          />
          <div className="flex justify-end">
            <Link
              href="/forgot-password"
              className="text-sm text-muted-foreground underline underline-offset-4 hover:text-primary"
            >
              Mot de passe oublié ?
            </Link>
          </div>
        </div>

        {error && (
          <Alert variant="destructive" className="py-2.5">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button type="submit" disabled={pending}>
          {pending ? "Connexion en cours…" : "Se connecter"}
        </Button>
      </form>
    </AuthCard>
  )
}
