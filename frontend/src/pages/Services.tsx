import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, ComposeProject } from '../api'

type SortKey = 'project' | 'composeFile' | 'ports' | 'routes' | 'status'
type SortDir = 'asc' | 'desc'

function shortComposePath(path: string) {
  return path.replace(/^\/home\/[^/]+\//, '')
}

function minPort(ports: number[]) {
  if (ports.length === 0) return -1
  return Math.min(...ports)
}

function statusRank(project: ComposeProject) {
  if (project.containerCount === 0) return 0
  if (project.running) return 2
  return 1
}

function statusLabel(project: ComposeProject) {
  if (project.containerCount === 0) return 'Not deployed'
  if (project.running) return `Running (${project.runningCount}/${project.containerCount})`
  return `Stopped (${project.runningCount}/${project.containerCount})`
}

function firstRouteHostname(project: ComposeProject) {
  if (project.matchedRoutes.length === 0) return ''
  return [...project.matchedRoutes].map((r) => r.hostname).sort()[0]
}

function compareProjects(a: ComposeProject, b: ComposeProject, key: SortKey, dir: SortDir) {
  let cmp = 0
  switch (key) {
    case 'project':
      cmp = a.project.localeCompare(b.project, undefined, { sensitivity: 'base' })
      break
    case 'composeFile':
      cmp = a.composeFile.localeCompare(b.composeFile, undefined, { sensitivity: 'base' })
      break
    case 'ports':
      cmp = minPort(a.hostPorts) - minPort(b.hostPorts)
      break
    case 'routes':
      cmp = firstRouteHostname(a).localeCompare(firstRouteHostname(b), undefined, { sensitivity: 'base' })
      break
    case 'status':
      cmp = statusRank(a) - statusRank(b)
      if (cmp === 0) {
        cmp = statusLabel(a).localeCompare(statusLabel(b), undefined, { sensitivity: 'base' })
      }
      break
  }
  if (cmp === 0) {
    cmp = a.project.localeCompare(b.project, undefined, { sensitivity: 'base' })
  }
  if (cmp === 0) {
    cmp = a.composeFile.localeCompare(b.composeFile, undefined, { sensitivity: 'base' })
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

  const label = statusLabel(project)

  return (
    <tr>
      <td className="mono">{project.project}</td>
      <td className="mono" title={project.composeFile}>
        {shortComposePath(project.composeFile)}
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
          className={`badge ${project.containerCount === 0 ? 'unknown' : project.running ? 'running' : 'stopped'
            }`}
        >
          {label}
        </span>
      </td>
      <td>
        <div className="actions actions-inline">
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
  const [error, setError] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('project')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      setError('')
      setProjects(await api.composeProjects())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load compose projects')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(() => load(true), 15000)
    return () => clearInterval(id)
  }, [load])

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDir(key === 'project' || key === 'composeFile' || key === 'routes' ? 'asc' : 'desc')
  }

  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => compareProjects(a, b, sortKey, sortDir)),
    [projects, sortKey, sortDir],
  )

  const withRoutes = projects.filter((p) => p.matchedRoutes.length > 0).length

  return (
    <>
      <div className="page-header">
        <h2>Docker Compose Services</h2>
        <div className="actions">
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

      <div className="card table-wrap" style={{ padding: 0 }}>
        {loading ? (
          <p style={{ color: 'var(--muted)', margin: '1rem 1.25rem' }}>Loading compose projects…</p>
        ) : projects.length === 0 ? (
          <p style={{ color: 'var(--muted)', margin: '1rem 1.25rem' }}>
            No docker-compose files found under configured home directories.
          </p>
        ) : (
          <table>
            <thead>
              <tr>
                <SortHeader label="Project" sortKey="project" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                <SortHeader label="Compose file" sortKey="composeFile" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                <SortHeader label="Ports" sortKey="ports" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                <SortHeader label="Tunnel routes" sortKey="routes" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                <SortHeader label="Status" sortKey="status" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedProjects.map((project) => (
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
