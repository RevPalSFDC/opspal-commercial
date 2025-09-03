# HubSpot Enterprise Platform v1.0.0 - Production Setup Guide

## Production Environment Requirements

### Infrastructure
- **CPU**: 4+ cores recommended
- **Memory**: 8GB+ RAM recommended  
- **Storage**: 50GB+ available space
- **Network**: Reliable internet with HubSpot API access
- **OS**: Linux/macOS/Windows with Node.js support

### Software Dependencies
- **Node.js**: Version 18.0.0 or higher
- **npm**: Version 9.0.0 or higher
- **Git**: Version 2.30.0 or higher
- **SSL/TLS**: Valid certificates for HTTPS

## Environment Configuration

### 1. Repository Setup
```bash
# Clone repository
git clone https://github.com/RevPalSFDC/claude-hs.git
cd claude-hs

# Install dependencies
npm install --production

# Verify installation
npm run verify:install
```

### 2. Environment Variables
```bash
# Copy environment template
cp .env.example .env

# Edit with production values
nano .env
```

**Required Environment Variables:**
```env
# HubSpot Configuration
HUBSPOT_API_KEY=your-production-api-key
HUBSPOT_PORTAL_ID=your-portal-id
HUBSPOT_ACCOUNT_TIER=enterprise

# Security
HUBSPOT_WEBHOOK_SECRET=your-webhook-secret
NODE_ENV=production

# Monitoring
MONITOR_PORT=3001
LOG_LEVEL=info
LOG_FILE_PATH=/var/log/hubspot-platform

# Performance
HUBSPOT_GENERAL_RESERVOIR=110
HUBSPOT_GENERAL_REFRESH_INTERVAL=10000
HUBSPOT_SEARCH_MAX_CONCURRENT=5
```

### 3. SSL/TLS Configuration
```bash
# Generate or install SSL certificates
sudo certbot --nginx -d your-domain.com

# Configure HTTPS in environment
echo "HTTPS_PORT=443" >> .env
echo "SSL_CERT_PATH=/etc/ssl/certs/your-domain.crt" >> .env
echo "SSL_KEY_PATH=/etc/ssl/private/your-domain.key" >> .env
```

## Production Services

### 1. Process Management
```bash
# Install PM2 for process management
npm install -g pm2

# Create PM2 configuration
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'hubspot-platform',
    script: './app.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production'
    },
    log_file: '/var/log/hubspot-platform/combined.log',
    out_file: '/var/log/hubspot-platform/out.log',
    error_file: '/var/log/hubspot-platform/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }]
};
EOF

# Start application
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 2. Reverse Proxy (Nginx)
```nginx
server {
    listen 80;
    listen 443 ssl http2;
    server_name your-domain.com;
    
    ssl_certificate /etc/ssl/certs/your-domain.crt;
    ssl_certificate_key /etc/ssl/private/your-domain.key;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
    
    location /health {
        proxy_pass http://localhost:3000/health;
        access_log off;
    }
}
```

## Database Configuration

### 1. State Storage
```bash
# Create data directories
mkdir -p /var/lib/hubspot-platform/{sync,cache,logs}
chown -R hubspot:hubspot /var/lib/hubspot-platform

# Configure database path
echo "SYNC_STATE_PATH=/var/lib/hubspot-platform/sync" >> .env
echo "CACHE_PATH=/var/lib/hubspot-platform/cache" >> .env
```

### 2. Backup Configuration
```bash
# Create backup script
cat > /usr/local/bin/hubspot-backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/backups/hubspot-platform"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# Backup configuration
tar -czf $BACKUP_DIR/config_$DATE.tar.gz .env .mcp.json

# Backup state data
tar -czf $BACKUP_DIR/data_$DATE.tar.gz /var/lib/hubspot-platform

# Cleanup old backups (keep 30 days)
find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete
EOF

chmod +x /usr/local/bin/hubspot-backup.sh

# Schedule daily backups
echo "0 2 * * * /usr/local/bin/hubspot-backup.sh" | crontab -
```

## Monitoring & Alerting

### 1. Health Monitoring
```bash
# Configure health check endpoint
curl -f http://localhost:3000/health || exit 1

# Add to monitoring system (example with Nagios)
cat > /etc/nagios/objects/hubspot-platform.cfg << EOF
define service {
    use                     generic-service
    host_name               localhost
    service_description     HubSpot Platform Health
    check_command           check_http!-p 3000 -u /health
    check_interval          1
    retry_interval          1
}
EOF
```

### 2. Performance Monitoring
```bash
# Install monitoring agents
npm install -g @hubspot-platform/monitoring

# Configure metrics collection
echo "METRICS_ENABLED=true" >> .env
echo "METRICS_ENDPOINT=http://your-metrics-server:8086" >> .env
echo "METRICS_INTERVAL=60000" >> .env
```

### 3. Log Management
```bash
# Configure log rotation
cat > /etc/logrotate.d/hubspot-platform << EOF
/var/log/hubspot-platform/*.log {
    daily
    missingok
    rotate 30
    compress
    notifempty
    create 0644 hubspot hubspot
    postrotate
        pm2 reloadLogs
    endscript
}
EOF
```

## Security Hardening

### 1. Firewall Configuration
```bash
# Configure UFW firewall
ufw allow 22/tcp      # SSH
ufw allow 80/tcp      # HTTP
ufw allow 443/tcp     # HTTPS
ufw allow 3001/tcp    # Monitoring (restrict to internal)
ufw --force enable
```

### 2. User Security
```bash
# Create dedicated user
useradd -r -s /bin/false -d /opt/hubspot-platform hubspot

# Set file permissions
chown -R hubspot:hubspot /opt/hubspot-platform
chmod -R 750 /opt/hubspot-platform
chmod 600 .env
```

### 3. API Security
```bash
# Implement rate limiting
echo "RATE_LIMIT_ENABLED=true" >> .env
echo "RATE_LIMIT_MAX=1000" >> .env
echo "RATE_LIMIT_WINDOW=900000" >> .env

# Enable request logging
echo "AUDIT_LOG_ENABLED=true" >> .env
echo "AUDIT_LOG_PATH=/var/log/hubspot-platform/audit.log" >> .env
```

## Production Validation

### 1. Deployment Tests
```bash
# Run production test suite
npm run test:production

# Validate configuration
npm run validate:config

# Check dependencies
npm run check:deps

# Verify certificates
npm run verify:ssl
```

### 2. Performance Baseline
```bash
# Establish performance benchmarks
npm run benchmark:production

# Load testing
npm run test:load

# Memory profiling
npm run profile:memory
```

## Maintenance Procedures

### 1. Updates
```bash
# Update procedure
git pull origin main
npm install --production
npm run migrate
pm2 reload hubspot-platform
npm run verify:health
```

### 2. Scaling
```bash
# Scale PM2 instances
pm2 scale hubspot-platform +2

# Monitor resource usage
pm2 monit
```

---

**Production Setup Completed By**: ________________  
**Date**: ________________  
**Environment**: ________________  
**Status**: [ ] Complete [ ] Partial [ ] Issues  

**Notes**:
_____________________________________________
_____________________________________________
