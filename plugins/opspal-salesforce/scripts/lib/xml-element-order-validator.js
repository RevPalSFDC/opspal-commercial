#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const xml2js = require('xml2js');

const CANONICAL_ORDER = {
  CustomObject: [
    'label',
    'pluralLabel',
    'nameField',
    'description',
    'deploymentStatus',
    'sharingModel',
    'enableActivities',
    'enableReports',
    'enableSearch',
    'enableFeeds',
    'compactLayouts',
    'searchLayouts',
    'fieldSets',
    'fields',
    'businessProcesses',
    'recordTypes',
    'sharingReasons',
    'validationRules',
    'webLinks',
    'listViews'
  ],
  Profile: [
    'custom',
    'userLicense',
    'applicationVisibilities',
    'classAccesses',
    'customPermissions',
    'fieldPermissions',
    'flowAccesses',
    'layoutAssignments',
    'loginHours',
    'loginIpRanges',
    'objectPermissions',
    'pageAccesses',
    'recordTypeVisibilities',
    'tabVisibilities'
  ],
  PermissionSet: [
    'label',
    'description',
    'applicationVisibilities',
    'classAccesses',
    'customMetadataTypeAccesses',
    'customPermissions',
    'fieldPermissions',
    'flowAccesses',
    'hasActivationRequired',
    'objectPermissions',
    'pageAccesses',
    'recordTypeVisibilities',
    'tabSettings',
    'tabVisibilities',
    'userPermissions'
  ]
};

function normalizeRootType(filePath, parsed) {
  const rootName = Object.keys(parsed || {})[0] || '';
  if (rootName && CANONICAL_ORDER[rootName]) {
    return rootName;
  }

  if (filePath.endsWith('.object-meta.xml')) {
    return 'CustomObject';
  }
  if (filePath.endsWith('.profile-meta.xml')) {
    return 'Profile';
  }
  if (filePath.endsWith('.permissionset-meta.xml')) {
    return 'PermissionSet';
  }

  return rootName || null;
}

function compareKeys(rootType, left, right) {
  const canonical = CANONICAL_ORDER[rootType] || [];
  const leftIndex = canonical.indexOf(left);
  const rightIndex = canonical.indexOf(right);

  if (leftIndex === -1 && rightIndex === -1) {
    return left.localeCompare(right);
  }
  if (leftIndex === -1) {
    return 1;
  }
  if (rightIndex === -1) {
    return -1;
  }
  return leftIndex - rightIndex;
}

function reorderRoot(rootType, rootData) {
  const sorted = {};

  if (rootData.$) {
    sorted.$ = rootData.$;
  }

  const keys = Object.keys(rootData).filter((key) => key !== '$');
  keys.sort((left, right) => compareKeys(rootType, left, right));

  for (const key of keys) {
    sorted[key] = rootData[key];
  }

  return sorted;
}

async function parseXml(filePath) {
  const parser = new xml2js.Parser({
    explicitArray: false,
    preserveChildrenOrder: false
  });
  const xml = await fs.promises.readFile(filePath, 'utf8');
  const parsed = await parser.parseStringPromise(xml);
  return { xml, parsed };
}

function buildXml(parsed) {
  const builder = new xml2js.Builder({
    xmldec: { version: '1.0', encoding: 'UTF-8' },
    renderOpts: { pretty: true, indent: '    ', newline: '\n' }
  });
  return builder.buildObject(parsed);
}

async function validateFile(filePath) {
  const { parsed } = await parseXml(filePath);
  const rootType = normalizeRootType(filePath, parsed);
  const rootData = parsed[rootType];

  if (!rootType || !rootData || !CANONICAL_ORDER[rootType]) {
    return {
      valid: true,
      changed: false,
      filePath,
      rootType,
      message: 'No canonical ordering defined for file'
    };
  }

  const currentKeys = Object.keys(rootData).filter((key) => key !== '$');
  const orderedKeys = [...currentKeys].sort((left, right) => compareKeys(rootType, left, right));
  const changed = currentKeys.join('|') !== orderedKeys.join('|');

  return {
    valid: !changed,
    changed,
    filePath,
    rootType,
    currentKeys,
    orderedKeys
  };
}

async function autofixFile(filePath) {
  const { xml, parsed } = await parseXml(filePath);
  const rootType = normalizeRootType(filePath, parsed);
  const rootData = parsed[rootType];

  if (!rootType || !rootData || !CANONICAL_ORDER[rootType]) {
    return {
      valid: true,
      changed: false,
      filePath,
      rootType,
      message: 'No canonical ordering defined for file'
    };
  }

  const reordered = reorderRoot(rootType, rootData);
  const nextParsed = {
    ...parsed,
    [rootType]: reordered
  };
  const nextXml = buildXml(nextParsed);

  if (nextXml === xml) {
    return {
      valid: true,
      changed: false,
      filePath,
      rootType
    };
  }

  const tempPath = path.join(
    os.tmpdir(),
    `xml-element-order-${process.pid}-${Date.now()}-${path.basename(filePath)}`
  );

  await fs.promises.writeFile(tempPath, nextXml, 'utf8');

  try {
    await fs.promises.writeFile(filePath, nextXml, 'utf8');
  } finally {
    await fs.promises.rm(tempPath, { force: true });
  }

  return {
    valid: true,
    changed: true,
    filePath,
    rootType
  };
}

async function main() {
  const [command, filePath] = process.argv.slice(2);

  if (!command || !filePath) {
    console.error('Usage: node xml-element-order-validator.js <validate|autofix> <file>');
    process.exit(1);
  }

  const runner = command === 'autofix' ? autofixFile : validateFile;
  const result = await runner(path.resolve(filePath));
  console.log(JSON.stringify(result));
  process.exit(result.valid ? 0 : 1);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(JSON.stringify({
      valid: false,
      changed: false,
      error: error.message
    }));
    process.exit(1);
  });
}

module.exports = {
  CANONICAL_ORDER,
  validateFile,
  autofixFile
};
