#!/bin/bash
# Configure Claude Code to send metrics to OTel Collector
# Usage: source this file or run it

export OTEL_EXPORTER_OTLP_ENDPOINT="http://localhost:4318"
export OTEL_SERVICE_NAME="revpal-agent-system"
export OTEL_METRICS_EXPORTER="otlp"
export OTEL_TRACES_EXPORTER="otlp"

echo "✅ OpenTelemetry environment configured!"
echo ""
echo "Environment variables set:"
echo "  OTEL_EXPORTER_OTLP_ENDPOINT=$OTEL_EXPORTER_OTLP_ENDPOINT"
echo "  OTEL_SERVICE_NAME=$OTEL_SERVICE_NAME"
echo "  OTEL_METRICS_EXPORTER=$OTEL_METRICS_EXPORTER"
echo "  OTEL_TRACES_EXPORTER=$OTEL_TRACES_EXPORTER"
echo ""
echo "🎯 Next: Exit Claude Code and restart to start sending metrics"
