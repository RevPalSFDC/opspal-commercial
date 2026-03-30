'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_API_VERSION = '62.0';
const DEFAULT_LOGIN_URL = 'https://login.salesforce.com';

function sanitizeLabel(label) {
  const normalized = String(label || 'deploy').trim().replace(/[^a-zA-Z0-9._-]+/g, '-');
  return normalized || 'deploy';
}

function createProjectConfig(options = {}) {
  return {
    packageDirectories: [
      {
        path: 'force-app',
        default: true
      }
    ],
    namespace: options.namespace || '',
    sfdcLoginUrl: options.loginUrl || DEFAULT_LOGIN_URL,
    sourceApiVersion: options.apiVersion || DEFAULT_API_VERSION
  };
}

function walkRelativeFiles(rootDir, currentDir = rootDir, results = []) {
  if (!fs.existsSync(currentDir)) {
    return results;
  }

  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  entries.forEach((entry) => {
    const absolutePath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      walkRelativeFiles(rootDir, absolutePath, results);
      return;
    }

    if (entry.isFile()) {
      results.push(path.relative(rootDir, absolutePath).split(path.sep).join('/'));
    }
  });

  return results;
}

function createTempSalesforceProject(label, options = {}) {
  const tempRoot = options.tempRoot || path.join(os.tmpdir(), 'opspal-salesforce-deploys');
  fs.mkdirSync(tempRoot, { recursive: true });

  const rootDir = fs.mkdtempSync(path.join(tempRoot, `${sanitizeLabel(label)}-`));
  const packageDir = path.join(rootDir, 'force-app');
  const metadataDir = path.join(packageDir, 'main', 'default');
  const projectFile = path.join(rootDir, 'sfdx-project.json');
  const forceIgnoreFile = path.join(rootDir, '.forceignore');

  fs.mkdirSync(metadataDir, { recursive: true });
  fs.writeFileSync(projectFile, JSON.stringify(createProjectConfig(options), null, 2));
  fs.writeFileSync(forceIgnoreFile, 'package.xml\n');

  return {
    rootDir,
    packageDir,
    metadataDir,
    projectFile,
    sourceDir: 'force-app',
    writeMetadataFile(relativePath, content) {
      const targetPath = path.join(metadataDir, relativePath);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, content);
      return targetPath;
    },
    copyMetadataFile(sourcePath, relativePath) {
      const targetPath = path.join(metadataDir, relativePath);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.copyFileSync(sourcePath, targetPath);
      return targetPath;
    },
    listFiles() {
      return walkRelativeFiles(rootDir);
    },
    cleanup() {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  };
}

module.exports = {
  createProjectConfig,
  createTempSalesforceProject
};
