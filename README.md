# Cloudflared Panel

Web panel for managing Cloudflare Tunnel (`cloudflared`) ingress routes with Docker Compose integration.

## Features

- **Tunnel overview** — reads `/etc/cloudflared/config.yml`, auto-detects tunnel name (e.g. `ssh-tunnel`) and lists all ingress routes
- **Docker status** — matches each route's local port to running containers and compose projects under `/home/{user}`
- **Add routes** — updates `config.yml` and optionally runs `cloudflared tunnel route dns <tunnel> <hostname>`
- **Home browser** — navigate `/home/{username}` (configurable users in Settings)
- **Compose discovery** — scans `docker-compose.yml` files under configured home directories

## Quick start (Docker)

On the machine where cloudflared and Docker run:

```bash
cp .env.example .env
docker compose up -d --build
```

Open http://localhost:8090

### Required mounts

| Mount | Purpose |
|-------|---------|
| `/var/run/docker.sock` | Container status |
| `/etc/cloudflared` | Read/write `config.yml` |
| `/home` | Browse user projects & scan compose files |

The container includes the `cloudflared` CLI for DNS routing commands.

## Example config

The panel expects a standard cloudflared config:

```yaml
tunnel: ssh-tunnel
credentials-file: /home/msquad/.cloudflared/6c42b58e-6812-4772-b166-148d97810bd5.json

ingress:
  - hostname: ssh.msquad.cloud
    service: ssh://localhost:22
  - hostname: pe-kennisbank.msquad.cloud
    service: http://localhost:4024
  - service: http_status:404
```

Adding `pe-kennisbank.msquad.cloud` runs:

```bash
cloudflared tunnel route dns ssh-tunnel pe-kennisbank.msquad.cloud
```

## Development

### Backend

```bash
cd backend
go mod tidy
go run .
```

Set env vars for local dev on Linux/WSL:

```bash
export DATA_DIR=./data
export CLOUDFLARED_CONFIG_PATH=/etc/cloudflared/config.yml  # or a test file
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Vite proxies `/api` to `http://localhost:8090`.

## Settings

Configure in the UI (**Settings** page) or edit `/data/settings.json` in the container:

- **Cloudflared config path** — default `/etc/cloudflared/config.yml`
- **Home users** — usernames for `/home/{user}` browsing (default: `msquad`)

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/overview` | Tunnel, routes, docker status |
| POST | `/api/routes` | Add ingress route |
| DELETE | `/api/routes/:hostname` | Remove route from config |
| POST | `/api/routes/dns` | Run `cloudflared tunnel route dns` |
| POST | `/api/cloudflared/reload` | `systemctl reload/restart cloudflared` |
| GET/PUT | `/api/settings` | Panel settings |
| GET | `/api/home/users` | Configured home users |
| GET | `/api/home/:user/browse?path=` | Directory listing |
| GET | `/api/compose/scan` | All compose services under home dirs |

## Security note

This panel executes shell commands and writes tunnel config. Run only on trusted admin hosts and restrict network access to the panel port.

After adding routes, reload cloudflared (button on overview, or `systemctl restart cloudflared` on the host).
