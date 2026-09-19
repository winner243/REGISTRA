"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"

import { NotificationPreferences } from "@/components/settings/notification-preferences"

const appearanceOptions = ["Clair", "Sombre", "Système"]

export function SettingsTabs({
  notificationPreferences = [],
}: {
  notificationPreferences: { channel: string; enabled: boolean }[]
}) {
  const [theme, setTheme] = useState("Système")

  return (
    <Tabs defaultValue="general" className="w-full">
      <TabsList>
        <TabsTrigger value="general">Général</TabsTrigger>
        <TabsTrigger value="notifications">Notifications</TabsTrigger>
        <TabsTrigger value="appearance">Apparence</TabsTrigger>
      </TabsList>

      <TabsContent value="general">
        <Card>
          <CardHeader>
            <CardTitle>Général</CardTitle>
            <CardDescription>
              Configurations générales de votre espace.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="workspace-name">Nom de l&apos;espace</Label>
              <Input
                id="workspace-name"
                type="text"
                defaultValue="Mon espace"
                className="max-w-sm"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="default-language">Langue par défaut</Label>
              <Input
                id="default-language"
                type="text"
                defaultValue="Français"
                className="max-w-sm"
              />
            </div>
            <div className="mt-2">
              <Button type="button" disabled title="Sauvegarde à venir">
                Enregistrer
              </Button>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="notifications">
        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
            <CardDescription>
              Gérez les canaux de notification de votre espace.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <NotificationPreferences
              initialPreferences={notificationPreferences}
            />
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="appearance">
        <Card>
          <CardHeader>
            <CardTitle>Apparence</CardTitle>
            <CardDescription>
              Personalisez l&apos;apparence de votre espace.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Label>Thème</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              {appearanceOptions.map((option) => (
                <Button
                  key={option}
                  type="button"
                  variant={theme === option ? "default" : "outline"}
                  className={cn(theme === option && "ring-2 ring-ring/50")}
                  onClick={() => setTheme(option)}
                >
                  {option}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  )
}
