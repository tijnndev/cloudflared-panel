import { useCallback, useEffect, useState } from 'react'
import { api, ComposeProject } from '../api'

function ProjectRow({ project, onRefresh }: { project: ComposeProject; onRefresh: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)

  async function runAction(action: 'start' | 'stop' | 'restart') {
    const label = action.charAt(0).toUpperCase() + action.slice(1)
    if (action === 'stop' && !confirm(`Stop all containers for ${project.project}?`)) return
    setBusy(action)
    try {
      const res = await api.composeAction(project.composeFile, action)
      if (res.output) {
        console.info(res.output)
      }
      onRefresh()
    } catch (e) {
      alert(e instanceof Error ? e.message : `${label} failed`)
    } finally {
      setBusy(null)
    }
  }

  const statusLabel =
    project.containerCount === 0
      ? 'Not deployed'
      : project.running
        ? `Running (${project.runningCount}/${project.containerCount})`
        : `Stopped (${project.runningCount}/${project.containerCount})`

  return (
    <tr>
      <td className="mono">{project.project}</td>
      <td className="mono" title={project.composeFile}>
        {project.composeFile.replace(/^\/home\/[^/]+\//, '')}
      </td>
      <td>
        {project.hostPorts.length > 0 ? (
          <span className="mono">{project.hostPorts.join(', ')}</span>
        ) : (
          '—'
        )}
      </td>
      <td>
        {project.matchedRoutes.length > 0 ? (
          <div className="route-list">
            {project.matchedRoutes.map((r) => (
              <span key={r.hostname} className="mono" title={r.service}>
                {r.hostname}
              </span>
            ))}
          </div>
        ) : (
          <span className="badge unknown">No tunnel route</span>
        )}
      </td>
      <td>
        <span
          className={`badge ${
            project.containerCount === 0 ? 'unknown' : project.running ? 'running' : 'stopped'
          }`}
        >
          {statusLabel}
        </span>
      </td>
      <td>
        <div className="actions">
          <button disabled={!!busy} onClick={() => runAction('start')}>
            {busy === 'start' ? '…' : 'Start'}
          </button>
          <button className="secondary" disabled={!!busy} onClick={() => runAction('restart')}>
            {busy === 'restart' ? '…' : 'Restart'}
          </button>
          <button className="danger" disabled={!!busy} onClick={() => runAction('stop')}>
            {busy === 'stop' ? '…' : 'Stop'}
          </button>
        </div>
      </td>
    </tr>
  )
}

export default function Services() {
  const [projects, setProjects] = useState<ComposeProject[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true)
    else setLoading(true)
    try {
      setError('')
      setProjects(await api.composeProjects())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load compose projects')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(() => load(true), 15000)
    return () => clearInterval(id)
  }, [load])

  const withRoutes = projects.filter((p) => p.matchedRoutes.length > 0).length

  return (
    <>
      <div className="page-header">
        <h2>Docker Compose Services</h2>
        <div className="actions">
          <button className="secondary" disabled={loading || refreshing} onClick={() => load(true)}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      <p style={{ color: 'var(--muted)', marginTop: 0 }}>
        Scans subfolders under <span className="mono">/home/&lt;user&gt;/</span> for compose files and
        matches published ports to Cloudflare tunnel routes.
      </p>

      {error && <div className="error">{error}</div>}

      {!loading && (
        <div className="card-grid">
          <div className="card">
            <div className="stat-label">Compose projects</div>
            <div className="stat-value">{projects.length}</div>
          </div>
          <div className="card">
            <div className="stat-label">With tunnel routes</div>
            <div className="stat-value">{withRoutes}</div>
          </div>
          <div className="card">
            <div className="stat-label">Running</div>
            <div className="stat-value">{projects.filter((p) => p.running).length}</div>
          </div>
        </div>
      )}

      <div className="card table-wrap">
        {loading ? (
          <p style={{ color: 'var(--muted)', margin: 0 }}>Loading compose projects…</p>
        ) : projects.length === 0 ? (
          <p style={{ color: 'var(--muted)', margin: 0 }}>
            No docker-compose files found under configured home directories.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Project</th>
                <th>Compose file</th>
                <th>Ports</th>
                <th>Tunnel routes</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <ProjectRow
                  key={project.composeFile}
                  project={project}
                  onRefresh={() => load(true)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  )
}
