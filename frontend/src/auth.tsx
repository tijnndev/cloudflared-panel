import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react'
import { api, clearStoredApiKey, getStoredApiKey, onUnauthorized, setStoredApiKey } from './api'

interface AuthContextValue {
  authenticated: boolean
  authRequired: boolean
  loading: boolean
  login: (apiKey: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false)
  const [authRequired, setAuthRequired] = useState(true)
  const [loading, setLoading] = useState(true)

  const logout = useCallback(() => {
    clearStoredApiKey()
    setAuthenticated(false)
  }, [])

  const verifyStoredKey = useCallback(async () => {
    const status = await api.authStatus()
    setAuthRequired(status.authRequired)

    if (!status.authRequired) {
      setAuthenticated(true)
      return
    }

    const stored = getStoredApiKey()
    if (!stored) {
      setAuthenticated(false)
      return
    }

    await api.overview()
    setAuthenticated(true)
  }, [])

  useEffect(() => {
    verifyStoredKey()
      .catch(() => {
        clearStoredApiKey()
        setAuthenticated(false)
      })
      .finally(() => setLoading(false))
  }, [verifyStoredKey])

  useEffect(() => onUnauthorized(logout), [logout])

  async function login(apiKey: string) {
    setStoredApiKey(apiKey.trim())
    try {
      await api.overview()
      setAuthenticated(true)
    } catch (e) {
      clearStoredApiKey()
      throw e
    }
  }

  return (
    <AuthContext.Provider value={{ authenticated, authRequired, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
