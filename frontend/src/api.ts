export interface RouteStatus {
  hostname: string
  service: string
  scheme: string
  port: number
  isCatchAll: boolean
  serviceUp: boolean
  container?: {
    id: string
    name: string
    image: string
    state: string
    status: string
    project?: string
    service?: string
  }
  compose?: {
    name: string
    project: string
    composeFile: string
    hostPorts: number[]
  }
}

export interface Overview {
  tunnel: string
  credentialsFile: string
  originCert?: string
  configPath: string
  cloudflaredRunning: boolean
  tunnelInfo?: string
  tunnelList?: string
  routes: RouteStatus[]
  containers: unknown[]
  composeServices: ComposeService[]
}

export interface ComposeService {
  name: string
  project: string
  composeFile: string
  hostPorts: number[]
}

export interface Settings {
  cloudflaredConfigPath: string
  originCertPath?: string
  homeUsers: string[]
}

export interface FileEntry {
  name: string
  path: string
  isDir: boolean
  type: string
  size: number
  modifiedAt?: string
  createdAt?: string
}

export interface BrowseResponse {
  username: string
  path: string
  parent: string
  entries: FileEntry[]
  composeFiles: string[]
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.error || res.statusText)
  }
  return data as T
}

export const api = {
  overview: () => request<Overview>('/api/overview'),
  addRoute: (body: { hostname: string; port: number; scheme?: string; routeDns?: boolean }) =>
    request('/api/routes', { method: 'POST', body: JSON.stringify(body) }),
  deleteRoute: (hostname: string) =>
    request(`/api/routes/${encodeURIComponent(hostname)}`, { method: 'DELETE' }),
  routeDns: (hostname: string) =>
    request('/api/routes/dns', { method: 'POST', body: JSON.stringify({ hostname }) }),
  reloadCloudflared: () => request('/api/cloudflared/reload', { method: 'POST' }),
  getSettings: () => request<Settings>('/api/settings'),
  updateSettings: (body: Settings) =>
    request<Settings>('/api/settings', { method: 'PUT', body: JSON.stringify(body) }),
  listHomeUsers: () => request<{ username: string; path: string; exists: boolean }[]>('/api/home/users'),
  browseHome: (username: string, path?: string) =>
    request<BrowseResponse>(`/api/home/${username}/browse${path ? `?path=${encodeURIComponent(path)}` : ''}`),
  scanCompose: () => request<ComposeService[]>('/api/compose/scan'),
}
