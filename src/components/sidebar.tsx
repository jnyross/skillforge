"use client"

import Link from 'next/link'
import { GitBranch, FlaskConical, Swords, Scale, Zap, Wand2, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SidebarProps {
  activePath: string
}

const navItems = [
  { href: '/', label: 'Repositories', icon: GitBranch },
  { href: '/evals', label: 'Evals', icon: FlaskConical, disabled: true },
  { href: '/arena', label: 'Review Arena', icon: Swords, disabled: true },
  { href: '/judges', label: 'Judges', icon: Scale, disabled: true },
  { href: '/optimizer', label: 'Optimizer', icon: Zap, disabled: true },
  { href: '/wizard', label: 'Wizard', icon: Wand2, disabled: true },
  { href: '/settings', label: 'Settings', icon: Settings, disabled: true },
]

export function Sidebar({ activePath }: SidebarProps) {
  return (
    <aside className="w-64 border-r bg-card min-h-screen p-4 flex flex-col">
      <div className="mb-8">
        <Link href="/" className="flex items-center gap-2 px-2">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
            <Zap className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-lg font-bold">SkillForge</span>
        </Link>
      </div>

      <nav className="flex-1 space-y-1">
        {navItems.map((item) => {
          const isActive = activePath === item.href
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.disabled ? '#' : item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                item.disabled && 'opacity-40 cursor-not-allowed'
              )}
              onClick={(e) => item.disabled && e.preventDefault()}
            >
              <Icon className="h-4 w-4" />
              {item.label}
              {item.disabled && (
                <span className="ml-auto text-xs opacity-60">Soon</span>
              )}
            </Link>
          )
        })}
      </nav>

      <div className="mt-auto pt-4 border-t">
        <p className="text-xs text-muted-foreground px-3">
          SkillForge v0.1.0
        </p>
      </div>
    </aside>
  )
}
