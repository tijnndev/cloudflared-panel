package dockerclient

import "testing"

func TestResolveEnvString(t *testing.T) {
	env := map[string]string{
		"PORT":           "4024",
		"HOST_PORT":      "8082",
		"OLLAMA_PORT":    "11434",
		"MISSING":        "",
		"WITH_DEFAULT":   "",
	}

	tests := []struct {
		in   string
		want string
	}{
		{"${PORT}", "4024"},
		{"${PORT}:8080", "4024:8080"},
		{"${HOST_PORT}:3000", "8082:3000"},
		{"${MISSING:-5432}", "5432"},
		{"${WITH_DEFAULT:-9000}", "9000"},
		{"$PORT", "4024"},
		{"8080", "8080"},
	}

	for _, tc := range tests {
		got := resolveEnvString(tc.in, env)
		if got != tc.want {
			t.Errorf("resolveEnvString(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}

func TestParsePortMappingWithEnv(t *testing.T) {
	env := map[string]string{"PORT": "4024", "API_PORT": "8086"}

	if got := parsePortMappingWithEnv("${PORT}:8080", env); got != 4024 {
		t.Fatalf("host port = %d, want 4024", got)
	}
	if got := parsePortMappingWithEnv("${API_PORT}", env); got != 8086 {
		t.Fatalf("host port = %d, want 8086", got)
	}
}

func TestExtractHostPortsWithEnv(t *testing.T) {
	projectEnv := map[string]string{"PORT": "4024"}
	svc := composeService{
		Ports: []any{"${PORT}:8080", "3001:3000"},
	}
	ports := extractHostPorts(svc, projectEnv)
	if len(ports) != 2 || ports[0] != 4024 || ports[1] != 3001 {
		t.Fatalf("ports = %v, want [4024 3001]", ports)
	}
}

func TestExtractHostPortsLongSyntax(t *testing.T) {
	projectEnv := map[string]string{"HOST_PORT": "8083"}
	svc := composeService{
		Ports: []any{
			map[string]interface{}{
				"target":    8080,
				"published": "${HOST_PORT}",
			},
		},
	}
	ports := extractHostPorts(svc, projectEnv)
	if len(ports) != 1 || ports[0] != 8083 {
		t.Fatalf("ports = %v, want [8083]", ports)
	}
}

func TestMergeEnvFile(t *testing.T) {
	env := make(map[string]string)
	mergeEnvFile(env, []byte(`
# comment
PORT=4024
export API_PORT="8086"
OLLAMA_PORT='11434'
`))

	if env["PORT"] != "4024" || env["API_PORT"] != "8086" || env["OLLAMA_PORT"] != "11434" {
		t.Fatalf("env = %#v", env)
	}
}

func TestServiceEnvironment(t *testing.T) {
	svc := composeService{
		Environment: []interface{}{
			"PORT=9090",
			"DEBUG=true",
		},
	}
	env := serviceEnvironment(svc)
	if env["PORT"] != "9090" || env["DEBUG"] != "true" {
		t.Fatalf("env = %#v", env)
	}
}
