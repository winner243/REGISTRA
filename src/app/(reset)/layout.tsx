import type { ReactNode } from "react"

export default function ResetLayout({ children }: { children: ReactNode }) {
  // Le lien de réinitialisation reçu par email contient le jeton de session
  // dans le hash de l'URL (#access_token=...&type=recovery). Ce jeton est
  // échangé côté client par le formulaire (createBrowserClient), donc on ne
  // peut pas exiger une session ici (elle n'existe pas encore en cookie au
  // premier affichage). Le formulaire gère lui-même l'absence de session.
  return (
    <main className="flex min-h-full flex-1 flex-col items-center justify-center">
      {children}
    </main>
  )
}
