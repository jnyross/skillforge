import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { NavSidebar } from '@/components/nav-sidebar'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'SkillForge',
  description: 'Git-backed repository, eval lab, and auto-optimizer for Claude Code Skills',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        <div className="min-h-screen bg-background text-foreground flex">
          <NavSidebar />
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
