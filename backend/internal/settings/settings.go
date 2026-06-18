package settings

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
)

type Settings struct {
	CloudflaredConfigPath string   `json:"cloudflaredConfigPath"`
	OriginCertPath        string   `json:"originCertPath"`
	HomeUsers             []string `json:"homeUsers"`
	DataDir               string   `json:"-"`
}

type Store struct {
	mu       sync.RWMutex
	settings Settings
	path     string
}

func NewStore(dataDir string) *Store {
	return &Store{
		settings: Settings{
			CloudflaredConfigPath: "/etc/cloudflared/config.yml",
			HomeUsers:             []string{"msquad"},
			DataDir:               dataDir,
		},
		path: filepath.Join(dataDir, "settings.json"),
	}
}

func (s *Store) Load() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := os.MkdirAll(s.settings.DataDir, 0o755); err != nil {
		return err
	}

	data, err := os.ReadFile(s.path)
	if err != nil {
		if os.IsNotExist(err) {
			return s.saveLocked()
		}
		return err
	}

	return json.Unmarshal(data, &s.settings)
}

func (s *Store) Get() Settings {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.settings
}

func (s *Store) Update(in Settings) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if in.CloudflaredConfigPath != "" {
		s.settings.CloudflaredConfigPath = in.CloudflaredConfigPath
	}
	s.settings.OriginCertPath = in.OriginCertPath
	if in.HomeUsers != nil {
		s.settings.HomeUsers = in.HomeUsers
	}

	return s.saveLocked()
}

func (s *Store) saveLocked() error {
	data, err := json.MarshalIndent(s.settings, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.path, data, 0o644)
}
