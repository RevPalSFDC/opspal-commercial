#!/usr/bin/env node
'use strict';

/**
 * Emit Automation Event (Marketo)
 *
 * Thin utility for shell hooks to emit normalized automation events.
 */

const path = require('path');
const { AutomationEventEmitter } = require('../../../opspal-core/scripts/lib/automation-event-emitter');

function safeParse(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function main() {
  const payload = safeParse(process.argv[2], {});

  const pluginRoot = path.resolve(__dirname, '../..');
  const emitter = new AutomationEventEmitter({
    source: 'opspal-marketo-hook',
    pluginRoot
  });

  emitter.emit(payload);
}

if (require.main === module) {
  main();
}

module.exports = {
  main
};
