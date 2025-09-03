#!/bin/bash

# Principal Engineer Agent System - Initialization Script
# This script initializes the principal engineer system and registers it with Claude

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "=========================================="
echo "Principal Engineer Agent System Initializer"
echo "Version 1.0.0"
echo "=========================================="
echo ""

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    echo "Checking prerequisites..."
    
    # Check if Node.js is installed
    if command -v node &> /dev/null; then
        print_status "Node.js is installed ($(node --version))"
    else
        print_error "Node.js is not installed. Please install Node.js first."
        exit 1
    fi
    
    # Check if npm is installed
    if command -v npm &> /dev/null; then
        print_status "npm is installed ($(npm --version))"
    else
        print_error "npm is not installed. Please install npm first."
        exit 1
    fi
    
    # Check if required directories exist
    if [ -d "$PROJECT_ROOT/ClaudeHubSpot" ]; then
        print_status "ClaudeHubSpot directory found"
    else
        print_warning "ClaudeHubSpot directory not found"
    fi
    
    if [ -d "$PROJECT_ROOT/ClaudeSFDC" ]; then
        print_status "ClaudeSFDC directory found"
    else
        print_warning "ClaudeSFDC directory not found"
    fi
    
    echo ""
}

# Initialize agent registry
init_agent_registry() {
    echo "Initializing agent registry..."
    
    REGISTRY_FILE="$PROJECT_ROOT/shared-infrastructure/configs/agent-registry.json"
    
    # Create agent registry
    cat > "$REGISTRY_FILE" << 'EOF'
{
  "registry_version": "1.0.0",
  "last_updated": "TIMESTAMP",
  "principal_engineer": {
    "location": "agents/principal-engineer.yaml",
    "version": "1.0.0",
    "status": "active"
  },
  "management_team": {
    "config-manager": {
      "location": "agents/management/config-manager.yaml",
      "version": "1.0.0",
      "status": "active"
    },
    "agent-maintainer": {
      "location": "agents/management/agent-maintainer.yaml",
      "version": "1.0.0",
      "status": "active"
    },
    "release-coordinator": {
      "location": "agents/management/release-coordinator.yaml",
      "version": "1.0.0",
      "status": "active"
    },
    "quality-auditor": {
      "location": "agents/management/quality-auditor.yaml",
      "version": "1.0.0",
      "status": "active"
    },
    "integration-architect": {
      "location": "agents/management/integration-architect.yaml",
      "version": "1.0.0",
      "status": "active"
    },
    "mcp-tools-manager": {
      "location": "agents/management/mcp-tools-manager.yaml",
      "version": "1.0.0",
      "status": "active"
    },
    "documentation-curator": {
      "location": "agents/management/documentation-curator.yaml",
      "version": "1.0.0",
      "status": "active"
    }
  },
  "platform_agents": {
    "hubspot": [],
    "salesforce": []
  }
}
EOF
    
    # Update timestamp
    sed -i "s/TIMESTAMP/$(date -u +"%Y-%m-%dT%H:%M:%SZ")/g" "$REGISTRY_FILE"
    
    print_status "Agent registry initialized"
    echo ""
}

# Discover existing agents
discover_agents() {
    echo "Discovering existing agents..."
    
    DISCOVERY_SCRIPT="$PROJECT_ROOT/shared-infrastructure/scripts/agent-discovery.js"
    
    # Check if discovery script exists
    if [ -f "$DISCOVERY_SCRIPT" ]; then
        node "$DISCOVERY_SCRIPT"
    else
        print_warning "Agent discovery script not found. Skipping automatic discovery."
    fi
    
    # Count agents
    HUBSPOT_AGENTS=$(find "$PROJECT_ROOT/ClaudeHubSpot/agents" -name "*.yaml" 2>/dev/null | wc -l)
    SFDC_AGENTS=$(find "$PROJECT_ROOT/ClaudeSFDC/agents" -name "*.yaml" 2>/dev/null | wc -l)
    MGMT_AGENTS=$(find "$PROJECT_ROOT/agents/management" -name "*.yaml" 2>/dev/null | wc -l)
    
    print_status "Found $HUBSPOT_AGENTS HubSpot agents"
    print_status "Found $SFDC_AGENTS Salesforce agents"
    print_status "Found $MGMT_AGENTS Management team agents"
    
    echo ""
}

# Set up monitoring
setup_monitoring() {
    echo "Setting up monitoring infrastructure..."
    
    MONITORING_CONFIG="$PROJECT_ROOT/control-center/monitoring/config.json"
    
    # Create monitoring configuration
    cat > "$MONITORING_CONFIG" << 'EOF'
{
  "monitoring": {
    "enabled": true,
    "interval": 60,
    "endpoints": {
      "health": "/api/health",
      "metrics": "/api/metrics",
      "status": "/api/status"
    },
    "alerts": {
      "email": {
        "enabled": false,
        "recipients": []
      },
      "slack": {
        "enabled": false,
        "webhook": ""
      },
      "discord": {
        "enabled": false,
        "webhook": ""
      }
    },
    "thresholds": {
      "error_rate": 0.05,
      "response_time": 2000,
      "availability": 0.999
    }
  }
}
EOF
    
    print_status "Monitoring configuration created"
    echo ""
}

