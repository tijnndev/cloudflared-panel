import { FormEvent, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, ComposeService, Overview } from '../api'

export default function AddRoute() {
  const [search] = useSearchParams()
  const [overview, setOverview] = useState<Overview | null>(null)
  const [compose, setCompose] = useState<ComposeService[]>([])
  const [hostname, setHostname] = useState(search.get('hostname') || '')
  const [port, setPort] = useState(Number(search.get('port') || 8080))
  const [scheme, setScheme] = useState('http')
  const [routeDns, setRouteDns] = useState(true)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.overview().then(setOverview).catch(() => {})
    api.scanCompose().then(setCompose).catch(() => {})
  }, [])

  useEffect(() => {
    const h = search.get('hostname')
    const p = search.get('port')
    if (h) setHostname(h)
    if (p) setPort(Number(p))
  }, [search])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const res = await api.addRoute({ hostname, port, scheme, routeDns })
      setMessage(
        `Route added: ${(res as { service?: string }).service}` +
          ((res as { dnsOutput?: string }).dnsOutput
            ? `\nDNS: ${(res as { dnsOutput: string }).dnsOutput}`
            : ''),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add route')
    } finally {
      setBusy(false)
    }
  }

  function applyCompose(svc: ComposeService, hostPort: number) {
    setPort(hostPort)
    if (!hostname) {
      setHostname(`${svc.name}.msquad.cloud`)
    }
  }

  return (
    <>
      <div className="page-header">
        <h2>Add Tunnel Route</h2>
      </div>

      {overview?.tunnel && (
        <div className="card">
          Auto-detected tunnel: <span className="mono">{overview.tunnel}</span>
          {' — '}
          DNS command:{' '}
          <span className="mono">
            cloudflared tunnel route dns {overview.tunnel} {hostname || '<hostname>'}
          </span>
        </div>
      )}

      {error && <div className="error">{error}</div>}
      {message && <div className="success" style={{ whiteSpace: 'pre-wrap' }}>{message}</div>}

      <form className="card" onSubmit={onSubmit}>
        <div className="form-row">
          <div>
            <label htmlFor="hostname">Hostname</label>
            <input
              id="hostname"
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
              placeholder="app.msquad.cloud"
              required
            />
          </div>
          <div>
            <label htmlFor="port">Local port</label>
            <input
              id="port"
              type="number"
              min={1}
              max={65535}
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
              required
            />
          </div>
          <div>
            <label htmlFor="scheme">Scheme</label>
            <select id="scheme" value={scheme} onChange={(e) => setScheme(e.target.value)}>
              <option value="http">http</option>
              <option value="https">https</option>
              <option value="ssh">ssh</option>
            </select>
          </div>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <input
            type="checkbox"
            checked={routeDns}
            onChange={(e) => setRouteDns(e.target.checked)}
          />
          Run <span className="mono">cloudflared tunnel route dns</span> automatically
        </label>

        <button type="submit" disabled={busy}>
          {busy ? 'Adding…' : 'Add route & update config.yml'}
        </button>
      </form>

      {compose.length > 0 && (
        <div className="card table-wrap">
          <div className="stat-label" style={{ marginBottom: '0.75rem' }}>
            Docker Compose services (click to prefill)
          </div>
          <table>
            <thead>
              <tr>
                <th>Project</th>
                <th>Service</th>
                <th>Ports</th>
                <th>Compose file</th>
              </tr>
            </thead>
            <tbody>
              {compose.flatMap((svc) => {
                const ports = svc.hostPorts ?? []
                return (ports.length ? ports : [0]).map((p) => (
                  <tr
                    key={`${svc.composeFile}-${svc.name}-${p}`}
                    style={{ cursor: p ? 'pointer' : 'default' }}
                    onClick={() => p && applyCompose(svc, p)}
                  >
                    <td>{svc.project}</td>
                    <td>{svc.name}</td>
                    <td className="mono">{p || '—'}</td>
                    <td className="mono" style={{ fontSize: '0.75rem' }}>{svc.composeFile}</td>
                  </tr>
                ))
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
