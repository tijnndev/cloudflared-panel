package dockerclient

import (
	"path/filepath"
	"strings"
)

func isIgnoredPath(path string, ignoredPaths []string) bool {
	if len(ignoredPaths) == 0 {
		return false
	}

	clean := filepath.Clean(path)
	for _, ignore := range ignoredPaths {
		ignore = strings.TrimSpace(ignore)
		if ignore == "" {
			continue
		}

		ignoreClean := filepath.Clean(ignore)
		if !filepath.IsAbs(ignoreClean) {
			if filepath.Base(clean) == ignoreClean {
				return true
			}
			continue
		}

		if clean == ignoreClean || strings.HasPrefix(clean, ignoreClean+string(filepath.Separator)) {
			return true
		}
	}
	return false
}
