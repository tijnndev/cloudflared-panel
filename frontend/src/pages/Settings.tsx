import { FormEvent, useEffect, useState } from 'react'
import { api, Settings as SettingsType } from '../api'

export default function Settings() {
  const [settings, setSettings] = useState<SettingsType>({
    cloudflaredConfigPath: '/etc/cloudflared/config.yml',
    originCertPath: '',
    homeUsers: ['msquad'],
  })
  const [homeUsersText, setHomeUsersText] = useState('msquad')
  const [ignoredPathsText, setIgnoredPathsText] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    api.getSettings()
      .then((s) => {
        setSettings(s)
        setHomeUsersText(s.homeUsers.join('\n'))
        setIgnoredPathsText((s.ignoredPaths ?? []).join('\n'))
      })
      .catch((e) => setError(e.message))
  }, [])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setMessage('')
    const homeUsers = homeUsersText
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    const ignoredPaths = ignoredPathsText
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean)

    try {
      const updated = await api.updateSettings({
        cloudflaredConfigPath: settings.cloudflaredConfigPath,
        originCertPath: settings.originCertPath ?? '',
        homeUsers,
        ignoredPaths,
      })
      setSettings(updated)
      setHomeUsersText(updated.homeUsers.join('\n'))
      setIgnoredPathsText((updated.ignoredPaths ?? []).join('\n'))
      setMessage('Settings saved')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    }
  }

  return (
    <>
      <div className="page-header">
        <h2>Settings</h2>
      </div>

      {error && <div className="error">{error}</div>}
      {message && <div className="success">{message}</div>}

      <form className="card" onSubmit={onSubmit}>
        <div style={{ marginBottom: '1rem' }}>
          <label htmlFor="configPath">Cloudflared config path</label>
          <input
            id="configPath"
            value={settings.cloudflaredConfigPath}
            onChange={(e) => setSettings({ ...settings, cloudflaredConfigPath: e.target.value })}
          />
          <p style={{ color: 'var(--muted)', fontSize: '0.8rem', marginBottom: 0 }}>
            Tunnel name (e.g. ssh-tunnel) is read automatically from this file.
          </p>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label htmlFor="originCertPath">Origin certificate path (cert.pem)</label>
          <input
            id="originCertPath"
            value={settings.originCertPath ?? ''}
            onChange={(e) => setSettings({ ...settings, originCertPath: e.target.value })}
            placeholder="/home/msquad/.cloudflared/cert.pem"
          />
          <p style={{ color: 'var(--muted)', fontSize: '0.8rem', marginBottom: 0 }}>
            Required for Route DNS. Auto-detected from credentials-file directory if left empty.
          </p>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label htmlFor="homeUsers">Home usernames (one per line)</label>
          <textarea
            id="homeUsers"
            value={homeUsersText}
            onChange={(e) => setHomeUsersText(e.target.value)}
            placeholder="msquad"
          />
          <p style={{ color: 'var(--muted)', fontSize: '0.8rem', marginBottom: 0 }}>
            Used for /home/&#123;user&#125; browsing and docker-compose discovery.
          </p>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label htmlFor="ignoredPaths">Ignored folders (one per line)</label>
          <textarea
            id="ignoredPaths"
            value={ignoredPathsText}
            onChange={(e) => setIgnoredPathsText(e.target.value)}
            placeholder="/home/msquad/jetson-containers&#10;jetson-containers"
          />
          <p style={{ color: 'var(--muted)', fontSize: '0.8rem', marginBottom: 0 }}>
            Compose projects inside these paths are excluded from Services and route linking.
            Use a full path or just the folder name.
          </p>
        </div>

        <button type="submit">Save settings</button>
      </form>
    </>
  )
}
