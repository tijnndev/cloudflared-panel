import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, BrowseResponse, FileEntry } from '../api'

type SortKey = 'name' | 'type' | 'size' | 'modifiedAt' | 'createdAt'
type SortDir = 'asc' | 'desc'

function formatSize(size: number, isDir: boolean) {
  if (isDir) return '—'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

function formatDate(value?: string) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString()
}

function compareEntries(a: FileEntry, b: FileEntry, key: SortKey, dir: SortDir) {
  let cmp = 0
  switch (key) {
    case 'name':
      cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      break
    case 'type':
      cmp = a.type.localeCompare(b.type, undefined, { sensitivity: 'base' })
      break
    case 'size':
      cmp = a.size - b.size
      break
    case 'modifiedAt':
      cmp = new Date(a.modifiedAt ?? 0).getTime() - new Date(b.modifiedAt ?? 0).getTime()
      break
    case 'createdAt':
      cmp = new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime()
      break
  }
  if (cmp === 0) {
    cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
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

export default function Browser() {
  const [users, setUsers] = useState<{ username: string; path: string; exists: boolean }[]>([])
  const [selected, setSelected] = useState('')
  const [browse, setBrowse] = useState<BrowseResponse | null>(null)
  const [error, setError] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  useEffect(() => {
    api.listHomeUsers().then((u) => {
      setUsers(u)
      const first = u.find((x) => x.exists)?.username ?? u[0]?.username ?? ''
      setSelected(first)
    }).catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    if (!selected) return
    loadBrowse(selected)
  }, [selected])

  async function loadBrowse(username: string, subPath?: string) {
    try {
      setError('')
      setBrowse(await api.browseHome(username, subPath))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Browse failed')
    }
  }

  function navigateTo(path: string) {
    if (!selected) return
    const rel = path.replace(`/home/${selected}/`, '').replace(`/home/${selected}`, '')
    loadBrowse(selected, rel || undefined)
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDir(key === 'name' || key === 'type' ? 'asc' : 'desc')
  }

  const entries = browse?.entries ?? []
  const composeFiles = browse?.composeFiles ?? []

  const sortedEntries = useMemo(
    () => [...entries].sort((a, b) => compareEntries(a, b, sortKey, sortDir)),
    [entries, sortKey, sortDir],
  )

  return (
    <>
      <div className="page-header">
        <h2>Home Browser</h2>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="card">
        <label htmlFor="user">Home user</label>
        <select
          id="user"
          value={selected}
          onChange={(e) => {
            setBrowse(null)
            setSelected(e.target.value)
          }}
        >
          {users.map((u) => (
            <option key={u.username} value={u.username}>
              {u.username} ({u.exists ? u.path : 'not found'})
            </option>
          ))}
        </select>
      </div>

      {browse && (
        <>
          <div className="breadcrumb">
            <span onClick={() => loadBrowse(selected)}>/home/{browse.username}</span>
            {browse.path !== `/home/${browse.username}` && (
              <>
                {' / '}
                <span className="mono">{browse.path.replace(`/home/${browse.username}/`, '')}</span>
              </>
            )}
            {browse.parent && (
              <button className="secondary" style={{ marginLeft: 'auto' }} onClick={() => navigateTo(browse.parent)}>
                ↑ Up
              </button>
            )}
          </div>

          {composeFiles.length > 0 && (
            <div className="card">
              <div className="stat-label">Docker Compose in this directory</div>
              {composeFiles.map((f) => (
                <div key={f} className="mono">{f}</div>
              ))}
            </div>
          )}

          <div className="card table-wrap" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr>
                  <SortHeader label="Name" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortHeader label="Type" sortKey="type" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortHeader label="Size" sortKey="size" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortHeader label="Last changed" sortKey="modifiedAt" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortHeader label="Created" sortKey="createdAt" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
                </tr>
              </thead>
              <tbody>
                {sortedEntries.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ color: 'var(--muted)' }}>This directory is empty.</td>
                  </tr>
                ) : (
                  sortedEntries.map((entry) => (
                    <tr
                      key={entry.path}
                      className={entry.isDir ? 'file-row dir-row' : 'file-row'}
                      onClick={() => entry.isDir && navigateTo(entry.path)}
                    >
                      <td>
                        <span className="file-name">
                          {entry.isDir ? '📁' : '📄'} {entry.name}
                        </span>
                      </td>
                      <td>{entry.type}</td>
                      <td className="mono">{formatSize(entry.size, entry.isDir)}</td>
                      <td className="mono">{formatDate(entry.modifiedAt)}</td>
                      <td className="mono">{formatDate(entry.createdAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="card">
            <div className="stat-label">Quick add route from this folder</div>
            <p style={{ color: 'var(--muted)', marginTop: 0 }}>
              Open Add Route to register a hostname and port. Compose projects under this path are scanned automatically on the Add Route page.
            </p>
            <Link to="/add" className="btn" style={{ display: 'inline-block' }}>
              Go to Add Route
            </Link>
          </div>
        </>
      )}
    </>
  )
}
