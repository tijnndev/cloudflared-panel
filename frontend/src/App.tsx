import { NavLink, Route, Routes } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import AddRoute from './pages/AddRoute'
import Browser from './pages/Browser'
import Settings from './pages/Settings'

export default function App() {
  return (
    <div className="layout">
      <aside className="sidebar">
        <h1>Cloudflared Panel</h1>
        <div className="subtitle">Tunnel & Docker manager</div>
        <nav>
          <NavLink to="/" end className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            Overview
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
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/add" element={<AddRoute />} />
          <Route path="/browse" element={<Browser />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  )
}
