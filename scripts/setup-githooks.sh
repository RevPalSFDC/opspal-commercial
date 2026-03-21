#!/usr/bin/env bash
set -euo pipefail

if ! command -v git >/dev/null 2>&1; then
  exit 0
fi

if ! repo_root="$(git rev-parse --show-toplevel 2>/dev/null)"; then
  exit 0
fi

cd "$repo_root"

desired_path=".githooks"
current_path="$(git config --get core.hooksPath 2>/dev/null || true)"

if [ "$current_path" = "$desired_path" ]; then
  exit 0
fi

if [ ! -d "$desired_path" ]; then
  echo "Expected githooks directory not found: $desired_path" >&2
  exit 1
fi

git config core.hooksPath "$desired_path"

if [ -f "$desired_path/pre-push" ]; then
  chmod +x "$desired_path/pre-push" 2>/dev/null || true
fi

echo "Configured git hooks path: $desired_path"
