#!/bin/bash
# Quick start script for OpenTelemetry integration
# Usage: ./otel-quickstart.sh [setup|start|stop|status]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../../.." && pwd)"
OTEL_DIR="$PROJECT_ROOT/.otel"

setup_otel_collector() {
    echo "📦 Setting up OpenTelemetry Collector..."

    mkdir -p "$OTEL_DIR"

    # Download OTel Collector (Linux x64)
    if [[ ! -f "$OTEL_DIR/otelcol" ]]; then
        echo "  → Downloading OTel Collector..."
        curl -L https://github.com/open-telemetry/opentelemetry-collector-releases/releases/download/v0.91.0/otelcol_0.91.0_linux_amd64.tar.gz \
            | tar xz -C "$OTEL_DIR" otelcol
        chmod +x "$OTEL_DIR/otelcol"
    fi

    # Create collector config
    cat > "$OTEL_DIR/config.yaml" <<EOF
receivers:
  otlp:
    protocols:
      http:
        endpoint: 0.0.0.0:4318
      grpc:
        endpoint: 0.0.0.0:4317

processors:
  batch:
    timeout: 10s
    send_batch_size: 100

  # Add RevPal-specific attributes
  attributes:
    actions:
      - key: service.name
        value: revpal-agent-system
        action: insert
      - key: environment
        from_attribute: ENV
        action: insert

exporters:
  # Log to console for debugging
  logging:
    loglevel: debug

  # Export to file for local processing
  file:
    path: "$OTEL_DIR/metrics.json"

  # Placeholder for Supabase HTTP endpoint
  # otlphttp:
  #   endpoint: https://your-supabase-function.supabase.co/otel-ingest
  #   headers:
  #     apikey: \${SUPABASE_ANON_KEY}

service:
  pipelines:
    metrics:
      receivers: [otlp]
      processors: [batch, attributes]
      exporters: [logging, file]

    traces:
      receivers: [otlp]
      processors: [batch, attributes]
      exporters: [logging, file]
EOF

    echo "✅ OTel Collector configured at $OTEL_DIR"
}

start_collector() {
    echo "🚀 Starting OTel Collector..."

    if [[ -f "$OTEL_DIR/otelcol.pid" ]] && kill -0 $(cat "$OTEL_DIR/otelcol.pid") 2>/dev/null; then
        echo "⚠️  Collector already running (PID: $(cat "$OTEL_DIR/otelcol.pid"))"
        return
    fi

    nohup "$OTEL_DIR/otelcol" --config "$OTEL_DIR/config.yaml" \
        > "$OTEL_DIR/collector.log" 2>&1 &

    echo $! > "$OTEL_DIR/otelcol.pid"
    echo "✅ Collector started (PID: $!)"
    echo "   Logs: tail -f $OTEL_DIR/collector.log"
}

stop_collector() {
    echo "🛑 Stopping OTel Collector..."

    if [[ -f "$OTEL_DIR/otelcol.pid" ]]; then
        PID=$(cat "$OTEL_DIR/otelcol.pid")
        if kill -0 "$PID" 2>/dev/null; then
            kill "$PID"
            rm "$OTEL_DIR/otelcol.pid"
            echo "✅ Collector stopped"
        else
            echo "⚠️  Collector not running"
            rm "$OTEL_DIR/otelcol.pid"
        fi
    else
        echo "⚠️  No PID file found"
    fi
}

check_status() {
    echo "📊 OTel Collector Status:"

    if [[ -f "$OTEL_DIR/otelcol.pid" ]]; then
        PID=$(cat "$OTEL_DIR/otelcol.pid")
        if kill -0 "$PID" 2>/dev/null; then
            echo "  Status: ✅ Running (PID: $PID)"
            echo "  Config: $OTEL_DIR/config.yaml"
            echo "  Logs: $OTEL_DIR/collector.log"
            echo "  Metrics: $OTEL_DIR/metrics.json"

            # Check if receiving data
            if [[ -f "$OTEL_DIR/metrics.json" ]]; then
                LINES=$(wc -l < "$OTEL_DIR/metrics.json")
                echo "  Metrics received: $LINES events"
            fi
        else
            echo "  Status: ❌ Not running (stale PID)"
        fi
    else
        echo "  Status: ❌ Not running"
    fi

    # Check if Claude Code is configured
    echo ""
    echo "📋 Claude Code OTel Configuration:"
    if [[ -n "$OTEL_EXPORTER_OTLP_ENDPOINT" ]]; then
        echo "  OTEL_EXPORTER_OTLP_ENDPOINT: $OTEL_EXPORTER_OTLP_ENDPOINT"
    else
        echo "  ⚠️  OTEL_EXPORTER_OTLP_ENDPOINT not set"
        echo "     Run: export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318"
    fi
}

configure_claude() {
    echo "⚙️  Configuring Claude Code for OTel..."

    # Add to shell profile
    SHELL_RC="$HOME/.bashrc"
    if [[ "$SHELL" == */zsh ]]; then
        SHELL_RC="$HOME/.zshrc"
    fi

    cat >> "$SHELL_RC" <<EOF

# OpenTelemetry configuration for Claude Code
export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318"
export OTEL_SERVICE_NAME="revpal-agent-system"
export OTEL_METRICS_EXPORTER="otlp"
export OTEL_TRACES_EXPORTER="otlp"
EOF

    echo "✅ Added OTel configuration to $SHELL_RC"
    echo "   Run: source $SHELL_RC"
}

case "${1:-status}" in
    setup)
        setup_otel_collector
        configure_claude
        ;;
    start)
        start_collector
        ;;
    stop)
        stop_collector
        ;;
    status)
        check_status
        ;;
    restart)
        stop_collector
        sleep 2
        start_collector
        ;;
    *)
        echo "Usage: $0 {setup|start|stop|restart|status}"
        exit 1
        ;;
esac
