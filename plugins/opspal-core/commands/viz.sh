#!/usr/bin/env bash
#
# /viz command - Interactive web visualization dashboard creation
#
# Usage:
#   /viz template list
#   /viz template create <name> [--demo] [--org <alias>]
#   /viz new "<title>" [options]
#   /viz export [--output <path>]
#   /viz serve [--port <number>]
#

set -e

PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_VIZ_DIR="${PLUGIN_DIR}/scripts/lib/web-viz"

# Parse command and arguments
COMMAND="${1:-help}"
shift || true

case "$COMMAND" in
  template)
    SUBCOMMAND="${1:-list}"
    shift || true

    case "$SUBCOMMAND" in
      list)
        node "${WEB_VIZ_DIR}/cli/template-cli.js" list "$@"
        ;;

      info)
        TEMPLATE_NAME="$1"
        if [ -z "$TEMPLATE_NAME" ]; then
          echo "❌ Error: Template name required"
          echo "Usage: /viz template info <template-name>"
          exit 1
        fi
        node "${WEB_VIZ_DIR}/cli/template-cli.js" info "$TEMPLATE_NAME"
        ;;

      create)
        TEMPLATE_NAME="$1"
        shift || true

        if [ -z "$TEMPLATE_NAME" ]; then
          echo "❌ Error: Template name required"
          echo "Usage: /viz template create <template-name> [--demo] [--org <alias>]"
          exit 1
        fi

        # Delegate to agent for actual creation
        echo "🎨 Creating dashboard from template: $TEMPLATE_NAME"
        echo ""
        echo "Invoking web-viz-generator agent..."
        echo ""
        echo "Task: Create a web dashboard from the '$TEMPLATE_NAME' template with the following options: $*"
        echo ""
        echo "💡 The agent will handle the dashboard creation and provide a preview."
        ;;

      *)
        echo "❌ Unknown template subcommand: $SUBCOMMAND"
        echo "Valid subcommands: list, info, create"
        exit 1
        ;;
    esac
    ;;

  new)
    TITLE="$1"
    shift || true

    if [ -z "$TITLE" ]; then
      echo "❌ Error: Dashboard title required"
      echo "Usage: /viz new \"<title>\" [options]"
      exit 1
    fi

    # Delegate to agent
    echo "🎨 Creating new dashboard: $TITLE"
    echo ""
    echo "Invoking web-viz-generator agent..."
    echo ""
    echo "Task: Create a new web dashboard titled '$TITLE' with the following options: $*"
    echo ""
    echo "💡 The agent will guide you through adding components."
    ;;

  export)
    # Check for active session
    if [ -f ".dashboard-state.json" ]; then
      OUTPUT_PATH="${1:---output}"
      if [ "$OUTPUT_PATH" = "--output" ]; then
        OUTPUT_PATH="$2"
      fi

      echo "📤 Exporting current dashboard..."
      echo ""
      echo "Task: Export the current web dashboard to static HTML"
      if [ -n "$OUTPUT_PATH" ] && [ "$OUTPUT_PATH" != "--output" ]; then
        echo "Output: $OUTPUT_PATH"
      fi
    else
      echo "❌ Error: No active dashboard session found"
      echo "Create a dashboard first with: /viz new \"<title>\" or /viz template create <name>"
      exit 1
    fi
    ;;

  serve)
    PORT="${2:-3847}"

    # Check for active session
    if [ -f ".dashboard-state.json" ]; then
      echo "🚀 Starting dev server on port $PORT..."
      echo ""
      echo "Task: Start the web-viz dev server for the current dashboard on port $PORT"
    else
      echo "❌ Error: No active dashboard session found"
      echo "Create a dashboard first with: /viz new \"<title>\" or /viz template create <name>"
      exit 1
    fi
    ;;

  list)
    echo "📋 Active Dashboard Sessions:"
    echo ""
    if [ -d "dashboards" ]; then
      ls -1 dashboards/ 2>/dev/null || echo "No active sessions found"
    else
      echo "No dashboards directory found"
    fi
    ;;

  resume)
    SESSION_ID="$1"
    if [ -z "$SESSION_ID" ]; then
      echo "❌ Error: Session ID required"
      echo "Usage: /viz resume <session-id>"
      echo ""
      echo "Available sessions:"
      /viz list
      exit 1
    fi

    echo "🔄 Resuming dashboard session: $SESSION_ID"
    echo ""
    echo "Task: Resume web dashboard session $SESSION_ID"
    ;;

  stop)
    echo "🛑 Stopping dev server..."
    pkill -f "web-viz.*DevServer" 2>/dev/null || echo "No dev server running"
    ;;

  help|--help|-h)
    cat << 'EOF'
📊 /viz - Interactive Web Dashboard Creation

USAGE:
  /viz template list                        List all available templates
  /viz template info <name>                 Show template details
  /viz template create <name> [options]     Create from template
  /viz new "<title>" [options]              Create blank dashboard
  /viz export [--output <path>]             Export to static HTML
  /viz serve [--port <number>]              Start dev server
  /viz list                                 List active sessions
  /viz resume <session-id>                  Resume session
  /viz stop                                 Stop dev server

TEMPLATES:
  sales-pipeline          Pipeline health, stage distribution
  territory-planning      Geographic coverage, workload balance
  automation-audit        Flow/trigger inventory and conflicts
  data-quality           Completeness, duplicates, hygiene scores
  executive-summary      Revenue KPIs, quota attainment
  process-documentation  Process flows and system diagrams

OPTIONS:
  --demo                 Use demo data (no CRM connection)
  --org <alias>          Use Salesforce org data
  --platform <name>      Platform: salesforce, hubspot
  --chart <type>         Chart type: bar, line, pie, doughnut
  --table               Create data table
  --kpi                 Create KPI card
  --map <type>          Map type: markers, heatmap, territory
  --output <path>       Output path for HTML export
  --port <number>       Dev server port (default: 3847)

EXAMPLES:
  # Create from template with demo data
  /viz template create sales-pipeline --demo

  # Create custom dashboard
  /viz new "Q4 Analysis" --chart bar --data salesforce

  # List available templates
  /viz template list

  # Export current dashboard
  /viz export --output ./reports/dashboard.html

For more info: See .claude-plugins/opspal-core/commands/viz.md
EOF
    ;;

  *)
    echo "❌ Unknown command: $COMMAND"
    echo "Run '/viz help' for usage information"
    exit 1
    ;;
esac
