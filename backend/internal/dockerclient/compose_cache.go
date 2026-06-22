package dockerclient

import (
	"sync"
	"time"
)

const composeCacheTTL = 2 * time.Minute

type composeCache struct {
	mu           sync.RWMutex
	services     []ComposeService
	expiresAt    time.Time
	homeUsers    []string
	ignoredPaths []string
}

var globalComposeCache composeCache

func ScanComposeProjectsCached(homeUsers, ignoredPaths []string) ([]ComposeService, error) {
	globalComposeCache.mu.RLock()
	if time.Now().Before(globalComposeCache.expiresAt) &&
		globalComposeCache.services != nil &&
		stringSlicesEqual(globalComposeCache.homeUsers, homeUsers) &&
		stringSlicesEqual(globalComposeCache.ignoredPaths, ignoredPaths) {
		out := make([]ComposeService, len(globalComposeCache.services))
		copy(out, globalComposeCache.services)
		globalComposeCache.mu.RUnlock()
		return out, nil
	}
	globalComposeCache.mu.RUnlock()

	services, err := ScanComposeProjects(homeUsers, ignoredPaths)
	if err != nil {
		return nil, err
	}
	if services == nil {
		services = []ComposeService{}
	}

	globalComposeCache.mu.Lock()
	globalComposeCache.services = services
	globalComposeCache.homeUsers = append([]string(nil), homeUsers...)
	globalComposeCache.ignoredPaths = append([]string(nil), ignoredPaths...)
	globalComposeCache.expiresAt = time.Now().Add(composeCacheTTL)
	globalComposeCache.mu.Unlock()

	out := make([]ComposeService, len(services))
	copy(out, services)
	return out, nil
}

func InvalidateComposeCache() {
	globalComposeCache.mu.Lock()
	globalComposeCache.services = nil
	globalComposeCache.homeUsers = nil
	globalComposeCache.ignoredPaths = nil
	globalComposeCache.expiresAt = time.Time{}
	globalComposeCache.mu.Unlock()
}

func stringSlicesEqual(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
