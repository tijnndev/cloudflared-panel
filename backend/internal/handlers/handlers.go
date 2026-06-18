package handlers

import (
	"context"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/msquad/cloudflared-panel/internal/cloudflared"
	dockerclient "github.com/msquad/cloudflared-panel/internal/dockerclient"
	"github.com/msquad/cloudflared-panel/internal/settings"
)

type Handler struct {
	settings *settings.Store
	cli      *cloudflared.CLI
	docker   *dockerclient.Client
}

func New(settings *settings.Store, docker *dockerclient.Client) *Handler {
	return &Handler{
		settings: settings,
		cli:      cloudflared.NewCLI(),
		docker:   docker,
	}
}

type RouteStatus struct {
	Hostname      string                        `json:"hostname"`
	Service       string                        `json:"service"`
	Scheme        string                        `json:"scheme"`
	Port          int                           `json:"port"`
	IsCatchAll    bool                          `json:"isCatchAll"`
	Container     *dockerclient.ContainerStatus `json:"container,omitempty"`
	Compose       *dockerclient.ComposeService  `json:"compose,omitempty"`
	ServiceUp     bool                          `json:"serviceUp"`
}

type OverviewResponse struct {
	Tunnel             string        `json:"tunnel"`
	CredentialsFile    string        `json:"credentialsFile"`
	OriginCert         string        `json:"originCert,omitempty"`
	ConfigPath         string        `json:"configPath"`
	CloudflaredRunning bool          `json:"cloudflaredRunning"`
	Routes             []RouteStatus `json:"routes"`
}

type TunnelDetailsResponse struct {
	TunnelInfo string `json:"tunnelInfo,omitempty"`
	TunnelList string `json:"tunnelList,omitempty"`
}

func (h *Handler) tunnelAuth(tunnelCfg *cloudflared.TunnelConfig) cloudflared.AuthOptions {
	cfg := h.settings.Get()
	return cloudflared.ResolveAuth(tunnelCfg, cfg.CloudflaredConfigPath, cfg.OriginCertPath)
}

