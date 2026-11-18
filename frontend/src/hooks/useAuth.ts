import { useContext } from 'react'
import { DemoAuthContext } from '../context/demoAuthContext'

export function useAuth() {
  const context = useContext(DemoAuthContext)
  if (!context) throw new Error('useAuth must be used inside DemoAuthProvider.')
  return context
}
