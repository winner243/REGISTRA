import type { Metadata } from "next"

import { LoginForm } from "@/components/auth/login-form"
import { SupabaseNotConfiguredNotice } from "@/components/auth/supabase-config-notice"

export const metadata: Metadata = {
  title: "Connexion",
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>
}) {
  const { next } = await searchParams

  return (
    <div className="flex flex-col gap-6">
      <SupabaseNotConfiguredNotice />
      <LoginForm next={next} />
    </div>
  )
}