func (h *Handler) GetOverview(c *gin.Context) {
	ctx := c.Request.Context()
	cfg := h.settings.Get()

	tunnelCfg, err := cloudflared.LoadConfig(cfg.CloudflaredConfigPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var (
		containers []dockerclient.ContainerStatus
		running    bool
		wg         sync.WaitGroup
	)

	if h.docker != nil {
		wg.Add(1)
		go func() {
			defer wg.Done()
			containers, _ = h.docker.ListContainers(ctx)
		}()
	}
	wg.Add(1)
	go func() {
		defer wg.Done()
		running = h.cli.IsRunning(ctx)
	}()
	wg.Wait()

	routes := make([]RouteStatus, 0, len(tunnelCfg.Ingress))
	for _, rule := range tunnelCfg.Ingress {
		parsed, _ := cloudflared.ParseService(rule.Service)
		status := RouteStatus{
			Hostname:   rule.Hostname,
			Service:    rule.Service,
			IsCatchAll: rule.Hostname == "" && strings.HasPrefix(rule.Service, "http_status:"),
		}
		if parsed != nil {
			status.Scheme = parsed.Scheme
			status.Port = parsed.Port

			if parsed.Port > 0 && h.docker != nil {
				if ctr := h.docker.FindByHostPort(containers, parsed.Port); ctr != nil {
					status.Container = ctr
					status.ServiceUp = ctr.State == "running"
					if ctr.Project != "" || ctr.Service != "" {
						status.Compose = &dockerclient.ComposeService{
							Name:    ctr.Service,
							Project: ctr.Project,
						}
					}
				}
			}
			if parsed.Scheme == "ssh" && parsed.Port == 22 {
				status.ServiceUp = true
			}
		}
		routes = append(routes, status)
	}

	if routes == nil {
		routes = []RouteStatus{}
	}

	c.JSON(http.StatusOK, OverviewResponse{
		Tunnel:             tunnelCfg.Tunnel,
		CredentialsFile:    tunnelCfg.CredentialsFile,
		OriginCert:         h.tunnelAuth(tunnelCfg).OriginCert,
		ConfigPath:         cfg.CloudflaredConfigPath,
		CloudflaredRunning: running,
		Routes:             routes,
	})
}

func (h *Handler) GetTunnelDetails(c *gin.Context) {
	ctx := c.Request.Context()
	cfg := h.settings.Get()

	tunnelCfg, err := cloudflared.LoadConfig(cfg.CloudflaredConfigPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	resp := TunnelDetailsResponse{}
	if tunnelCfg.Tunnel == "" {
		c.JSON(http.StatusOK, resp)
		return
	}

	auth := h.tunnelAuth(tunnelCfg)
	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		if info, err := h.cli.TunnelInfo(ctx, auth, tunnelCfg.Tunnel); err == nil {
			resp.TunnelInfo = info
		}
	}()
	go func() {
		defer wg.Done()
		if list, err := h.cli.ListTunnels(ctx, auth); err == nil {
			resp.TunnelList = list
		}
	}()
	wg.Wait()

	c.JSON(http.StatusOK, resp)
}

type AddRouteRequest struct {
	Hostname string `json:"hostname" binding:"required"`
	Scheme   string `json:"scheme"`
	Port     int    `json:"port" binding:"required"`
	RouteDNS bool   `json:"routeDns"`
}

func (h *Handler) AddRoute(c *gin.Context) {
	var req AddRouteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := cloudflared.ValidateHostname(req.Hostname); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	scheme := req.Scheme
	if scheme == "" {
		scheme = "http"
	}

	cfgSettings := h.settings.Get()
	tunnelCfg, err := cloudflared.LoadConfig(cfgSettings.CloudflaredConfigPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	for _, r := range tunnelCfg.Ingress {
		if r.Hostname == req.Hostname {
			c.JSON(http.StatusConflict, gin.H{"error": "hostname already exists in config"})
			return
		}
	}

	service := cloudflared.BuildServiceURL(scheme, req.Port)
	rule := cloudflared.IngressRule{
		Hostname: req.Hostname,
		Service:  service,
	}
	tunnelCfg.Ingress = cloudflared.InsertIngressBeforeCatchAll(tunnelCfg.Ingress, rule)

	if err := cloudflared.SaveConfig(cfgSettings.CloudflaredConfigPath, tunnelCfg); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	var dnsOutput string
	if req.RouteDNS && tunnelCfg.Tunnel != "" {
		dnsOutput, err = h.cli.RouteDNS(c.Request.Context(), h.tunnelAuth(tunnelCfg), tunnelCfg.Tunnel, req.Hostname)
		if err != nil {
			c.JSON(http.StatusOK, gin.H{
				"message": "Route added to config but DNS routing failed",
				"dnsError": err.Error(),
				"service": service,
			})
			return
		}
	}

	c.JSON(http.StatusCreated, gin.H{
		"message":   "Route added",
		"service":   service,
		"dnsOutput": dnsOutput,
	})
}

type RouteDNSRequest struct {
	Hostname string `json:"hostname" binding:"required"`
}

func (h *Handler) RouteDNS(c *gin.Context) {
	var req RouteDNSRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	cfgSettings := h.settings.Get()
	tunnelCfg, err := cloudflared.LoadConfig(cfgSettings.CloudflaredConfigPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	output, err := h.cli.RouteDNS(c.Request.Context(), h.tunnelAuth(tunnelCfg), tunnelCfg.Tunnel, req.Hostname)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"output": output})
}

func (h *Handler) DeleteRoute(c *gin.Context) {
	hostname := c.Param("hostname")
	if hostname == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "hostname required"})
		return
	}

	cfgSettings := h.settings.Get()
	tunnelCfg, err := cloudflared.LoadConfig(cfgSettings.CloudflaredConfigPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	tunnelCfg.Ingress = cloudflared.RemoveIngressByHostname(tunnelCfg.Ingress, hostname)
	if err := cloudflared.SaveConfig(cfgSettings.CloudflaredConfigPath, tunnelCfg); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Route removed from config"})
}

