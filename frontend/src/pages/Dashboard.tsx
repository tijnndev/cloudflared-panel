import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, Overview, RouteStatus, TunnelDetails } from '../api'
import { DashboardSkeleton } from '../components/DashboardSkeleton'

type SortKey = 'hostname' | 'service' | 'status' | 'docker' | 'compose'
type SortDir = 'asc' | 'desc'

function dockerLabel(route: RouteStatus) {
  if (route.container) return route.container.name
  if (route.port) return `No container on :${route.port}`
  return ''
}

function composeLabel(route: RouteStatus) {
  if (!route.compose) return ''
  return `${route.compose.project}/${route.compose.name}`
}

function compareRoutes(a: RouteStatus, b: RouteStatus, key: SortKey, dir: SortDir) {
  if (a.isCatchAll !== b.isCatchAll) {
    return a.isCatchAll ? 1 : -1
  }

  let cmp = 0
  switch (key) {
    case 'hostname':
      cmp = a.hostname.localeCompare(b.hostname, undefined, { sensitivity: 'base' })
      break
    case 'service':
      cmp = a.service.localeCompare(b.service, undefined, { sensitivity: 'base' })
      break
    case 'status':
      cmp = Number(a.serviceUp) - Number(b.serviceUp)
      break
    case 'docker':
      cmp = dockerLabel(a).localeCompare(dockerLabel(b), undefined, { sensitivity: 'base' })
      break
    case 'compose':
      cmp = composeLabel(a).localeCompare(composeLabel(b), undefined, { sensitivity: 'base' })
      break
  }
  if (cmp === 0) {
    cmp = a.hostname.localeCompare(b.hostname, undefined, { sensitivity: 'base' })
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

function StatusBadge({ up, label }: { up: boolean; label?: string }) {
  return (
    <span className={`badge ${up ? 'running' : 'stopped'}`}>
      {label ?? (up ? 'Up' : 'Down')}
    </span>
  )
}

function RouteRow({
  route,
  onRefresh,
}: {
  route: RouteStatus
  onRefresh: () => void
}) {
  const [busy, setBusy] = useState(false)

  if (route.isCatchAll) {
    return (
      <tr>
        <td colSpan={6} className="mono" style={{ color: 'var(--muted)' }}>
          Catch-all: {route.service}
        </td>
      </tr>
    )
  }

  async function handleDns() {
    setBusy(true)
    try {
      await api.routeDns(route.hostname)
      onRefresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'DNS routing failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!confirm(`Remove ${route.hostname} from config?`)) return
    setBusy(true)
    try {
      await api.deleteRoute(route.hostname)
      onRefresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <tr>
      <td className="mono">{route.hostname}</td>
      <td className="mono">{route.service}</td>
      <td>
        <StatusBadge up={route.serviceUp} />
      </td>
      <td>
        {route.container ? (
          <span title={route.container.status}>
            {route.container.name}{' '}
            <span className={`badge ${route.container.state === 'running' ? 'running' : 'stopped'}`}>
              {route.container.state}
            </span>
          </span>
        ) : route.port ? (
          <span className="badge unknown">No container on :{route.port}</span>
        ) : (
          '—'
        )}
      </td>
      <td>
        {route.compose ? (
          <span className="mono" title={route.compose.composeFile}>
            {route.compose.project}/{route.compose.name}
          </span>
        ) : (
          '—'
        )}
      </td>
      <td>
        <div className="actions actions-inline">
          <button className="secondary" disabled={busy} onClick={handleDns}>
            Route DNS
          </button>
          <button className="danger" disabled={busy} onClick={handleDelete}>
            Remove
          </button>
        </div>
      </td>
    </tr>
  )
}

export default function Dashboard() {
  const [data, setData] = useState<Overview | null>(null)
  const [tunnelDetails, setTunnelDetails] = useState<TunnelDetails | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [detailsLoading, setDetailsLoading] = useState(false)
  const [error, setError] = useState('')
  const [reloading, setReloading] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('hostname')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const loadDetails = useCallback(async () => {
    setDetailsLoading(true)
    try {
      setTunnelDetails(await api.tunnelDetails())
    } catch {
      setTunnelDetails(null)
    } finally {
      setDetailsLoading(false)
    }
  }, [])

  const load = useCallback(async (silent = false) => {
    if (silent) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }
    try {
      setError('')
      setData(await api.overview())
      void loadDetails()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load overview')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [loadDetails])

  useEffect(() => {
    load()
    const id = setInterval(() => load(true), 15000)
    return () => clearInterval(id)
  }, [load])

  async function reloadCloudflared() {
    setReloading(true)
    try {
      const res = await api.reloadCloudflared()
      alert(JSON.stringify(res, null, 2))
      load(true)
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Reload failed')
    } finally {
      setReloading(false)
    }
  }

  const routes = data?.routes.filter((r) => !r.isCatchAll) ?? []
  const upCount = routes.filter((r) => r.serviceUp).length

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDir(key === 'hostname' || key === 'service' || key === 'docker' || key === 'compose' ? 'asc' : 'desc')
  }

  const sortedRoutes = useMemo(() => {
    if (!data?.routes) return []
    return [...data.routes].sort((a, b) => compareRoutes(a, b, sortKey, sortDir))
  }, [data?.routes, sortKey, sortDir])

  return (
    <>
      <div className="page-header">
        <h2>Tunnel Overview</h2>
        <div className="actions">
          <button disabled={reloading || loading} onClick={reloadCloudflared}>
            Reload cloudflared
          </button>
        </div>
      </div>

      {error && <div className="error">{error}</div>}

      {loading && !data && <DashboardSkeleton />}

      {data && (
        <>
          <div className={`card-grid${refreshing ? ' refreshing' : ''}`}>
            <div className="card">
              <div className="stat-label">Tunnel</div>
              <div className="stat-value mono">{data.tunnel || '—'}</div>
            </div>
            <div className="card">
              <div className="stat-label">cloudflared process</div>
              <div className="stat-value">
                <StatusBadge up={data.cloudflaredRunning} label={data.cloudflaredRunning ? 'Running' : 'Stopped'} />
              </div>
            </div>
            <div className="card">
              <div className="stat-label">Routes</div>
              <div className="stat-value">{routes.length}</div>
            </div>
            <div className="card">
              <div className="stat-label">Services up</div>
              <div className="stat-value">{upCount} / {routes.length}</div>
            </div>
          </div>

          <div className="card">
            <div className="stat-label">Config</div>
            <div className="mono">{data.configPath}</div>
            {data.credentialsFile && (
              <div className="mono" style={{ marginTop: '0.5rem', color: 'var(--muted)' }}>
                {data.credentialsFile}
              </div>
            )}
            {data.originCert && (
              <div className="mono" style={{ marginTop: '0.5rem', color: 'var(--muted)' }}>
                Origin cert: {data.originCert}
              </div>
            )}
          </div>

          <div className="card table-wrap" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr>
                  <SortHeader label="Hostname" sortKey="hostname" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortHeader label="Service" sortKey="service" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortHeader label="Status" sortKey="status" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortHeader label="Docker" sortKey="docker" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortHeader label="Compose" sortKey="compose" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedRoutes.map((route, i) => (
                  <RouteRow key={route.hostname || `catch-${i}`} route={route} onRefresh={() => load(true)} />
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <div className="stat-label">Tunnel info</div>
            {detailsLoading && !tunnelDetails?.tunnelInfo && (
              <div className="skeleton skeleton-block" />
            )}
            {tunnelDetails?.tunnelInfo && (
              <pre className="mono" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{tunnelDetails.tunnelInfo}</pre>
            )}
            {!detailsLoading && !tunnelDetails?.tunnelInfo && (
              <p style={{ color: 'var(--muted)', margin: 0 }}>Tunnel details unavailable.</p>
            )}
          </div>
        </>
      )}
    </>
  )
}