# Create startup script
create_startup_script() {
    echo "Creating startup script..."
    
    STARTUP_SCRIPT="$PROJECT_ROOT/start-principal.sh"
    
    cat > "$STARTUP_SCRIPT" << 'EOF'
#!/bin/bash

# Principal Engineer Agent System - Startup Script

echo "Starting Principal Engineer Agent System..."

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Start monitoring dashboard (if exists)
if [ -f "$PROJECT_ROOT/control-center/dashboard/server.js" ]; then
    echo "Starting monitoring dashboard..."
    node "$PROJECT_ROOT/control-center/dashboard/server.js" &
    DASHBOARD_PID=$!
    echo "Dashboard started with PID: $DASHBOARD_PID"
fi

# Start error logging system (if exists)
if [ -f "$PROJECT_ROOT/ClaudeSFDC/error-logging/index.js" ]; then
    echo "Starting error logging system..."
    cd "$PROJECT_ROOT/ClaudeSFDC/error-logging"
    npm start &
    ERROR_LOG_PID=$!
    echo "Error logging started with PID: $ERROR_LOG_PID"
    cd "$PROJECT_ROOT"
fi

echo ""
echo "Principal Engineer Agent System is ready!"
echo ""
echo "Available commands:"
echo "  - Use 'Task: principal-engineer' to invoke the principal engineer"
echo "  - Use 'Task: [agent-name]' to invoke specific management agents"
echo ""
echo "Dashboard URL: http://localhost:3000 (if running)"
echo ""

# Keep script running
wait
EOF
    
    chmod +x "$STARTUP_SCRIPT"
    print_status "Startup script created: start-principal.sh"
    echo ""
}

# Create test framework
create_test_framework() {
    echo "Creating test framework..."
    
    TEST_DIR="$PROJECT_ROOT/tests"
    mkdir -p "$TEST_DIR"
    
    # Create basic test runner
    cat > "$TEST_DIR/test-runner.js" << 'EOF'
#!/usr/bin/env node

/**
 * Principal Engineer Agent System - Test Runner
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

console.log('Principal Engineer Agent System - Test Suite');
console.log('===========================================\n');

// Test agent YAML files
function testAgentYaml(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const agent = yaml.load(content);
        
        // Validate required fields
        const required = ['name', 'description', 'version', 'stage', 'tools', 'capabilities'];
        const missing = required.filter(field => !agent[field]);
        
        if (missing.length > 0) {
            return { success: false, error: `Missing required fields: ${missing.join(', ')}` };
        }
        
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Run tests
function runTests() {
    const agentDir = path.join(__dirname, '..', 'agents');
    const managementDir = path.join(agentDir, 'management');
    
    let passed = 0;
    let failed = 0;
    
    // Test principal engineer
    console.log('Testing principal-engineer.yaml...');
    const principalResult = testAgentYaml(path.join(agentDir, 'principal-engineer.yaml'));
    if (principalResult.success) {
        console.log('  ✓ Passed');
        passed++;
    } else {
        console.log(`  ✗ Failed: ${principalResult.error}`);
        failed++;
    }
    
    // Test management agents
    const managementAgents = fs.readdirSync(managementDir).filter(f => f.endsWith('.yaml'));
    
    managementAgents.forEach(agent => {
        console.log(`Testing ${agent}...`);
        const result = testAgentYaml(path.join(managementDir, agent));
        if (result.success) {
            console.log('  ✓ Passed');
            passed++;
        } else {
            console.log(`  ✗ Failed: ${result.error}`);
            failed++;
        }
    });
    
    console.log('\n===========================================');
    console.log(`Tests completed: ${passed} passed, ${failed} failed`);
    
    process.exit(failed > 0 ? 1 : 0);
}

// Check if js-yaml is installed
try {
    require.resolve('js-yaml');
    runTests();
} catch (e) {
    console.log('Installing required dependencies...');
    require('child_process').execSync('npm install js-yaml', { stdio: 'inherit' });
    runTests();
}
EOF
    
    chmod +x "$TEST_DIR/test-runner.js"
    print_status "Test framework created"
    echo ""
}

# Summary report
print_summary() {
    echo "=========================================="
    echo "Initialization Complete!"
    echo "=========================================="
    echo ""
    echo "Principal Engineer Agent System is now initialized."
    echo ""
    echo "Next steps:"
    echo "1. Run './start-principal.sh' to start the system"
    echo "2. Update your project CLAUDE.md files to reference the principal engineer"
    echo "3. Test the system with 'Task: principal-engineer'"
    echo ""
    echo "Available management agents:"
    echo "  - config-manager"
    echo "  - agent-maintainer"
    echo "  - release-coordinator"
    echo "  - quality-auditor"
    echo "  - integration-architect"
    echo "  - mcp-tools-manager"
    echo "  - documentation-curator"
    echo ""
    echo "For documentation, see: $PROJECT_ROOT/README.md"
    echo ""
}

# Main execution
main() {
    check_prerequisites
    init_agent_registry
    discover_agents
    setup_monitoring
    create_startup_script
    create_test_framework
    print_summary
}

# Run main function
main