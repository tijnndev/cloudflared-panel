//go:build !linux

package dockerclient

import (
	"os"
	"time"
)

func fileTimes(_ string, info os.FileInfo) (modified, created time.Time) {
	modified = info.ModTime()
	return modified, modified
}
