//go:build linux

package dockerclient

import (
	"os"
	"syscall"
	"time"

	"golang.org/x/sys/unix"
)

func fileTimes(path string, info os.FileInfo) (modified, created time.Time) {
	modified = info.ModTime()
	created = modified

	var st unix.Statx_t
	if err := unix.Statx(unix.AT_FDCWD, path, unix.AT_SYMLINK_NOFOLLOW, unix.STATX_BTIME|unix.STATX_MTIME, &st); err == nil {
		if st.Mask&unix.STATX_MTIME != 0 {
			modified = time.Unix(int64(st.Mtime.Sec), int64(st.Mtime.Nsec))
		}
		if st.Mask&unix.STATX_BTIME != 0 {
			created = time.Unix(int64(st.Btime.Sec), int64(st.Btime.Nsec))
			return modified, created
		}
	}

	if stat, ok := info.Sys().(*syscall.Stat_t); ok {
		modified = time.Unix(stat.Mtim.Sec, stat.Mtim.Nsec)
		created = time.Unix(stat.Ctim.Sec, stat.Ctim.Nsec)
	}

	return modified, created
}
