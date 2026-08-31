import type { Metadata } from "next"

import { ForgotPasswordForm } from "@/components/auth/forgot-password-form"
import { SupabaseNotConfiguredNotice } from "@/components/auth/supabase-config-notice"

export const metadata: Metadata = {
  title: "Mot de passe oublié",
}

export default function ForgotPasswordPage() {
  return (
    <div className="flex flex-col gap-6">
      <SupabaseNotConfiguredNotice />
      <ForgotPasswordForm />
    </div>
  )
}
