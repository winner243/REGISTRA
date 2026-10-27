import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { brand } from "@/config/brand"
import { Layers, ShieldCheck, Rocket, Users } from "lucide-react"

const features = [
  {
    icon: Layers,
    title: "Architecture claire",
    description: "Une structure App Router organisée en routes prêtes à accueillir vos fonctionnalités métier.",
  },
  {
    icon: ShieldCheck,
    title: "Authentification incluse",
    description: "Connexion par email et mot de passe avec Supabase, sessions et pages protégées.",
  },
  {
    icon: Rocket,
    title: "Démarrage rapide",
    description: "Des composants réutilisables et un design system prêt à l'emploi pour avancer vite.",
  },
  {
    icon: Users,
    title: "Évolutif",
    description: "Une base générique réutilisable pour tous vos futurs projets, sans repartir de zéro.",
  },
]

export default function Home() {
  return (
    <>
      <section className="mx-auto flex w-full max-w-7xl flex-1 items-center justify-center px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
        <div className="flex w-full max-w-xl flex-col items-center gap-6 text-center">
          <Badge variant="outline" className="rounded-full px-3 py-1">
            {brand.tagline}
          </Badge>
          <h1 className="text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Construisez votre prochain SaaS plus rapidement.
          </h1>
          <p className="max-w-lg text-pretty text-lg leading-relaxed text-muted-foreground">
            Une base moderne, réutilisable et évolutive pour lancer votre
            produit.
          </p>
          <div className="flex w-full max-w-xs flex-col gap-3 sm:w-auto sm:max-w-none sm:flex-row">
            <Button size="lg" nativeButton={false} render={<Link href="/dashboard" />}>
              Commencer
            </Button>
            <Button size="lg" variant="outline" nativeButton={false} render={<Link href="/pricing" />}>
              Voir la tarification
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 pb-20 sm:px-6 sm:pb-28 lg:px-8">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Tout ce qu&apos;il faut pour commencer
          </h2>
          <p className="text-pretty text-muted-foreground">
            Les fondations essentielles d&apos;un SaaS, prêtes à personnaliser.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => {
            const Icon = feature.icon
            return (
              <Card key={feature.title}>
                <CardHeader>
                  <CardDescription>
                    <Icon className="size-5 text-primary" />
                  </CardDescription>
                  <CardTitle>{feature.title}</CardTitle>
                </CardHeader>
                <CardContent className="text-muted-foreground">
                  {feature.description}
                </CardContent>
              </Card>
            )
          })}
        </div>

        <div className="mt-16 flex flex-col items-center gap-4 border-t pt-14 text-center">
          <h2 className="text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Prêt à démarrer&nbsp;?
          </h2>
          <p className="max-w-md text-pretty text-muted-foreground">
            Créez votre compte et explorez un dashboard complet dès maintenant.
          </p>
          <div className="flex w-full max-w-xs flex-col gap-3 sm:w-auto sm:max-w-none sm:flex-row">
            <Button size="lg" nativeButton={false} render={<Link href="/register" />}>
              Créer un compte
            </Button>
            <Button size="lg" variant="outline" nativeButton={false} render={<Link href="/login" />}>
              Se connecter
            </Button>
          </div>
        </div>
      </section>
    </>
  )
}
