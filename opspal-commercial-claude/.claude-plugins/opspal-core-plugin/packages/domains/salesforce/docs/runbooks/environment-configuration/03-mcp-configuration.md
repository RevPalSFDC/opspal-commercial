# 03 - MCP Server Configuration

## Purpose

Document MCP server configuration best practices to prevent "server failed to start" errors and environment variable issues.

## The Problem

From reflection data: "MCP server failed because API key env var wasn't passed through."

Environment variables defined in config files sometimes don't propagate to MCP servers, causing initialization failures.

## Configuration Scopes

### Scope Priority (Highest to Lowest)

| Scope | Location | Use Case | Committed |
|-------|----------|----------|-----------|
| Project | `.mcp.json` in project root | Shared project tools | Yes |
| Local | `~/.config/claude/mcp.json` | Machine-specific | No |
| User | `~/.claude/mcp.json` | Personal tools | No |

### Recommended Scope by Server Type

| Server Type | Recommended Scope | Rationale |
|-------------|-------------------|-----------|
| Development tools | Project | Team consistency |
| Documentation servers | Project | Shared knowledge |
| Testing frameworks | Project | CI/CD compatibility |
| Personal productivity | User | Individual preference |
| Machine-specific tools | Local | Hardware dependency |

## Configuration Patterns

### Pattern 1: Basic Server Configuration

```json
// .mcp.json
{
  "mcpServers": {
    "salesforce": {
      "command": "npx",
      "args": ["@salesforce/mcp-server"],
      "env": {
        "SF_ORG_ALIAS": "production"
      }
    }
  }
}
```

### Pattern 2: Environment Variable Expansion

```json
// .mcp.json - Using shell environment variables
{
  "mcpServers": {
    "database": {
      "command": "npx",
      "args": ["@myorg/db-server"],
      "env": {
        "DATABASE_URL": "${DATABASE_URL}",
        "API_TOKEN": "${MYAPP_TOKEN}"
      }
    }
  }
}
```

**Important**: The `${VAR}` syntax pulls values from the shell environment, not from the config file. This keeps secrets out of committed files.

### Pattern 3: Docker-Based Server

```json
// .mcp.json
{
  "mcpServers": {
    "postgres": {
      "command": "docker",
      "args": [
        "run", "--rm", "-i",
        "-e", "POSTGRES_PASSWORD=${POSTGRES_PASSWORD}",
        "postgres-mcp-server"
      ]
    }
  }
}
```

### Pattern 4: Conditional Server (Development Only)

```json
// .mcp.json
{
  "mcpServers": {
    "debug-server": {
      "command": "node",
      "args": ["./dev/debug-mcp-server.js"],
      "env": {
        "DEBUG": "true",
        "NODE_ENV": "development"
      },
      "disabled": false
    }
  }
}
```

## Environment Variable Handling

### Required Environment Variables

Create a validation script to check required variables before MCP server startup:

```javascript
// scripts/lib/mcp-env-validator.js
const REQUIRED_ENV = {
  salesforce: ['SF_ORG_ALIAS', 'SF_ACCESS_TOKEN'],
  hubspot: ['HUBSPOT_API_KEY'],
  database: ['DATABASE_URL'],
  supabase: ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY']
};

function validateMcpEnv(serverName) {
  const required = REQUIRED_ENV[serverName] || [];
  const missing = [];

  for (const envVar of required) {
    if (!process.env[envVar]) {
      missing.push(envVar);
    }
  }

  if (missing.length > 0) {
    return {
      valid: false,
      missing,
      message: `Missing environment variables for ${serverName}: ${missing.join(', ')}`
    };
  }

  return { valid: true };
}

module.exports = { validateMcpEnv, REQUIRED_ENV };
```

### Setting Environment Variables

```bash
# Option 1: Export in shell (current session)
export SALESFORCE_ACCESS_TOKEN="your-token-here"

# Option 2: .env file (load with direnv or dotenv)
echo 'SALESFORCE_ACCESS_TOKEN=your-token-here' >> .env

# Option 3: CLI flag (per-command)
claude mcp add salesforce \
  --env SF_ACCESS_TOKEN="${SALESFORCE_ACCESS_TOKEN}" \
  -- npx @salesforce/mcp-server
```

## Security Best Practices

### Never Commit Secrets

```json
// ❌ BAD: Hardcoded secret in .mcp.json
{
  "mcpServers": {
    "api": {
      "env": {
        "API_KEY": "sk-abc123..."
      }
    }
  }
}

// ✅ GOOD: Reference from environment
{
  "mcpServers": {
    "api": {
      "env": {
        "API_KEY": "${API_KEY}"
      }
    }
  }
}
```

