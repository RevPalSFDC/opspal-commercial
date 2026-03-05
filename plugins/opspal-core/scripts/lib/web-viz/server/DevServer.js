/**
 * Development Server for Web Visualizations
 *
 * Express-based dev server with WebSocket hot-reload for live dashboard updates.
 *
 * @module web-viz/server/DevServer
 * @version 1.0.0
 */

const http = require('http');
const path = require('path');
const fs = require('fs').promises;
const { execSync } = require('child_process');

// Load defaults
let defaults;
try {
  defaults = require('../../../config/web-viz-defaults.json');
} catch {
  defaults = { server: {}, cdn: {} };
}

class DevServer {
  /**
   * Create a dev server
   * @param {Object} options - Server options
   */
  constructor(options = {}) {
    this.options = {
      port: options.port || defaults.server?.port || 3847,
      host: options.host || defaults.server?.host || 'localhost',
      openBrowser: options.openBrowser !== false,
      ...options
    };

    this.server = null;
    this.wsClients = new Set();
    this.dashboard = null;
    this.isRunning = false;
  }

  /**
   * Start the dev server
   * @param {DashboardBuilder} dashboard - Dashboard to serve
   * @returns {Promise<Object>} Server info
   */
  async start(dashboard) {
    if (this.isRunning) {
      throw new Error('Server is already running');
    }

    this.dashboard = dashboard;

    // Try to load express and ws, provide helpful error if missing
    let express, WebSocket;
    try {
      express = require('express');
      WebSocket = require('ws');
    } catch (error) {
      console.log('\nMissing dependencies for dev server.');
      console.log('Install with: npm install express ws --save');
      console.log('\nFalling back to static HTML mode...\n');

      // Generate static HTML instead
      const outputPath = await dashboard.generateStaticHTML();
      const url = `file://${path.resolve(outputPath)}`;

      if (this.options.openBrowser) {
        this._openBrowser(url);
      }

      return {
        mode: 'static',
        url,
        path: outputPath
      };
    }

    const app = express();

    // Parse JSON bodies
    app.use(express.json());

    // CORS for development
    app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
      if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
      }
      next();
    });

    // Serve dashboard HTML
    app.get('/', async (req, res) => {
      try {
        const html = await this._generateDashboardHTML();
        res.type('html').send(html);
      } catch (error) {
        res.status(500).send(`Error: ${error.message}`);
      }
    });

    // API endpoints
    app.get('/api/state', (req, res) => {
      res.json(this.dashboard.stateManager.getState());
    });

    app.get('/api/components', (req, res) => {
      const components = Array.from(this.dashboard.components.values())
        .map(c => c.serialize());
      res.json(components);
    });

    app.get('/api/components/:id', (req, res) => {
      const component = this.dashboard.getComponent(req.params.id);
      if (component) {
        res.json(component.serialize());
      } else {
        res.status(404).json({ error: 'Component not found' });
      }
    });

    // Create HTTP server
    this.server = http.createServer(app);

    // Create WebSocket server
    const wss = new WebSocket.Server({ server: this.server });

    wss.on('connection', (ws) => {
      this.wsClients.add(ws);
      console.log(`WebSocket client connected (${this.wsClients.size} total)`);

      ws.on('close', () => {
        this.wsClients.delete(ws);
        console.log(`WebSocket client disconnected (${this.wsClients.size} remaining)`);
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error.message);
        this.wsClients.delete(ws);
      });

      // Send initial state
      ws.send(JSON.stringify({
        type: 'init',
        state: this.dashboard.stateManager.getState()
      }));
    });

    // Start server
    return new Promise((resolve, reject) => {
      this.server.listen(this.options.port, this.options.host, () => {
        this.isRunning = true;
        const url = `http://${this.options.host}:${this.options.port}`;

        console.log(`\n  Dashboard server running at: ${url}`);
        console.log(`  Session: ${this.dashboard.stateManager.sessionId}`);
        console.log(`  Components: ${this.dashboard.components.size}`);
        console.log(`\n  Press Ctrl+C to stop\n`);

        if (this.options.openBrowser) {
          this._openBrowser(url);
        }

        resolve({
          mode: 'dev-server',
          url,
          port: this.options.port,
          host: this.options.host,
          sessionId: this.dashboard.stateManager.sessionId
        });
      });

      this.server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          reject(new Error(`Port ${this.options.port} is already in use`));
        } else {
          reject(error);
        }
      });
    });
  }

  /**
   * Stop the dev server
   */
  async stop() {
    if (!this.isRunning) return;

    // Close all WebSocket connections
    for (const client of this.wsClients) {
      client.close();
    }
    this.wsClients.clear();

    // Close HTTP server
    return new Promise((resolve) => {
      this.server.close(() => {
        this.isRunning = false;
        console.log('\nDev server stopped');
        resolve();
      });
    });
  }

  /**
   * Broadcast update to all connected clients
   * @param {string} type - Update type
   * @param {Object} payload - Update payload
   */
  broadcast(type, payload) {
    const message = JSON.stringify({ type, payload, timestamp: Date.now() });

    for (const client of this.wsClients) {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(message);
      }
    }
  }

  /**
   * Notify clients of component update
   * @param {string} componentId - Updated component ID
   */
  notifyComponentUpdate(componentId) {
    const component = this.dashboard.getComponent(componentId);
    if (component) {
      this.broadcast('component_update', {
        id: componentId,
        component: component.serialize()
      });
    }
  }

  /**
   * Notify clients of component addition
   * @param {string} componentId - New component ID
   */
  notifyComponentAdd(componentId) {
    const component = this.dashboard.getComponent(componentId);
    if (component) {
      this.broadcast('component_add', {
        id: componentId,
        component: component.serialize(),
        html: component.generateHTML(),
        css: component.generateCSS(),
        js: component.generateJS()
      });
    }
  }

  /**
   * Notify clients of component removal
   * @param {string} componentId - Removed component ID
   */
  notifyComponentRemove(componentId) {
    this.broadcast('component_remove', { id: componentId });
  }

  /**
   * Notify clients to full refresh
   */
  notifyFullRefresh() {
    this.broadcast('full_refresh', {});
  }

  /**
   * Generate dashboard HTML for dev server
   * @private
   */
  async _generateDashboardHTML() {
    const StaticHtmlGenerator = require('../output/StaticHtmlGenerator');
    const generator = new StaticHtmlGenerator(this.dashboard.options);

    const components = Array.from(this.dashboard.components.values());
    const state = this.dashboard.stateManager.getState();

    // Generate base HTML
    let html = await generator.generate({
      title: this.dashboard.title,
      theme: this.dashboard.options.theme,
      components,
      state
    });

    // Inject WebSocket client code
    const wsClientCode = this._generateWSClientCode();
    html = html.replace('</body>', `${wsClientCode}\n</body>`);

    // Update mode indicator
    html = html.replace(
      "window.DASHBOARD_MODE = 'static'",
      "window.DASHBOARD_MODE = 'dev-server'"
    );

    return html;
  }

  /**
   * Generate WebSocket client code
   * @private
   */
  _generateWSClientCode() {
    return `
<script>
(function() {
  // Dev server WebSocket client
  const wsUrl = 'ws://${this.options.host}:${this.options.port}';
  let ws = null;
  let reconnectAttempts = 0;
  const maxReconnectAttempts = 10;

  function connect() {
    ws = new WebSocket(wsUrl);

    ws.onopen = function() {
      console.log('[DevServer] Connected');
      reconnectAttempts = 0;
      showConnectionStatus('connected');
    };

    ws.onclose = function() {
      console.log('[DevServer] Disconnected');
      showConnectionStatus('disconnected');

      // Attempt reconnect
      if (reconnectAttempts < maxReconnectAttempts) {
        reconnectAttempts++;
        setTimeout(connect, 1000 * Math.min(reconnectAttempts, 5));
      }
    };

    ws.onerror = function(error) {
      console.error('[DevServer] Error:', error);
    };

    ws.onmessage = function(event) {
      try {
        const msg = JSON.parse(event.data);
        handleMessage(msg);
      } catch (e) {
        console.error('[DevServer] Invalid message:', e);
      }
    };
  }

  function handleMessage(msg) {
    console.log('[DevServer] Received:', msg.type);

    switch (msg.type) {
      case 'init':
        window.DASHBOARD_STATE = msg.state;
        break;

      case 'component_update':
        updateComponent(msg.payload);
        break;

      case 'component_add':
        addComponent(msg.payload);
        break;

      case 'component_remove':
        removeComponent(msg.payload.id);
        break;

      case 'full_refresh':
        location.reload();
        break;

      default:
        console.log('[DevServer] Unknown message type:', msg.type);
    }
  }

  function updateComponent(payload) {
    const { id, component } = payload;
    const el = document.querySelector('[data-component-id="' + id + '"]');

    if (!el) {
      console.warn('[DevServer] Component not found:', id);
      return;
    }

    // Update data in global stores
    if (window.VIZ_CHARTS && window.VIZ_CHARTS[id]) {
      window.VIZ_CHARTS[id].data = component.data;
      window.VIZ_CHARTS[id].update();
    }

    if (window.VIZ_TABLES && window.VIZ_TABLES[id]) {
      window.VIZ_TABLES[id].data = component.data;
      window.VIZ_TABLES[id].refresh();
    }

    if (window.VIZ_KPIS && window.VIZ_KPIS[id]) {
      window.VIZ_KPIS[id].update(component.data);
    }

    // Flash update indicator
    el.classList.add('viz-updating');
    setTimeout(() => el.classList.remove('viz-updating'), 500);
  }

  function addComponent(payload) {
    const { id, html, css, js } = payload;
    const grid = document.querySelector('.dashboard-grid');

    if (!grid) return;

    // Add HTML
    grid.insertAdjacentHTML('beforeend', html);

    // Add CSS
    if (css) {
      const style = document.createElement('style');
      style.textContent = css;
      document.head.appendChild(style);
    }

    // Execute JS
    if (js) {
      const script = document.createElement('script');
      script.textContent = js;
      document.body.appendChild(script);
    }
  }

  function removeComponent(id) {
    const el = document.querySelector('[data-component-id="' + id + '"]');
    if (el) {
      el.remove();
    }

    // Clean up global references
    if (window.VIZ_CHARTS) delete window.VIZ_CHARTS[id];
    if (window.VIZ_TABLES) delete window.VIZ_TABLES[id];
    if (window.VIZ_KPIS) delete window.VIZ_KPIS[id];
    if (window.VIZ_MAPS) delete window.VIZ_MAPS[id];
  }

  function showConnectionStatus(status) {
    let indicator = document.getElementById('ws-status');

    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'ws-status';
      indicator.style.cssText = \`
        position: fixed;
        bottom: 10px;
        right: 10px;
        padding: 6px 12px;
        border-radius: 4px;
        font-size: 12px;
        font-family: system-ui, sans-serif;
        z-index: 9999;
        transition: opacity 0.3s;
      \`;
      document.body.appendChild(indicator);
    }

    if (status === 'connected') {
      indicator.style.background = '#22C55E';
      indicator.style.color = 'white';
      indicator.textContent = 'Live';
      setTimeout(() => { indicator.style.opacity = '0.5'; }, 2000);
    } else {
      indicator.style.background = '#EF4444';
      indicator.style.color = 'white';
      indicator.textContent = 'Disconnected';
      indicator.style.opacity = '1';
    }
  }

  // Add update animation styles
  const style = document.createElement('style');
  style.textContent = \`
    .viz-updating {
      animation: viz-pulse 0.5s ease-out;
    }
    @keyframes viz-pulse {
      0% { box-shadow: 0 0 0 0 rgba(95, 59, 140, 0.4); }
      100% { box-shadow: 0 0 0 10px rgba(95, 59, 140, 0); }
    }
  \`;
  document.head.appendChild(style);

  // Connect on load
  connect();
})();
</script>`;
  }

  /**
   * Open URL in browser
   * @private
   */
  _openBrowser(url) {
    try {
      // Use platform-utils for cross-platform browser opening (WSL-aware)
      const platformUtils = require('../../platform-utils');
      platformUtils.openBrowser(url);
    } catch (error) {
      // Fallback if platform-utils not available
      const platform = process.platform;
      try {
        if (platform === 'darwin') {
          execSync(`open "${url}"`);
        } else if (platform === 'win32') {
          execSync(`start "" "${url}"`);
        } else {
          execSync(`xdg-open "${url}" 2>/dev/null || sensible-browser "${url}" 2>/dev/null || x-www-browser "${url}" 2>/dev/null`);
        }
      } catch (err) {
        console.log(`  Open in browser: ${url}`);
      }
    }
  }

  /**
   * Check if server is running
   * @returns {boolean}
   */
  get running() {
    return this.isRunning;
  }

  /**
   * Get connected client count
   * @returns {number}
   */
  get clientCount() {
    return this.wsClients.size;
  }
}

module.exports = DevServer;
