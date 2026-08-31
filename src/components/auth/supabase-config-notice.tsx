import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { isSupabaseConfigured } from "@/lib/supabase/env"

/**
 * Affiche un avertissement sur les pages d'authentification quand Supabase
 * n'est pas configuré. Permet au développeur de comprendre immédiatement
 * pourquoi les formulaires d'auth ne fonctionnent pas.
 *
 * Ne se rend (et ne récupère donc jamais la configuration) que si
 * Supabase n'est pas configuré.
 */
export function SupabaseNotConfiguredNotice() {
  if (isSupabaseConfigured()) {
    return null
  }

  return (
    <Alert variant="destructive" className="w-full max-w-sm">
      <AlertTitle>Supabase non configuré</AlertTitle>
      <AlertDescription>
        Ajoute <code>NEXT_PUBLIC_SUPABASE_URL</code> et{" "}
        <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> dans ton fichier{" "}
        <code>.env.local</code> (voir <code>.env.example</code>) pour activer
        l&apos;authentification.
      </AlertDescription>
    </Alert>
  )
}