func (h *Handler) GetSettings(c *gin.Context) {
	c.JSON(http.StatusOK, h.settings.Get())
}

func (h *Handler) UpdateSettings(c *gin.Context) {
	var req settings.Settings
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := h.settings.Update(req); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, h.settings.Get())
}

func (h *Handler) ListHomeUsers(c *gin.Context) {
	cfg := h.settings.Get()
	users := make([]gin.H, 0, len(cfg.HomeUsers))
	for _, u := range cfg.HomeUsers {
		home := filepath.Join("/home", u)
		exists := dirExists(home)
		users = append(users, gin.H{"username": u, "path": home, "exists": exists})
	}
	c.JSON(http.StatusOK, users)
}

func (h *Handler) BrowseHome(c *gin.Context) {
	username := c.Param("username")
	subPath := c.Query("path")

	cfg := h.settings.Get()
	if !contains(cfg.HomeUsers, username) {
		c.JSON(http.StatusForbidden, gin.H{"error": "username not allowed"})
		return
	}

	base := filepath.Join("/home", username)
	target := base
	if subPath != "" {
		clean := filepath.Clean(subPath)
		if strings.Contains(clean, "..") {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid path"})
			return
		}
		target = filepath.Join(base, clean)
	}

	if !strings.HasPrefix(target, base) {
		c.JSON(http.StatusForbidden, gin.H{"error": "path outside home directory"})
		return
	}

	entries, err := dockerclient.ListHomeDir(target)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if entries == nil {
		entries = []dockerclient.FileEntry{}
	}

	composeFiles := findComposeFilesInDir(target)
	if composeFiles == nil {
		composeFiles = []string{}
	}

	c.JSON(http.StatusOK, gin.H{
		"username":     username,
		"path":         target,
		"parent":       parentPath(target, base),
		"entries":      entries,
		"composeFiles": composeFiles,
	})
}

func (h *Handler) ScanCompose(c *gin.Context) {
	cfg := h.settings.Get()
	services, err := dockerclient.ScanComposeProjectsCached(cfg.HomeUsers)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, services)
}

func (h *Handler) ReloadCloudflared(c *gin.Context) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), 10*time.Second)
	defer cancel()

	cmds := [][]string{
		{"systemctl", "reload", "cloudflared"},
		{"systemctl", "restart", "cloudflared"},
	}

	var lastErr error
	for _, args := range cmds {
		if err := runCmd(ctx, args[0], args[1:]...); err == nil {
			c.JSON(http.StatusOK, gin.H{"message": "cloudflared reloaded", "command": stringsJoin(args)})
			return
		} else {
			lastErr = err
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "No systemd unit found; restart cloudflared manually if needed",
		"warning": lastErr.Error(),
	})
}

func dirExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

func contains(list []string, item string) bool {
	for _, v := range list {
		if v == item {
			return true
		}
	}
	return false
}

func parentPath(current, base string) string {
	if current == base {
		return ""
	}
	parent := filepath.Dir(current)
	if parent == current || !strings.HasPrefix(parent, base) {
		return ""
	}
	return parent
}

func findComposeFilesInDir(dir string) []string {
	names := []string{"docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"}
	var found []string
	for _, n := range names {
		p := filepath.Join(dir, n)
		if _, err := os.Stat(p); err == nil {
			found = append(found, p)
		}
	}
	return found
}

func runCmd(ctx context.Context, name string, args ...string) error {
	return runOSCommand(ctx, name, args...)
}

func stringsJoin(parts []string) string {
	return strings.Join(parts, " ")
}
