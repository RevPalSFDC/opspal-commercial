#!/bin/bash
# node-wrapper.sh - Cross-platform Node.js binary discovery
# Mirrors sf-wrapper.sh's resolve_sf_binary() pattern for Node.js.
#
# Desktop GUI apps (Claude Code Desktop on Windows) do not inherit
# ~/.bashrc PATH modifications, so node may not be discoverable via
# `command -v node`. This wrapper provides a multi-location fallback.
#
# Usage:
#   source node-wrapper.sh
#   node_exec scripts/lib/some-script.js arg1 arg2
#
# Environment Variables:
#   NODE_BIN              - Explicit node binary path (skip discovery)
#   NODE_DISABLE_DISCOVERY - Set to 1 to skip candidate scan (fail fast)
#   NVM_DIR               - NVM installation directory
#   NVM_BIN               - NVM-resolved bin directory

# Get script directory
_NODE_WRAPPER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source platform helpers if available (for is_git_bash)
if [ -z "${_PLATFORM_HELPERS_LOADED:-}" ] && [ -f "${_NODE_WRAPPER_DIR}/platform-helpers.sh" ]; then
  source "${_NODE_WRAPPER_DIR}/platform-helpers.sh"
fi

# =============================================================================
# Node.js Binary Resolution
# =============================================================================

##
# Resolve the Node.js binary path.
# Checks multiple locations to handle Desktop GUI contexts where PATH is minimal.
# Outputs: absolute path to node binary
# Returns: 0 on success, 1 if not found
##
resolve_node_binary() {
  local candidates=()

  # 1. Explicit override
  if [ -n "${NODE_BIN:-}" ] && [ -x "${NODE_BIN}" ]; then
    echo "${NODE_BIN}"
    return 0
  fi

  # 2. Already on PATH
  if command -v node >/dev/null 2>&1; then
    command -v node
    return 0
  fi

  if [ "${NODE_DISABLE_DISCOVERY:-0}" = "1" ]; then
    return 1
  fi

  # 3. NVM_BIN env var (may be set even without .bashrc loaded)
  if [ -n "${NVM_BIN:-}" ] && [ -x "${NVM_BIN}/node" ]; then
    candidates+=("${NVM_BIN}/node")
  fi

  # 4. NVM default alias symlink resolution
  local nvm_dir="${NVM_DIR:-$HOME/.nvm}"
  if [ -d "$nvm_dir" ]; then
    local default_link="$nvm_dir/alias/default"
    if [ -L "$default_link" ] || [ -f "$default_link" ]; then
      local default_version
      default_version="$(cat "$default_link" 2>/dev/null || true)"
      if [ -n "$default_version" ] && [ -x "$nvm_dir/versions/node/$default_version/bin/node" ]; then
        candidates+=("$nvm_dir/versions/node/$default_version/bin/node")
      fi
    fi

    # 5. Glob NVM versions — pick highest semver (lexically last)
    local nvm_node
    # shellcheck disable=SC2012
    nvm_node="$(ls -d "$nvm_dir"/versions/node/*/bin/node 2>/dev/null | sort -V | tail -1)"
    if [ -n "$nvm_node" ] && [ -x "$nvm_node" ]; then
      candidates+=("$nvm_node")
    fi
  fi

  # 6. fnm (Fast Node Manager)
  local fnm_dir="${FNM_DIR:-$HOME/.fnm}"
  if [ -d "$fnm_dir" ]; then
    local fnm_node
    # shellcheck disable=SC2012
    fnm_node="$(ls -d "$fnm_dir"/node-versions/*/installation/bin/node 2>/dev/null | sort -V | tail -1)"
    if [ -n "$fnm_node" ] && [ -x "$fnm_node" ]; then
      candidates+=("$fnm_node")
    fi
  fi

  # 7. System locations (Linux / macOS)
  candidates+=(
    "/usr/local/bin/node"
    "/opt/homebrew/bin/node"
    "/usr/bin/node"
    "$HOME/.local/bin/node"
    "$HOME/.npm-global/bin/node"
  )

  # 8. Git Bash / MINGW specific (Windows native Node.js)
  if type is_git_bash &>/dev/null && is_git_bash; then
    candidates+=(
      "/c/Program Files/nodejs/node.exe"
      "${PROGRAMFILES:-/c/Program Files}/nodejs/node.exe"
      "${LOCALAPPDATA:-}/Programs/nodejs/node.exe"
    )
    # Windows NVM for Windows
    if [ -n "${NVM_HOME:-}" ]; then
      local win_nvm_node
      # shellcheck disable=SC2012
      win_nvm_node="$(ls -d "${NVM_HOME}"/v*/node.exe 2>/dev/null | sort -V | tail -1)"
      if [ -n "$win_nvm_node" ] && [ -x "$win_nvm_node" ]; then
        candidates+=("$win_nvm_node")
      fi
    fi
  fi

  # Check candidates in order
  for candidate in "${candidates[@]}"; do
    if [ -n "$candidate" ] && [ -x "$candidate" ]; then
      echo "$candidate"
      return 0
    fi
  done

  return 1
}

##
# Ensure node is on PATH by resolving the binary and prepending its directory.
# Idempotent — safe to call multiple times (caches via NODE_BIN).
# Exports: NODE_BIN (absolute path to node binary)
# Returns: 0 on success, 1 if node not found
##
ensure_node_in_path() {
  # Already resolved
  if [ -n "${NODE_BIN:-}" ] && [ -x "${NODE_BIN}" ]; then
    return 0
  fi

  local resolved
  resolved="$(resolve_node_binary)" || return 1

  export NODE_BIN="$resolved"

  # Prepend node's directory to PATH if not already present
  local node_dir
  node_dir="$(dirname "$resolved")"
  case ":${PATH}:" in
    *":${node_dir}:"*) ;;
    *) export PATH="${node_dir}:${PATH}" ;;
  esac

  return 0
}

##
# Execute node with the resolved binary.
# Equivalent to `node "$@"` but handles environments where node isn't on PATH.
# Args: all arguments passed to node
# Returns: exit code from node
##
node_exec() {
  ensure_node_in_path || {
    echo "node-wrapper: ERROR: Node.js binary not found. Set NODE_BIN or install Node.js." >&2
    return 1
  }
  "${NODE_BIN}" "$@"
}
