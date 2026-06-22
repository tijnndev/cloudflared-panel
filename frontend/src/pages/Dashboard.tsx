import { useCallback, useEffect, useState } from 'react'
import { api, Overview, RouteStatus, TunnelDetails } from '../api'
import { DashboardSkeleton } from '../components/DashboardSkeleton'

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
        <div className="actions">
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

          <div className="card table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Hostname</th>
                  <th>Service</th>
                  <th>Status</th>
                  <th>Docker</th>
                  <th>Compose</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.routes.map((route, i) => (
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
