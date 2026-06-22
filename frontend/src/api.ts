const API_KEY_STORAGE = 'cloudflared-panel-api-key'

export function getStoredApiKey(): string | null {
  return localStorage.getItem(API_KEY_STORAGE)
}

export function setStoredApiKey(key: string) {
  localStorage.setItem(API_KEY_STORAGE, key)
}

export function clearStoredApiKey() {
  localStorage.removeItem(API_KEY_STORAGE)
}

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
  routes: RouteStatus[]
}

export interface TunnelDetails {
  tunnelInfo?: string
  tunnelList?: string
}

export interface ComposeService {
  name: string
  project: string
  composeFile: string
  hostPorts: number[]
}

export interface MatchedRoute {
  hostname: string
  port: number
  service: string
}

export interface ComposeProject {
  project: string
  composeFile: string
  projectDir: string
  services: ComposeService[]
  hostPorts: number[]
  matchedRoutes: MatchedRoute[]
  running: boolean
  containerCount: number
  runningCount: number
}

export interface Settings {
  cloudflaredConfigPath: string
  originCertPath?: string
  homeUsers: string[]
  ignoredPaths?: string[]
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

export interface AuthStatus {
  authRequired: boolean
}

type ApiErrorListener = () => void
const unauthorizedListeners = new Set<ApiErrorListener>()

export function onUnauthorized(listener: ApiErrorListener): () => void {
  unauthorizedListeners.add(listener)
  return () => {
    unauthorizedListeners.delete(listener)
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const key = getStoredApiKey()
  if (key) headers['X-API-Key'] = key

  const res = await fetch(path, {
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
  })
  const data = await res.json().catch(() => ({}))
  if (res.status === 401) {
    clearStoredApiKey()
    unauthorizedListeners.forEach((fn) => fn())
    throw new Error(data.error || 'Invalid API key')
  }
  if (!res.ok) {
    throw new Error(data.error || res.statusText)
  }
  return data as T
}

export const api = {
  authStatus: () => request<AuthStatus>('/api/auth/status'),
  overview: () => request<Overview>('/api/overview'),
  tunnelDetails: () => request<TunnelDetails>('/api/tunnel/details'),
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
  composeProjects: () => request<ComposeProject[]>('/api/compose/projects'),
  composeAction: (composeFile: string, action: 'start' | 'stop' | 'restart') =>
    request<{ message: string; output?: string }>('/api/compose/action', {
      method: 'POST',
      body: JSON.stringify({ composeFile, action }),
    }),
}
