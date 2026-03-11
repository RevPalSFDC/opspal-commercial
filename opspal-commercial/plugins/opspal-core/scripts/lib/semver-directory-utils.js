#!/usr/bin/env node

'use strict';

const SEMVER_DIR_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

function isVersionLikeName(name) {
  return SEMVER_DIR_PATTERN.test(String(name || ''));
}

function parseSemver(version) {
  const match = String(version || '').match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return null;
  }

  return [
    Number.parseInt(match[1], 10),
    Number.parseInt(match[2], 10),
    Number.parseInt(match[3], 10)
  ];
}

function compareSemverDesc(a, b) {
  const av = parseSemver(a);
  const bv = parseSemver(b);

  if (!av && !bv) {
    return String(b).localeCompare(String(a));
  }
  if (!av) {
    return 1;
  }
  if (!bv) {
    return -1;
  }

  if (av[0] !== bv[0]) {
    return bv[0] - av[0];
  }
  if (av[1] !== bv[1]) {
    return bv[1] - av[1];
  }
  if (av[2] !== bv[2]) {
    return bv[2] - av[2];
  }

  return String(b).localeCompare(String(a));
}

function pickLatestVersion(versions) {
  if (!Array.isArray(versions) || versions.length === 0) {
    return null;
  }

  return [...versions].sort(compareSemverDesc)[0];
}

module.exports = {
  SEMVER_DIR_PATTERN,
  isVersionLikeName,
  parseSemver,
  compareSemverDesc,
  pickLatestVersion
};
