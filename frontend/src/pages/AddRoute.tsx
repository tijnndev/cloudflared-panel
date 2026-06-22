import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, ComposeService, Overview } from '../api'

type SortKey = 'project' | 'service' | 'ports' | 'composeFile'
type SortDir = 'asc' | 'desc'

type ComposeRow = {
  svc: ComposeService
  port: number
}

function compareComposeRows(a: ComposeRow, b: ComposeRow, key: SortKey, dir: SortDir) {
  let cmp = 0
  switch (key) {
    case 'project':
      cmp = a.svc.project.localeCompare(b.svc.project, undefined, { sensitivity: 'base' })
      break
    case 'service':
      cmp = a.svc.name.localeCompare(b.svc.name, undefined, { sensitivity: 'base' })
      break
    case 'ports':
      cmp = a.port - b.port
      break
    case 'composeFile':
      cmp = a.svc.composeFile.localeCompare(b.svc.composeFile, undefined, { sensitivity: 'base' })
      break
  }
  if (cmp === 0) {
    cmp = a.svc.project.localeCompare(b.svc.project, undefined, { sensitivity: 'base' })
  }
  if (cmp === 0) {
    cmp = a.svc.name.localeCompare(b.svc.name, undefined, { sensitivity: 'base' })
  }
  if (cmp === 0) {
    cmp = a.port - b.port
  }
  return dir === 'asc' ? cmp : -cmp
}

function SortHeader({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
}: {
  label: string
  sortKey: SortKey
  activeKey: SortKey
  dir: SortDir
  onSort: (key: SortKey) => void
}) {
  const active = activeKey === sortKey
  return (
    <th
      className={`sortable${active ? ' sort-active' : ''}`}
      onClick={() => onSort(sortKey)}
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      {label}
      <span className="sort-indicator">{active ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}</span>
    </th>
  )
}

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
  const [sortKey, setSortKey] = useState<SortKey>('project')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

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

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDir(key === 'project' || key === 'service' || key === 'composeFile' ? 'asc' : 'desc')
  }

  const composeRows = useMemo(() => {
    const rows: ComposeRow[] = []
    for (const svc of compose) {
      const ports = svc.hostPorts ?? []
      if (ports.length === 0) {
        rows.push({ svc, port: 0 })
      } else {
        for (const port of ports) {
          rows.push({ svc, port })
        }
      }
    }
    return rows.sort((a, b) => compareComposeRows(a, b, sortKey, sortDir))
  }, [compose, sortKey, sortDir])

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
        <div className="card table-wrap" style={{ padding: 0 }}>
          <div style={{ padding: '1rem 1.25rem 0' }}>
            <div className="stat-label" style={{ marginBottom: '0.35rem' }}>
              Discovered compose services
            </div>
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>
              Click a row to fill the form above: <strong>local port</strong> from the Ports column,
              and <strong>hostname</strong> as <span className="mono">{'<service>'}.msquad.cloud</span>{' '}
              (only if hostname is empty). Ports from <span className="mono">.env</span> variables
              (e.g. <span className="mono">${'{PORT}'}</span>, <span className="mono">${'{BACKEND_PORT}'}</span>,{' '}
              <span className="mono">${'{FRONTEND_PORT}'}</span>) are resolved automatically.
            </p>
          </div>
          <table>
            <thead>
              <tr>
                <SortHeader label="Project" sortKey="project" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                <SortHeader label="Service" sortKey="service" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                <SortHeader label="Ports" sortKey="ports" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                <SortHeader label="Compose file" sortKey="composeFile" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
              </tr>
            </thead>
            <tbody>
              {composeRows.map(({ svc, port }) => (
                <tr
                  key={`${svc.composeFile}-${svc.name}-${port}`}
                  className={port ? 'compose-prefill-row' : undefined}
                  onClick={() => port && applyCompose(svc, port)}
                >
                  <td>{svc.project}</td>
                  <td>{svc.name}</td>
                  <td className="mono">{port || '—'}</td>
                  <td className="mono" style={{ fontSize: '0.75rem' }}>{svc.composeFile}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
