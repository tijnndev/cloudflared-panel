import { NavLink, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth'
import Dashboard from './pages/Dashboard'
import AddRoute from './pages/AddRoute'
import Browser from './pages/Browser'
import Settings from './pages/Settings'
import Services from './pages/Services'
import Login from './pages/Login'

function AppShell() {
  const { logout, authRequired } = useAuth()

  return (
    <div className="layout">
      <aside className="sidebar">
        <h1>Cloudflared Panel</h1>
        <div className="subtitle">Tunnel & Docker manager</div>
        <nav>
          <NavLink to="/" end className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            Overview
          </NavLink>
          <NavLink to="/services" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            Services
          </NavLink>
          <NavLink to="/add" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            Add Route
          </NavLink>
          <NavLink to="/browse" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            Home Browser
          </NavLink>
          <NavLink to="/settings" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            Settings
          </NavLink>
        </nav>
        {authRequired && (
          <button className="logout-btn secondary" onClick={logout}>
            Sign out
          </button>
        )}
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/services" element={<Services />} />
          <Route path="/add" element={<AddRoute />} />
          <Route path="/browse" element={<Browser />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  const { authenticated, loading } = useAuth()

  if (loading) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <p className="login-subtitle" style={{ margin: 0 }}>Loading…</p>
        </div>
      </div>
    )
  }

  if (!authenticated) {
    return <Login />
  }

  return <AppShell />
}
