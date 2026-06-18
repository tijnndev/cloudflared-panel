export function DashboardSkeleton() {
  return (
    <>
      <div className="card-grid">
        {Array.from({ length: 4 }).map((_, i) => (
          <div className="card" key={i}>
            <div className="skeleton skeleton-label" />
            <div className="skeleton skeleton-stat" />
          </div>
        ))}
      </div>

      <div className="card">
        <div className="skeleton skeleton-label" />
        <div className="skeleton skeleton-line" />
        <div className="skeleton skeleton-line short" />
      </div>

      <div className="card table-wrap" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              {['Hostname', 'Service', 'Status', 'Docker', 'Compose', 'Actions'].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 8 }).map((_, i) => (
              <tr key={i}>
                <td><div className="skeleton skeleton-cell wide" /></td>
                <td><div className="skeleton skeleton-cell wide" /></td>
                <td><div className="skeleton skeleton-badge" /></td>
                <td><div className="skeleton skeleton-cell" /></td>
                <td><div className="skeleton skeleton-cell" /></td>
                <td><div className="skeleton skeleton-actions" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
