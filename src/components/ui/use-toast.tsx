/* Use Toast - shadcn/ui toast hook */
"use client"

import { useState } from 'react'

type ToastAction = {
  id: string
  action: 'remove'
}

type Toast = {
  id: string
  title?: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
  closeButton?: boolean
}

type ToastVariant = 'default' | 'destructive'

type ToastOptions = {
  title?: string
  description?: string
  action?: {
    label: string
    onClick: () => void
  }
  closeButton?: boolean
  duration?: number
  variant?: ToastVariant
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const toast = (options: ToastOptions) => {
    const id = Math.random().toString(36).substr(2, 9)
    const newToast: Toast = {
      id,
      title: options.title,
      description: options.description,
      action: options.action,
      closeButton: options.closeButton,
    }
    setToasts((prev) => [...prev, newToast])
    return { id, dismiss: () => setToasts((prev) => prev.filter((t) => t.id !== id)) }
  }

  // Alias pour compatibilité avec les composants existants
  const open: typeof toast = (options) => toast(options)

  const dismiss = (id?: string) => {
    setToasts((prev) => prev.filter((t) => id === undefined || t.id !== id))
  }

  return { toast, open, dismiss, toasts }
}

/* Component pour l'affichage des toasts (non requis côté serveur) */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}