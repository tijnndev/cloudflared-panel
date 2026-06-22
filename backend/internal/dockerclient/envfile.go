package dockerclient

import (
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

var (
	envSubstPattern  = regexp.MustCompile(`\$\{([^}:]+)(?::-(.*?))?\}`)
	envSimplePattern = regexp.MustCompile(`\$([A-Za-z_][A-Za-z0-9_]*)`)
)

func loadEnvFiles(projectDir string) map[string]string {
	env := make(map[string]string)
	for _, name := range []string{".env", ".env.local"} {
		path := filepath.Join(projectDir, name)
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		mergeEnvFile(env, data)
	}
	return env
}

func mergeEnvFile(env map[string]string, data []byte) {
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if strings.HasPrefix(line, "export ") {
			line = strings.TrimSpace(line[7:])
		}

		key, val, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}

		key = strings.TrimSpace(key)
		if key == "" {
			continue
		}
		env[key] = unquoteEnvValue(strings.TrimSpace(val))
	}
}

func unquoteEnvValue(val string) string {
	if len(val) >= 2 {
		if (val[0] == '"' && val[len(val)-1] == '"') || (val[0] == '\'' && val[len(val)-1] == '\'') {
			return val[1 : len(val)-1]
		}
	}
	return val
}

func resolveEnvString(s string, env map[string]string) string {
	if s == "" || len(env) == 0 {
		return s
	}

	out := envSubstPattern.ReplaceAllStringFunc(s, func(match string) string {
		parts := envSubstPattern.FindStringSubmatch(match)
		if len(parts) < 2 {
			return match
		}
		key := parts[1]
		defaultVal := ""
		if len(parts) > 2 {
			defaultVal = parts[2]
		}
		if v, ok := env[key]; ok && v != "" {
			return v
		}
		return defaultVal
	})

	out = envSimplePattern.ReplaceAllStringFunc(out, func(match string) string {
		parts := envSimplePattern.FindStringSubmatch(match)
		if len(parts) < 2 {
			return match
		}
		if v, ok := env[parts[1]]; ok {
			return v
		}
		return match
	})

	return out
}

func serviceEnvironment(svc composeService) map[string]string {
	env := make(map[string]string)
	if svc.Environment == nil {
		return env
	}

	switch v := svc.Environment.(type) {
	case map[string]interface{}:
		for key, val := range v {
			env[key] = stringifyEnvValue(val)
		}
	case map[interface{}]interface{}:
		for key, val := range v {
			env[stringifyEnvValue(key)] = stringifyEnvValue(val)
		}
	case []interface{}:
		for _, item := range v {
			if s, ok := item.(string); ok {
				if key, val, ok := splitEnvAssignment(s); ok {
					env[key] = val
				}
			}
		}
	case []string:
		for _, s := range v {
			if key, val, ok := splitEnvAssignment(s); ok {
				env[key] = val
			}
		}
	}

	return env
}

func splitEnvAssignment(s string) (string, string, bool) {
	s = strings.TrimSpace(s)
	if s == "" {
		return "", "", false
	}
	key, val, ok := strings.Cut(s, "=")
	if !ok {
		return "", "", false
	}
	return strings.TrimSpace(key), unquoteEnvValue(strings.TrimSpace(val)), true
}

func stringifyEnvValue(v interface{}) string {
	switch x := v.(type) {
	case string:
		return x
	case int:
		return strconv.Itoa(x)
	case int64:
		return strconv.FormatInt(x, 10)
	case float64:
		return strconv.FormatInt(int64(x), 10)
	case bool:
		return strconv.FormatBool(x)
	default:
		return ""
	}
}

func mergeEnv(base map[string]string, overlay map[string]string) map[string]string {
	merged := make(map[string]string, len(base)+len(overlay))
	for k, v := range base {
		merged[k] = v
	}
	for k, v := range overlay {
		merged[k] = v
	}
	return merged
}

func portFromAny(v interface{}, env map[string]string) int {
	switch x := v.(type) {
	case int:
		return x
	case int64:
		return int(x)
	case float64:
		return int(x)
	case string:
		return parsePortMappingWithEnv(x, env)
	case map[string]interface{}:
		if pub, ok := x["published"]; ok {
			return portFromAny(pub, env)
		}
	case map[interface{}]interface{}:
		if pub, ok := x["published"]; ok {
			return portFromAny(pub, env)
		}
	}
	return 0
}

func parsePortMappingWithEnv(s string, env map[string]string) int {
	return parsePortMapping(resolveEnvString(s, env))
}
