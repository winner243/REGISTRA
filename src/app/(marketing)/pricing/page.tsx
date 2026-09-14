import type { Metadata } from "next"
import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Check } from "lucide-react"

export const metadata: Metadata = {
  title: "Tarification",
  description: "Des plans simples pour démarrer. Prix de démonstration.",
}

type Plan = {
  name: string
  price: string
  description: string
  features: string[]
  highlighted?: boolean
}

const plans: Plan[] = [
  {
    name: "Free",
    price: "$0",
    description: "Pour découvrir le produit.",
    features: ["1 projet", "Communauté", "Support par email"],
  },
  {
    name: "Pro",
    price: "$19",
    description: "Pour les utilisateurs actifs.",
    features: ["Projets illimités", "Priorité d'email", "Analytics avancés"],
    highlighted: true,
  },
  {
    name: "Business",
    price: "$49",
    description: "Pour les équipes en croissance.",
    features: ["Collaboration", "Rôles d'équipe", "Support dédié"],
  },
]

export default function PricingPage() {
  return (
    <section className="mx-auto w-full max-w-7xl flex-1 px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-3 text-center">
        <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Tarification
        </h1>
        <p className="text-pretty text-muted-foreground">
          Des plans simples et évolutifs. Les prix affichés sont de
          démonstration.
        </p>
      </div>

      <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => (
          <Card key={plan.name} className="relative">
            {plan.highlighted && (
              <Badge className="absolute top-4 right-4">Populaire</Badge>
            )}
            <CardHeader>
              <CardTitle>{plan.name}</CardTitle>
              <CardDescription>{plan.description}</CardDescription>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-3xl font-semibold tracking-tight text-foreground">
                  {plan.price}
                </span>
                <span className="text-sm text-muted-foreground">/ mois</span>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2">
                {plan.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-center gap-2 text-sm text-muted-foreground"
                  >
                    <Check className="size-4 shrink-0 text-primary" />
                    {feature}
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Button
                className="w-full"
                variant={plan.highlighted ? "default" : "outline"}
                render={<Link href="/register" />}
              >
                Commencer
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </section>
  )
}
