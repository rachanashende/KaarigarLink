import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { DemoAuthContext } from './demoAuthContext'
import { authenticateDemoWorkshop } from '../services/demoAuthService'

const SESSION_KEY = 'kaarigarlink-demo-workshop-session'

function readDemoSession() {
  try {
    return window.sessionStorage.getItem(SESSION_KEY) === 'active'
  } catch (error) {
    console.error('Could not read the demo session from this browser.', error)
    return false
  }
}

export function DemoAuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(readDemoSession)

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await authenticateDemoWorkshop(email, password)
    if (!result.ok) return result

    try {
      window.sessionStorage.setItem(SESSION_KEY, 'active')
      setIsAuthenticated(true)
      return result
    } catch (error) {
      console.error('Could not save the demo session in this browser.', error)
      return { ok: false, message: 'This browser could not start a session. Please enable session storage and try again.' }
    }
  }, [])

  const signOut = useCallback(() => {
    try {
      window.sessionStorage.removeItem(SESSION_KEY)
    } catch (error) {
      console.error('Could not clear the demo session from this browser.', error)
    }
    setIsAuthenticated(false)
  }, [])

  const value = useMemo(() => ({ isAuthenticated, signIn, signOut }), [isAuthenticated, signIn, signOut])

  return <DemoAuthContext.Provider value={value}>{children}</DemoAuthContext.Provider>
}
