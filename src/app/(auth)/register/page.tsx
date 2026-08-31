import type { Metadata } from "next"

import { RegisterForm } from "@/components/auth/register-form"
import { SupabaseNotConfiguredNotice } from "@/components/auth/supabase-config-notice"

export const metadata: Metadata = {
  title: "Créer un compte",
}

export default function RegisterPage() {
  return (
    <div className="flex flex-col gap-6">
      <SupabaseNotConfiguredNotice />
      <RegisterForm />
    </div>
  )
}
