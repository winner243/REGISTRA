import { FC } from 'react'

import { signOut } from '@/lib/auth/actions'

type SidebarSidebarItemProps = {
  href: string
  icon: React.ElementType
  title: string
}

type SidebarProps = {
  children: React.ReactNode
}

type SidebarFooterProps = {
  children: React.ReactNode
}

export const SidebarSidebarItem: FC<SidebarSidebarItemProps> = ({
  href,
  icon: Icon,
  title
}) => {
  return (
    <a href={href} className="flex items-center p-2 rounded-md hover:bg-muted/20 transition-colors">
      <Icon className="h-4 w-4" />
      <span className="ml-2 text-sm">{title}</span>
    </a>
  )
}

export const SidebarFooter: FC<SidebarFooterProps> = ({ children }) => {
  return <footer className="p-3 border-t">{children}</footer>
}

export const Sidebar: FC<SidebarProps> = ({ children }) => {
  return (
    <nav className="bg-sidebar p-4 rounded-md shadow-md">
      {children}
      <SidebarFooter>
        <div className="flex items-center gap-3 mt-4">
          <span className="text-sm font-medium">Registra MVP V1</span>
          {/* Ancien lien `/logout` : route inexistante (404). Remplacé par la
              Server Action `signOut`, qui révoque la session puis redirige. */}
          <form action={signOut}>
            <button
              type="submit"
              className="text-sm text-muted-foreground hover:underline"
            >
              Déconnexion
            </button>
          </form>
        </div>
      </SidebarFooter>
    </nav>
  )
}