import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, BrowseResponse } from '../api'

export default function Browser() {
  const [users, setUsers] = useState<{ username: string; path: string; exists: boolean }[]>([])
  const [selected, setSelected] = useState('')
  const [browse, setBrowse] = useState<BrowseResponse | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.listHomeUsers().then((u) => {
      setUsers(u)
      const first = u.find((x) => x.exists)?.username ?? u[0]?.username ?? ''
      setSelected(first)
    }).catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    if (!selected) return
    const rel = browse?.username === selected && browse.path
      ? browse.path.replace(`/home/${selected}`, '').replace(/^\//, '')
      : undefined
    loadBrowse(selected, rel)
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

          {browse.composeFiles.length > 0 && (
            <div className="card">
              <div className="stat-label">Docker Compose in this directory</div>
              {browse.composeFiles.map((f) => (
                <div key={f} className="mono">{f}</div>
              ))}
            </div>
          )}

          <div className="card" style={{ padding: 0 }}>
            <ul className="file-list">
              {browse.entries.map((entry) => (
                <li
                  key={entry.path}
                  className="file-item"
                  onClick={() => entry.isDir && navigateTo(entry.path)}
                >
                  <span>
                    {entry.isDir ? '📁' : '📄'} {entry.name}
                  </span>
                  {!entry.isDir && (
                    <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>
                      {entry.size} bytes
                    </span>
                  )}
                </li>
              ))}
            </ul>
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
