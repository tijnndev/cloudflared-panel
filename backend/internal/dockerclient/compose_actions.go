package dockerclient

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type MatchedRoute struct {
	Hostname string `json:"hostname"`
	Port     int    `json:"port"`
	Service  string `json:"service"`
}

type ComposeProject struct {
	Project        string           `json:"project"`
	ComposeFile    string           `json:"composeFile"`
	ProjectDir     string           `json:"projectDir"`
	Services       []ComposeService `json:"services"`
	HostPorts      []int            `json:"hostPorts"`
	MatchedRoutes  []MatchedRoute   `json:"matchedRoutes"`
	Running        bool             `json:"running"`
	ContainerCount int              `json:"containerCount"`
	RunningCount   int              `json:"runningCount"`
}

type RoutePort struct {
	Hostname string
	Port     int
	Service  string
}

func GroupComposeProjects(services []ComposeService, routes []RoutePort, containers []ContainerStatus) []ComposeProject {
	byFile := make(map[string]*ComposeProject)

	for _, svc := range services {
		p, ok := byFile[svc.ComposeFile]
		if !ok {
			p = &ComposeProject{
				Project:     svc.Project,
				ComposeFile: svc.ComposeFile,
				ProjectDir:  filepath.Dir(svc.ComposeFile),
				Services:    []ComposeService{},
				HostPorts:   []int{},
			}
			byFile[svc.ComposeFile] = p
		}
		p.Services = append(p.Services, svc)
		for _, port := range svc.HostPorts {
			p.HostPorts = appendUniqueInt(p.HostPorts, port)
		}
	}

	for _, p := range byFile {
		for _, route := range routes {
			if route.Port > 0 && containsInt(p.HostPorts, route.Port) {
				p.MatchedRoutes = append(p.MatchedRoutes, MatchedRoute{
					Hostname: route.Hostname,
					Port:     route.Port,
					Service:  route.Service,
				})
			}
		}
		if p.MatchedRoutes == nil {
			p.MatchedRoutes = []MatchedRoute{}
		}

		running, total := countContainersForCompose(containers, p.ComposeFile, p.Project)
		p.ContainerCount = total
		p.RunningCount = running
		p.Running = total > 0 && running > 0
	}

	out := make([]ComposeProject, 0, len(byFile))
	for _, p := range byFile {
		sort.Slice(p.Services, func(i, j int) bool {
			return p.Services[i].Name < p.Services[j].Name
		})
		sort.Ints(p.HostPorts)
		sort.Slice(p.MatchedRoutes, func(i, j int) bool {
			return p.MatchedRoutes[i].Hostname < p.MatchedRoutes[j].Hostname
		})
		out = append(out, *p)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].Project != out[j].Project {
			return out[i].Project < out[j].Project
		}
		return out[i].ComposeFile < out[j].ComposeFile
	})
	return out
}

func countContainersForCompose(containers []ContainerStatus, composeFile, project string) (running, total int) {
	normalized := filepath.Clean(composeFile)
	for _, ctr := range containers {
		if !containerBelongsToCompose(ctr, normalized, project) {
			continue
		}
		total++
		if ctr.State == "running" {
			running++
		}
	}
	return running, total
}

func containerBelongsToCompose(ctr ContainerStatus, composeFile, project string) bool {
	if ctr.ConfigFiles != "" {
		for _, f := range strings.Split(ctr.ConfigFiles, ",") {
			if filepath.Clean(strings.TrimSpace(f)) == composeFile {
				return true
			}
		}
	}
	if project != "" && ctr.Project == project {
		return true
	}
	return false
}

func RunComposeAction(ctx context.Context, composeFile, action string) (string, error) {
	if _, err := os.Stat(composeFile); err != nil {
		return "", fmt.Errorf("compose file not found: %w", err)
	}

	projectDir := filepath.Dir(composeFile)
	var args []string

	switch action {
	case "start":
		args = []string{"compose", "-f", composeFile, "up", "-d"}
	case "stop":
		args = []string{"compose", "-f", composeFile, "down"}
	case "restart":
		args = []string{"compose", "-f", composeFile, "restart"}
	default:
		return "", fmt.Errorf("unknown action %q (use start, stop, or restart)", action)
	}

	ctx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()

	cmd := exec.CommandContext(ctx, "docker", args...)
	cmd.Dir = projectDir
	out, err := cmd.CombinedOutput()
	output := strings.TrimSpace(string(out))
	if err != nil {
		if output != "" {
			return output, fmt.Errorf("%w: %s", err, output)
		}
		return "", err
	}
	return output, nil
}

func appendUniqueInt(slice []int, values ...int) []int {
	for _, v := range values {
		if !containsInt(slice, v) {
			slice = append(slice, v)
		}
	}
	return slice
}

func containsInt(slice []int, val int) bool {
	for _, v := range slice {
		if v == val {
			return true
		}
	}
	return false
}

