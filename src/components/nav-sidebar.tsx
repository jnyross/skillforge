'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  FolderGit2, FlaskConical, Users, Scale, Zap, Wand2,
  Settings, Activity, LayoutDashboard, Shield, SearchSlash, Database, ScrollText,
  MessageSquarePlus,
} from 'lucide-react'

const navItems = [
  { href: '/wizard', label: 'Wizard', icon: Wand2 },
  { href: '/', label: 'Repositories', icon: FolderGit2 },
  { href: '/evals', label: 'Evals', icon: FlaskConical },
  { href: '/eval-builder', label: 'Eval Builder', icon: MessageSquarePlus },
  { href: '/traces', label: 'Trace Lab', icon: Activity },
  { href: '/reviews', label: 'Review Arena', icon: Users },
  { href: '/judges', label: 'Judges', icon: Scale },
  { href: '/optimizer', label: 'Optimizer', icon: Zap },
  { href: '/error-analysis', label: 'Error Analysis', icon: SearchSlash },
  { href: '/synthetic-data', label: 'Synthetic Data', icon: Database },
  { href: '/acceptance', label: 'Acceptance', icon: Shield },
  { href: '/audit-log', label: 'Audit Log', icon: ScrollText },
  { href: '/settings', label: 'Settings', icon: Settings },
]

export function NavSidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-56 border-r border-border bg-card flex flex-col h-screen sticky top-0">
      <div className="p-4 border-b border-border">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg">
          <LayoutDashboard className="h-5 w-5 text-primary" />
          <span>SkillForge</span>
        </Link>
      </div>

      <nav className="flex-1 p-2 space-y-1">
        {navItems.map(item => {
          const isActive = item.href === '/'
            ? pathname === '/' || pathname.startsWith('/skill-repos')
            : pathname.startsWith(item.href)

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                isActive
                  ? 'bg-primary/10 text-primary font-medium'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="p-4 border-t border-border text-xs text-muted-foreground">
        SkillForge v1.0.0
      </div>
    </aside>
  )
}
