package cloudflared

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"strings"
	"time"
)

type CLI struct {
	Binary string
}

func NewCLI() *CLI {
	return &CLI{Binary: "cloudflared"}
}

func (c *CLI) RouteDNS(ctx context.Context, auth AuthOptions, tunnel, hostname string) (string, error) {
	return c.run(ctx, auth, "route", "dns", tunnel, hostname)
}

func (c *CLI) TunnelInfo(ctx context.Context, auth AuthOptions, tunnel string) (string, error) {
	return c.run(ctx, auth, "info", tunnel)
}

func (c *CLI) ListTunnels(ctx context.Context, auth AuthOptions) (string, error) {
	return c.run(ctx, auth, "list")
}

func (c *CLI) run(ctx context.Context, auth AuthOptions, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	cmdArgs := buildTunnelArgs(auth, args...)
	cmd := exec.CommandContext(ctx, c.Binary, cmdArgs...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		msg := strings.TrimSpace(stderr.String())
		if msg == "" {
			msg = strings.TrimSpace(stdout.String())
		}
		if auth.OriginCert == "" && strings.Contains(msg, "origin certificate") {
			msg += " — set origin cert path in Settings or TUNNEL_ORIGIN_CERT (usually ~/.cloudflared/cert.pem)"
		}
		return "", fmt.Errorf("%s: %s", err, msg)
	}

	out := strings.TrimSpace(stdout.String())
	if out == "" {
		out = strings.TrimSpace(stderr.String())
	}
	return out, nil
}

func buildTunnelArgs(auth AuthOptions, args ...string) []string {
	cmdArgs := []string{"tunnel"}
	if auth.ConfigPath != "" {
		cmdArgs = append(cmdArgs, "--config", auth.ConfigPath)
	}
	if auth.OriginCert != "" {
		cmdArgs = append(cmdArgs, "--origincert", auth.OriginCert)
	}
	return append(cmdArgs, args...)
}

func (c *CLI) IsRunning(ctx context.Context) bool {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "pgrep", "-x", "cloudflared")
	return cmd.Run() == nil
}
