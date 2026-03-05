#!/usr/bin/env node

/**
 * Script Path Checker
 *
 * Verifies that agent-referenced script paths exist on disk.
 * Scans agent markdown files for script references and confirms they resolve.
 *
 * @module script-path-checker
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'Script Paths',

  async run(options = {}) {
    const startMs = Date.now();

    // Scan agent files for script references
    const pluginsDir = path.resolve(__dirname, '../../../../../');
    const missing = [];
    let checked = 0;

    try {
      const pluginDirs = fs.readdirSync(pluginsDir).filter(d => {
        return fs.existsSync(path.join(pluginsDir, d, '.claude-plugin', 'plugin.json'));
      });

      for (const pluginDir of pluginDirs.slice(0, 5)) { // Limit to 5 plugins for speed
        const agentsDir = path.join(pluginsDir, pluginDir, 'agents');
        if (!fs.existsSync(agentsDir)) continue;

        const agentFiles = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));

        for (const agentFile of agentFiles.slice(0, 20)) { // Limit per plugin
          try {
            const content = fs.readFileSync(path.join(agentsDir, agentFile), 'utf8');

            // Find script references like: node scripts/lib/foo.js or node "${SCRIPT_ROOT}/scripts/lib/bar.js"
            const scriptRefs = content.match(/node\s+(?:"\$\{[^}]+\}\/)?scripts\/lib\/[\w\-\/]+\.js/g) || [];

            for (const ref of scriptRefs) {
              checked++;
              // Extract relative path
              const pathMatch = ref.match(/scripts\/lib\/[\w\-\/]+\.js/);
              if (pathMatch) {
                const scriptPath = path.join(pluginsDir, pluginDir, pathMatch[0]);
                if (!fs.existsSync(scriptPath)) {
                  missing.push(`${pluginDir}/${agentFile} -> ${pathMatch[0]}`);
                }
              }
            }
          } catch {
            // Skip unreadable agent files
          }
        }
      }

      if (checked === 0) {
        return {
          status: 'skip',
          message: 'No script references found in agents',
          remediation: null,
          autoFixable: false,
          durationMs: Date.now() - startMs,
        };
      }

      if (missing.length === 0) {
        return {
          status: 'pass',
          message: `${checked} script references verified`,
          remediation: null,
          autoFixable: false,
          durationMs: Date.now() - startMs,
        };
      }

      return {
        status: 'warn',
        message: `${missing.length} broken script reference(s): ${missing.slice(0, 2).join('; ')}${missing.length > 2 ? ` (+${missing.length - 2} more)` : ''}`,
        remediation: 'Review agent files for incorrect script paths',
        autoFixable: false,
        durationMs: Date.now() - startMs,
      };
    } catch (err) {
      return {
        status: 'warn',
        message: `Script path check error: ${err.message}`,
        remediation: null,
        autoFixable: false,
        durationMs: Date.now() - startMs,
      };
    }
  },
};
