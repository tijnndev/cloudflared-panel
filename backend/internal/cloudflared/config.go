package cloudflared

import (
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"

	"gopkg.in/yaml.v3"
)

type IngressRule struct {
	Hostname string `yaml:"hostname,omitempty" json:"hostname,omitempty"`
	Service  string `yaml:"service" json:"service"`
	Path     string `yaml:"path,omitempty" json:"path,omitempty"`
}

type TunnelConfig struct {
	Tunnel          string        `yaml:"tunnel" json:"tunnel"`
	CredentialsFile string        `yaml:"credentials-file" json:"credentialsFile"`
	OriginCert      string        `yaml:"origincert,omitempty" json:"originCert,omitempty"`
	Ingress         []IngressRule `yaml:"ingress" json:"ingress"`
}

type AuthOptions struct {
	ConfigPath string
	OriginCert string
}

func ResolveAuth(cfg *TunnelConfig, configPath, overrideOriginCert string) AuthOptions {
	opts := AuthOptions{ConfigPath: configPath}

	switch {
	case overrideOriginCert != "":
		opts.OriginCert = overrideOriginCert
	case cfg != nil && cfg.OriginCert != "":
		opts.OriginCert = cfg.OriginCert
	case os.Getenv("TUNNEL_ORIGIN_CERT") != "":
		opts.OriginCert = os.Getenv("TUNNEL_ORIGIN_CERT")
	case cfg != nil && cfg.CredentialsFile != "":
		cert := filepath.Join(filepath.Dir(cfg.CredentialsFile), "cert.pem")
		if fileExists(cert) {
			opts.OriginCert = cert
		}
	}

	return opts
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

type ParsedService struct {
	Scheme string `json:"scheme"`
	Host   string `json:"host"`
	Port   int    `json:"port"`
	Raw    string `json:"raw"`
}

func LoadConfig(path string) (*TunnelConfig, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read config: %w", err)
	}

	var cfg TunnelConfig
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parse config: %w", err)
	}

	return &cfg, nil
}

func SaveConfig(path string, cfg *TunnelConfig) error {
	data, err := yaml.Marshal(cfg)
	if err != nil {
		return fmt.Errorf("marshal config: %w", err)
	}

	header := "# Managed by cloudflared-panel\n"
	return os.WriteFile(path, append([]byte(header), data...), 0o644)
}

func ParseService(raw string) (*ParsedService, error) {
	if strings.HasPrefix(raw, "http_status:") {
		return &ParsedService{Scheme: "http_status", Raw: raw}, nil
	}

	if strings.HasPrefix(raw, "ssh://") {
		host, portStr, _ := strings.Cut(strings.TrimPrefix(raw, "ssh://"), ":")
		port, _ := strconv.Atoi(portStr)
		if port == 0 {
			port = 22
		}
		return &ParsedService{Scheme: "ssh", Host: host, Port: port, Raw: raw}, nil
	}

	u, err := url.Parse(raw)
	if err != nil {
		return nil, err
	}

	port := 0
	if u.Port() != "" {
		port, _ = strconv.Atoi(u.Port())
	} else {
		switch u.Scheme {
		case "http":
			port = 80
		case "https":
			port = 443
		}
	}

	return &ParsedService{
		Scheme: u.Scheme,
		Host:   u.Hostname(),
		Port:   port,
		Raw:    raw,
	}, nil
}

func InsertIngressBeforeCatchAll(rules []IngressRule, rule IngressRule) []IngressRule {
	out := make([]IngressRule, 0, len(rules)+1)
	inserted := false

	for _, r := range rules {
		if !inserted && isCatchAll(r) {
			out = append(out, rule)
			inserted = true
		}
		out = append(out, r)
	}

	if !inserted {
		out = append(out, rule)
	}

	return out
}

func RemoveIngressByHostname(rules []IngressRule, hostname string) []IngressRule {
	out := make([]IngressRule, 0, len(rules))
	for _, r := range rules {
		if r.Hostname != hostname {
			out = append(out, r)
		}
	}
	return out
}

func isCatchAll(rule IngressRule) bool {
	return rule.Hostname == "" && strings.HasPrefix(rule.Service, "http_status:")
}

var hostnameRe = regexp.MustCompile(`^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$`)

func ValidateHostname(hostname string) error {
	if hostname == "" {
		return fmt.Errorf("hostname is required")
	}
	if !hostnameRe.MatchString(strings.ToLower(hostname)) {
		return fmt.Errorf("invalid hostname: %s", hostname)
	}
	return nil
}

func BuildServiceURL(scheme string, port int) string {
	switch scheme {
	case "ssh":
		return fmt.Sprintf("ssh://localhost:%d", port)
	case "https":
		return fmt.Sprintf("https://localhost:%d", port)
	default:
		return fmt.Sprintf("http://localhost:%d", port)
	}
}
