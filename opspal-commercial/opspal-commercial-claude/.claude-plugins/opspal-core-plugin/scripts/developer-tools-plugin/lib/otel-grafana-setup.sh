#!/bin/bash
# Helper script to enable Grafana integration for OTel metrics
# Usage: ./otel-grafana-setup.sh [enable-prometheus|start-stack|stop-stack|status]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../../.." && pwd)"
OTEL_DIR="$PROJECT_ROOT/.otel"
DOCKER_DIR="$SCRIPT_DIR/../../docker"

enable_prometheus_exporter() {
    echo "🔧 Enabling Prometheus exporter in OTel Collector..."

    if [[ ! -f "$OTEL_DIR/config.yaml" ]]; then
        echo "❌ OTel Collector not configured. Run setup first:"
        echo "   bash $SCRIPT_DIR/otel-quickstart.sh setup"
        exit 1
    fi

    # Backup current config
    cp "$OTEL_DIR/config.yaml" "$OTEL_DIR/config.yaml.backup"

    # Update config with Prometheus exporter
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

  attributes:
    actions:
      - key: service.name
        value: revpal-agent-system
        action: insert
      - key: environment
        from_attribute: ENV
        action: insert

exporters:
  # Console logging (debugging)
  logging:
    verbosity: detailed

  # File export (for scripts)
  file:
    path: $OTEL_DIR/metrics.json

  # Prometheus export (for Grafana)
  prometheus:
    endpoint: "0.0.0.0:8889"
    namespace: claude_code
    const_labels:
      service: revpal-agent-system

service:
  pipelines:
    metrics:
      receivers: [otlp]
      processors: [batch, attributes]
      exporters: [logging, file, prometheus]

    traces:
      receivers: [otlp]
      processors: [batch, attributes]
      exporters: [logging, file]
EOF

    echo "✅ Prometheus exporter enabled"
    echo "   Endpoint: http://localhost:8889/metrics"
    echo ""
    echo "🔄 Restart the OTel Collector:"
    echo "   bash $SCRIPT_DIR/otel-quickstart.sh restart"
}

start_grafana_stack() {
    echo "🚀 Starting Grafana + Prometheus stack..."

    if ! command -v docker &> /dev/null; then
        echo "❌ Docker not installed. Please install Docker first."
        exit 1
    fi

    if ! docker info &> /dev/null; then
        echo "❌ Docker daemon not running. Please start Docker first."
        exit 1
    fi

    # Ensure OTel Collector is configured for Prometheus
    if ! grep -q "prometheus:" "$OTEL_DIR/config.yaml" 2>/dev/null; then
        echo "⚠️  Prometheus exporter not configured. Enabling now..."
        enable_prometheus_exporter
        bash "$SCRIPT_DIR/otel-quickstart.sh" restart
    fi

    # Start Docker Compose stack
    cd "$DOCKER_DIR"
    docker-compose -f otel-stack.yml up -d

    echo ""
    echo "✅ Grafana stack started!"
    echo ""
    echo "📊 Access Points:"
    echo "   Grafana:    http://localhost:3333 (admin/admin)"
    echo "   Prometheus: http://localhost:9090"
    echo ""
    echo "🔍 Verify:"
    echo "   # Check Prometheus targets"
    echo "   curl http://localhost:9090/api/v1/targets"
    echo ""
    echo "   # Check OTel metrics"
    echo "   curl http://localhost:8889/metrics | grep claude_code"
    echo ""
    echo "📖 Next Steps:"
    echo "   1. Open Grafana: http://localhost:3333"
    echo "   2. Login with admin/admin"
    echo "   3. Go to Dashboards → Claude Code Agent Metrics"
    echo "   4. Wait a few minutes for metrics to populate"
}

stop_grafana_stack() {
    echo "🛑 Stopping Grafana + Prometheus stack..."

    cd "$DOCKER_DIR"
    docker-compose -f otel-stack.yml down

    echo "✅ Grafana stack stopped"
}

check_status() {
    echo "📊 Grafana Stack Status"
    printf '═%.0s' {1..80}
    echo ""
    echo ""

    # Check Docker containers
    echo "🐳 Docker Containers:"
    if docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E "revpal-grafana|revpal-prometheus"; then
        echo ""
    else
        echo "  ❌ No containers running"
        echo ""
    fi

    # Check OTel Collector
    echo "📡 OTel Collector:"
    if curl -s http://localhost:8889/metrics > /dev/null 2>&1; then
        echo "  ✅ Prometheus endpoint: http://localhost:8889/metrics"
        METRIC_COUNT=$(curl -s http://localhost:8889/metrics | grep -c "claude_code" || echo "0")
        echo "  📊 Claude Code metrics: $METRIC_COUNT"
    else
        echo "  ❌ Prometheus endpoint not accessible"
        echo "     Run: bash $SCRIPT_DIR/otel-grafana-setup.sh enable-prometheus"
    fi
    echo ""

    # Check Prometheus
    echo "📈 Prometheus:"
    if curl -s http://localhost:9090/-/healthy > /dev/null 2>&1; then
        echo "  ✅ Running: http://localhost:9090"

        # Check targets
        TARGET_STATUS=$(curl -s http://localhost:9090/api/v1/targets | jq -r '.data.activeTargets[0].health // "unknown"' 2>/dev/null || echo "unknown")
        if [[ "$TARGET_STATUS" == "up" ]]; then
            echo "  ✅ Scraping OTel Collector"
        else
            echo "  ⚠️  Target status: $TARGET_STATUS"
        fi
    else
        echo "  ❌ Not running"
    fi
    echo ""

    # Check Grafana
    echo "📊 Grafana:"
    if curl -s http://localhost:3333/api/health > /dev/null 2>&1; then
        echo "  ✅ Running: http://localhost:3333"
        echo "  👤 Login: admin/admin"
    else
        echo "  ❌ Not running"
    fi
    echo ""

    # Summary
    printf '═%.0s' {1..80}
    echo ""
    if curl -s http://localhost:3333/api/health > /dev/null 2>&1 && \
       curl -s http://localhost:9090/-/healthy > /dev/null 2>&1 && \
       curl -s http://localhost:8889/metrics > /dev/null 2>&1; then
        echo "✅ Full stack operational!"
        echo ""
        echo "🎯 Open dashboard: http://localhost:3333/d/claude-code-metrics"
    else
        echo "⚠️  Some components not running. See details above."
        echo ""
        echo "🚀 To start: bash $SCRIPT_DIR/otel-grafana-setup.sh start-stack"
    fi
}

case "${1:-status}" in
    enable-prometheus)
        enable_prometheus_exporter
        ;;
    start-stack)
        start_grafana_stack
        ;;
    stop-stack)
        stop_grafana_stack
        ;;
    status)
        check_status
        ;;
    *)
        echo "Usage: $0 {enable-prometheus|start-stack|stop-stack|status}"
        echo ""
        echo "Commands:"
        echo "  enable-prometheus  - Enable Prometheus exporter in OTel Collector"
        echo "  start-stack        - Start Grafana + Prometheus with Docker"
        echo "  stop-stack         - Stop Grafana + Prometheus"
        echo "  status             - Check status of all components"
        exit 1
        ;;
esac
