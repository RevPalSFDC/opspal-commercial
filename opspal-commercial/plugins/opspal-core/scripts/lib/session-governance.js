#!/usr/bin/env node
'use strict';

/**
 * Session Governance
 *
 * Shared guardrails for browser/UI session artifacts.
 */

const fs = require('fs');
const path = require('path');

const SESSION_FILES_BY_PLATFORM = {
  salesforce: '.salesforce-session.json',
  hubspot: '.hubspot-session.json',
  marketo: '.marketo-session.json',
  generic: '.browser-session.json'
};

function resolveSessionPath(instanceName, platform = 'generic', options = {}) {
  if (!instanceName || typeof instanceName !== 'string') {
    throw new Error('instanceName is required for session governance.');
  }

  const baseDir = options.baseDir || path.join(process.cwd(), 'instances');
  const normalizedPlatform = String(platform || 'generic').toLowerCase();
  const fileName = SESSION_FILES_BY_PLATFORM[normalizedPlatform] || SESSION_FILES_BY_PLATFORM.generic;

  return path.join(baseDir, instanceName, fileName);
}

function readSessionMetadata(sessionPath) {
  const metadata = {
    exists: false,
    path: sessionPath,
    ageHours: null,
    sizeBytes: null,
    modifiedAt: null
  };

  if (!fs.existsSync(sessionPath)) {
    return metadata;
  }

  const stats = fs.statSync(sessionPath);
  metadata.exists = true;
  metadata.sizeBytes = stats.size;
  metadata.modifiedAt = stats.mtime.toISOString();
  metadata.ageHours = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60);

  return metadata;
}

function assertSessionPolicy(sessionMetadata, options = {}) {
  const maxAgeHours = options.maxAgeHours || 24;
  const maxSizeBytes = options.maxSizeBytes || 5 * 1024 * 1024;

  const violations = [];

  if (!sessionMetadata.exists) {
    violations.push({
      code: 'SESSION_MISSING',
      severity: 'warning',
      message: 'No local session state found. Manual authentication may be required.'
    });
  } else {
    if (sessionMetadata.ageHours != null && sessionMetadata.ageHours > maxAgeHours) {
      violations.push({
        code: 'SESSION_STALE',
        severity: 'warning',
        message: `Session age ${sessionMetadata.ageHours.toFixed(2)}h exceeds ${maxAgeHours}h policy.`
      });
    }

    if (sessionMetadata.sizeBytes != null && sessionMetadata.sizeBytes > maxSizeBytes) {
      violations.push({
        code: 'SESSION_SIZE_ANOMALY',
        severity: 'warning',
        message: `Session file size ${sessionMetadata.sizeBytes} exceeds ${maxSizeBytes} bytes.`
      });
    }
  }

  return {
    compliant: violations.length === 0,
    violations
  };
}

function buildSessionTelemetry({ platform, instanceName, authMethod, sessionMetadata }) {
  return {
    platform: platform || 'unknown',
    instance: instanceName || null,
    auth_method: authMethod || null,
    session_exists: Boolean(sessionMetadata?.exists),
    session_age_hours: sessionMetadata?.ageHours ?? null,
    session_size_bytes: sessionMetadata?.sizeBytes ?? null,
    session_modified_at: sessionMetadata?.modifiedAt ?? null
  };
}

module.exports = {
  SESSION_FILES_BY_PLATFORM,
  resolveSessionPath,
  readSessionMetadata,
  assertSessionPolicy,
  buildSessionTelemetry
};
