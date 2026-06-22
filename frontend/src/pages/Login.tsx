import { FormEvent, useState } from 'react'
import { useAuth } from '../auth'

export default function Login() {
  const { login } = useAuth()
  const [apiKey, setApiKey] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!apiKey.trim()) {
      setError('Enter your API key')
      return
    }
    setBusy(true)
    setError('')
    try {
      await login(apiKey)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={onSubmit}>
        <h1>Cloudflared Panel</h1>
        <p className="login-subtitle">Enter your API key to continue</p>
        {error && <div className="error">{error}</div>}
        <label htmlFor="apiKey">API Key</label>
        <input
          id="apiKey"
          type="password"
          autoComplete="off"
          placeholder="API key from server .env"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          autoFocus
        />
        <button type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
