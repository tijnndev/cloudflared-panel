# Cloudflared Panel — Improvement Ideas

## Security

- **Require API key in production** — refuse to start when `API_KEY` is empty (currently logs a warning and allows unauthenticated access for local dev).
- **HTTPS / reverse proxy** — terminate TLS in front of the panel (Caddy, nginx, or Cloudflare Access) since the API key is sent on every request.
- **Rate limiting** — throttle failed auth attempts on `/api/*` to slow brute-force guessing.
- **Audit log** — record route changes, compose start/stop/restart, and settings updates with timestamp and source IP.

## Docker & Compose

- **Per-service controls** — start/stop individual compose services, not only the whole project (`docker compose up -d <service>`).
- **Compose cache invalidation on file watch** — use `fsnotify` instead of a 2-minute TTL so new projects appear immediately.
- **Project name from compose `name:` field** — directory basename can differ from the actual Docker Compose project name.
- **Logs viewer** — stream `docker compose logs -f` for a selected project in the UI.
- **Health checks** — HTTP probe tunnel routes after start to confirm the service is reachable, not only that the container is running.

## Cloudflared

- **Host-aware process detection** — `pgrep cloudflared` runs inside the panel container; mount host `/proc` or check via systemd on the host for accurate daemon status.
- **Reload feedback** — surface `systemctl` stdout/stderr in the UI instead of a generic alert.
- **Route edit** — change port/scheme for an existing hostname without delete + re-add.
- **Wildcard / path-based ingress** — support `path` rules and catch-all patterns beyond simple hostname → port mapping.

## UX

- **Toast notifications** — replace `alert()` / `confirm()` with inline toasts and modals.
- **Dashboard compose shortcuts** — add Start/Restart/Stop on route rows when a compose file is matched (link to Services page today).
- **Dark/light theme toggle** — optional; current dark theme is fixed.
- **Mobile sidebar** — collapse nav into a hamburger on small screens instead of horizontal scroll only.

## Operations

- **Health endpoint** — unauthenticated `GET /health` for container orchestration probes (separate from API auth).
- **Backup config** — snapshot `config.yml` before each write; offer restore in Settings.
- **Multi-tunnel support** — select which tunnel to manage when multiple are defined on the host.
- **Webhook / notification** — Slack or email when a routed service goes down.

## Code quality

- **Backend tests** — unit tests for `ParseService`, compose port extraction, path traversal guards, and auth middleware.
- **Frontend tests** — smoke tests for login flow and Services page actions.
- **Structured logging** — JSON logs with request IDs for production debugging.
