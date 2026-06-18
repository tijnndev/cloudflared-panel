package dockerclient

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/client"
	"gopkg.in/yaml.v3"
)

type ContainerStatus struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Image   string `json:"image"`
	State   string `json:"state"`
	Status  string `json:"status"`
	Ports   []Port `json:"ports"`
	Project string `json:"project,omitempty"`
	Service string `json:"service,omitempty"`
}

type Port struct {
	HostPort      int    `json:"hostPort"`
	ContainerPort int    `json:"containerPort"`
	Protocol      string `json:"protocol"`
}

type ComposeService struct {
	Name         string `json:"name"`
	Project      string `json:"project"`
	ComposeFile  string `json:"composeFile"`
	HostPorts    []int  `json:"hostPorts"`
	ContainerName string `json:"containerName,omitempty"`
}

type Client struct {
	cli *client.Client
}

func New() (*Client, error) {
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return nil, err
	}
	return &Client{cli: cli}, nil
}

func (c *Client) Close() error {
	return c.cli.Close()
}

func (c *Client) ListContainers(ctx context.Context) ([]ContainerStatus, error) {
	containers, err := c.cli.ContainerList(ctx, container.ListOptions{All: true})
	if err != nil {
		return nil, err
	}

	out := make([]ContainerStatus, 0, len(containers))
	for _, ctr := range containers {
		name := strings.TrimPrefix(ctr.Names[0], "/")
		ports := make([]Port, 0, len(ctr.Ports))
		for _, p := range ctr.Ports {
			hostPort := int(p.PublicPort)
			ports = append(ports, Port{
				HostPort:      hostPort,
				ContainerPort: int(p.PrivatePort),
				Protocol:      p.Type,
			})
		}

		project := ctr.Labels["com.docker.compose.project"]
		service := ctr.Labels["com.docker.compose.service"]

		out = append(out, ContainerStatus{
			ID:      ctr.ID[:12],
			Name:    name,
			Image:   ctr.Image,
			State:   ctr.State,
			Status:  ctr.Status,
			Ports:   ports,
			Project: project,
			Service: service,
		})
	}

	return out, nil
}

func (c *Client) FindByHostPort(containers []ContainerStatus, port int) *ContainerStatus {
	for i := range containers {
		for _, p := range containers[i].Ports {
			if p.HostPort == port {
				return &containers[i]
			}
		}
	}
	return nil
}

func ScanComposeProjects(homeUsers []string) ([]ComposeService, error) {
	var services []ComposeService

	for _, user := range homeUsers {
		home := filepath.Join("/home", user)
		if _, err := os.Stat(home); err != nil {
			continue
		}

		_ = filepath.WalkDir(home, func(path string, d os.DirEntry, err error) error {
			if err != nil {
				return nil
			}
			if d.IsDir() {
				base := filepath.Base(path)
				if base == "node_modules" || base == ".git" || strings.HasPrefix(base, ".") && base != "." {
					if base != "." && base != ".." && strings.HasPrefix(base, ".") {
						return filepath.SkipDir
					}
				}
				return nil
			}

			name := d.Name()
			if name != "docker-compose.yml" && name != "docker-compose.yaml" && name != "compose.yml" && name != "compose.yaml" {
				return nil
			}

			projectDir := filepath.Dir(path)
			projectName := filepath.Base(projectDir)
			parsed, err := parseComposeFile(path)
			if err != nil {
				return nil
			}

			for svcName, svc := range parsed {
				hostPorts := extractHostPorts(svc)
				if hostPorts == nil {
					hostPorts = []int{}
				}
				services = append(services, ComposeService{
					Name:        svcName,
					Project:     projectName,
					ComposeFile: path,
					HostPorts:   hostPorts,
				})
			}

			return nil
		})
	}

	return services, nil
}

type composeFile struct {
	Services map[string]composeService `yaml:"services"`
}

type composeService struct {
	Ports       []any  `yaml:"ports"`
	ContainerName string `yaml:"container_name"`
}

func parseComposeFile(path string) (map[string]composeService, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var cf composeFile
	if err := yaml.Unmarshal(data, &cf); err != nil {
		return nil, err
	}

	if cf.Services == nil {
		return map[string]composeService{}, nil
	}
	return cf.Services, nil
}

func extractHostPorts(svc composeService) []int {
	var ports []int
	for _, p := range svc.Ports {
		switch v := p.(type) {
		case int:
			ports = append(ports, v)
		case string:
			hostPort := parsePortMapping(v)
			if hostPort > 0 {
				ports = append(ports, hostPort)
			}
		}
	}
	return ports
}

func parsePortMapping(s string) int {
	parts := strings.Split(s, ":")
	if len(parts) == 0 {
		return 0
	}
	hostPart := parts[0]
	if len(parts) >= 2 {
		hostPart = parts[0]
	}
	hostPart = strings.Split(hostPart, "/")[0]
	port, _ := strconv.Atoi(hostPart)
	return port
}

func MatchComposeService(services []ComposeService, port int) *ComposeService {
	for i := range services {
		for _, p := range services[i].HostPorts {
			if p == port {
				return &services[i]
			}
		}
	}
	return nil
}

func ListHomeDir(basePath string) ([]FileEntry, error) {
	entries, err := os.ReadDir(basePath)
	if err != nil {
		return nil, fmt.Errorf("read dir: %w", err)
	}

	out := make([]FileEntry, 0, len(entries))
	for _, e := range entries {
		info, err := e.Info()
		if err != nil {
			continue
		}
		out = append(out, FileEntry{
			Name:    e.Name(),
			Path:    filepath.Join(basePath, e.Name()),
			IsDir:   e.IsDir(),
			Size:    info.Size(),
			ModTime: info.ModTime(),
		})
	}
	return out, nil
}

type FileEntry struct {
	Name    string `json:"name"`
	Path    string `json:"path"`
	IsDir   bool   `json:"isDir"`
	Size    int64  `json:"size"`
	ModTime any    `json:"modTime"`
}
