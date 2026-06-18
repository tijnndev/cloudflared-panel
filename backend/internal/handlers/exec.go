package handlers

import (
	"context"
	"os/exec"
)

func runOSCommand(ctx context.Context, name string, args ...string) error {
	cmd := exec.CommandContext(ctx, name, args...)
	return cmd.Run()
}
