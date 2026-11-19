import { createContext } from 'react'

export type DemoAuthValue = {
  isAuthenticated: boolean
  signIn: (email: string, password: string) => Promise<{ ok: boolean; message?: string }>
  signOut: () => void
}

export const DemoAuthContext = createContext<DemoAuthValue | null>(null)
