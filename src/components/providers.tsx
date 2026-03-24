'use client'

import { TechLevelProvider } from '@/lib/context/tech-level-context'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <TechLevelProvider>
      {children}
    </TechLevelProvider>
  )
}
