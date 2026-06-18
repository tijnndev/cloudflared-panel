package dockerclient

import (
	"sync"
	"time"
)

const composeCacheTTL = 2 * time.Minute

type composeCache struct {
	mu        sync.RWMutex
	services  []ComposeService
	expiresAt time.Time
}

var globalComposeCache composeCache

func ScanComposeProjectsCached(homeUsers []string) ([]ComposeService, error) {
	globalComposeCache.mu.RLock()
	if time.Now().Before(globalComposeCache.expiresAt) && globalComposeCache.services != nil {
		out := make([]ComposeService, len(globalComposeCache.services))
		copy(out, globalComposeCache.services)
		globalComposeCache.mu.RUnlock()
		return out, nil
	}
	globalComposeCache.mu.RUnlock()

	services, err := ScanComposeProjects(homeUsers)
	if err != nil {
		return nil, err
	}
	if services == nil {
		services = []ComposeService{}
	}

	globalComposeCache.mu.Lock()
	globalComposeCache.services = services
	globalComposeCache.expiresAt = time.Now().Add(composeCacheTTL)
	globalComposeCache.mu.Unlock()

	out := make([]ComposeService, len(services))
	copy(out, services)
	return out, nil
}

func InvalidateComposeCache() {
	globalComposeCache.mu.Lock()
	globalComposeCache.services = nil
	globalComposeCache.expiresAt = time.Time{}
	globalComposeCache.mu.Unlock()
}