### Block Sensitive File Access

```json
// .claude/settings.json
{
  "permissions": {
    "deny": {
      "read": [
        ".env",
        ".env.local",
        ".env.production",
        "secrets/**",
        "**/*.pem",
        "**/*.key"
      ]
    }
  }
}
```

### Use Minimal Permissions

```json
// .mcp.json - Restrict server access
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-filesystem"],
      "env": {
        "ALLOWED_PATHS": "${PWD}/data,${PWD}/output"
      }
    }
  }
}
```

## Troubleshooting

### Server Failed to Start

**Diagnosis**:
```bash
# List configured servers
claude mcp list

# Test specific server
claude mcp get salesforce

# Check server logs
claude mcp logs salesforce
```

**Common Causes**:
1. Missing environment variables
2. Command not found (wrong path or not installed)
3. Permission issues
4. Port conflicts

### Environment Variables Not Passed

**Symptom**: Server starts but authentication fails.

**Diagnosis**:
```javascript
// Add to your MCP server for debugging
console.error('Environment check:', {
  hasApiKey: !!process.env.API_KEY,
  hasOrgAlias: !!process.env.SF_ORG_ALIAS
});
```

**Common Fixes**:
1. Ensure variables are exported (not just set): `export VAR=value`
2. Restart Claude Code after setting env vars
3. Use full variable expansion syntax: `"${VAR}"` not `$VAR`

### Server Works Locally but Fails in CI

**Cause**: Different environment variable loading.

**Fix**:
```yaml
# GitHub Actions example
jobs:
  test:
    env:
      API_KEY: ${{ secrets.API_KEY }}
      SF_ORG_ALIAS: ci-sandbox

    steps:
      - name: Verify MCP env
        run: |
          echo "API_KEY is set: $([[ -n $API_KEY ]] && echo yes || echo no)"
```

## CLI Commands Reference

```bash
# Add a server
claude mcp add <name> --scope project -- <command> [args...]

# Add with environment variables
claude mcp add <name> \
  --env KEY1=value1 \
  --env KEY2=value2 \
  -- <command> [args...]

# List all servers
claude mcp list

# Get server details
claude mcp get <name>

# Remove a server
claude mcp remove <name>

# Restart a server
claude mcp restart <name>

# View server logs
claude mcp logs <name>
```

## Validation Hook

```bash
#!/bin/bash
# hooks/pre-mcp-validation.sh

# Validate required environment variables before MCP operations

REQUIRED_VARS=(
  "SF_ORG_ALIAS"
  "SUPABASE_URL"
)

MISSING=()
for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var}" ]; then
    MISSING+=("$var")
  fi
done

if [ ${#MISSING[@]} -gt 0 ]; then
  echo "⚠️ Missing required environment variables:"
  printf '  - %s\n' "${MISSING[@]}"
  echo ""
  echo "Set them with:"
  printf '  export %s=<value>\n' "${MISSING[@]}"
  exit 1
fi

exit 0
```

## Configuration Template

```json
// .mcp.json template
{
  "mcpServers": {
    "salesforce": {
      "command": "npx",
      "args": ["@salesforce/mcp-server"],
      "env": {
        "SF_ORG_ALIAS": "${SF_ORG_ALIAS:-production}"
      }
    },
    "supabase": {
      "command": "npx",
      "args": ["@supabase/mcp-server"],
      "env": {
        "SUPABASE_URL": "${SUPABASE_URL}",
        "SUPABASE_SERVICE_KEY": "${SUPABASE_SERVICE_KEY}"
      }
    },
    "filesystem": {
      "command": "npx",
      "args": [
        "@modelcontextprotocol/server-filesystem",
        "${PWD}"
      ],
      "env": {
        "ALLOWED_PATHS": "${PWD}"
      }
    }
  }
}
```

## Success Criteria

- [ ] All secrets use environment variable expansion
- [ ] Required environment variables documented per server
- [ ] Validation hook checks env vars before operations
- [ ] Sensitive files blocked via permissions.deny
- [ ] Zero "server failed to start" errors from env issues

## Sources

- [Claude Code MCP Configuration](https://code.claude.com/docs/en/settings)
- [MCP in Claude SDK](https://docs.claude.com/en/docs/agent-sdk/mcp)
- [Configuring MCP Tools](https://scottspence.com/posts/configuring-mcp-tools-in-claude-code)
- [GitHub: MCP Environment Variables Issue](https://github.com/anthropics/claude-code/issues/1254)
