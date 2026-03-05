#!/bin/bash
# Fix and restart Grafana stack
# Run this if containers are stuck restarting

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKER_DIR="$SCRIPT_DIR/../../docker"

echo "🔧 Fixing Grafana Stack..."
echo ""

# Check if Docker needs sudo
if groups | grep -q docker; then
    DOCKER_CMD="docker"
    COMPOSE_CMD="docker-compose"
else
    echo "⚠️  Your user is not in the docker group."
    echo "   Running with sudo (you may need to enter password)"
    DOCKER_CMD="sudo docker"
    COMPOSE_CMD="sudo docker-compose"
fi

echo "1️⃣  Stopping existing containers..."
cd "$DOCKER_DIR"
$COMPOSE_CMD -f otel-stack.yml down --remove-orphans 2>/dev/null || true

echo "2️⃣  Cleaning up old containers..."
$DOCKER_CMD rm -f revpal-grafana revpal-prometheus 2>/dev/null || true

echo "3️⃣  Fixing file permissions..."
chmod 644 "$DOCKER_DIR/prometheus.yml"
chmod -R 755 "$DOCKER_DIR/grafana-provisioning"

echo "4️⃣  Starting fresh containers..."
cd "$DOCKER_DIR"
$COMPOSE_CMD -f otel-stack.yml up -d

echo ""
echo "✅ Stack restarted!"
echo ""
echo "📊 Access Points:"
echo "   Grafana:    http://localhost:3333 (admin/admin)"
echo "   Prometheus: http://localhost:9090"
echo ""
echo "🔍 Check status:"
echo "   $DOCKER_CMD ps | grep revpal"
echo ""
echo "📝 View logs:"
echo "   $DOCKER_CMD logs revpal-grafana"
echo "   $DOCKER_CMD logs revpal-prometheus"
