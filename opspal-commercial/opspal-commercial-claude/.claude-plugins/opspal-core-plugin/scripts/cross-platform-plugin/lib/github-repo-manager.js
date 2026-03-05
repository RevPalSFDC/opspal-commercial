#!/usr/bin/env node

/**
 * GitHub Repository Manager
 *
 * Manages GitHub repository operations for Project Connect workflow.
 * Uses gh CLI for all operations to leverage existing authentication.
 *
 * Features:
 * - Find existing repositories by customer/customerId/aliases
 * - Create new repositories with standardized naming
 * - Connect to existing repositories
 * - Idempotent operations (safe to retry)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class GitHubRepoManager {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.dryRun = options.dryRun || false;
    this.defaultVisibility = options.defaultVisibility || 'private';
    this.orgName = options.orgName || null; // null = user account

    // Verify gh CLI is available
    try {
      execSync('gh --version', { stdio: 'pipe' });
    } catch (error) {
      throw new Error('GitHub CLI (gh) not found. Install from https://cli.github.com/');
    }

    this.log('GitHubRepoManager initialized', {
      dryRun: this.dryRun,
      defaultVisibility: this.defaultVisibility,
      orgName: this.orgName || 'user account'
    });
  }

  /**
   * Find existing repository by customer information
   *
   * @param {Object} options
   * @param {string} [options.customerId] - Customer ID (e.g., RP-ACM123456)
   * @param {string} [options.customer] - Customer name (e.g., "Acme Robotics")
   * @param {string[]} [options.aliases] - Customer aliases
   * @returns {Promise<{exists: boolean, url?: string, name?: string, description?: string}>}
   */
  async findRepo({ customerId, customer, aliases = [] }) {
    this.log('Finding repository', { customerId, customer, aliases });

    try {
      // Build search patterns
      const searchPatterns = [];

      if (customerId) {
        searchPatterns.push(`revpal-${customerId.toLowerCase()}`);
      }

      if (customer) {
        const slug = this._slugify(customer);
        searchPatterns.push(`revpal-${slug}`);
        searchPatterns.push(slug);
      }

      if (aliases && aliases.length > 0) {
        aliases.forEach(alias => {
          const slugAlias = this._slugify(alias);
          searchPatterns.push(`revpal-${slugAlias}`);
          searchPatterns.push(slugAlias);
        });
      }

      this.log('Search patterns', searchPatterns);

      // List repositories and search
      const listCmd = this.orgName
        ? `gh repo list ${this.orgName} --json name,url,description --limit 100`
        : 'gh repo list --json name,url,description --limit 100';

      const output = execSync(listCmd, { encoding: 'utf-8' });
      const repos = JSON.parse(output);

      // Find matching repository
      for (const pattern of searchPatterns) {
        const match = repos.find(repo =>
          repo.name.toLowerCase().includes(pattern.toLowerCase())
        );

        if (match) {
          this.log('Repository found', match);

          // Verify this is not a false match
          const isFalseMatch = this._detectFalseMatch(match, customer, customerId);

          if (isFalseMatch.isFalseMatch) {
            this.log('False match detected', isFalseMatch);
            continue;
          }

          return {
            exists: true,
            url: match.url,
            name: match.name,
            description: match.description
          };
        }
      }

      this.log('No repository found');
      return { exists: false };

    } catch (error) {
      throw new Error(`Failed to search repositories: ${error.message}`);
    }
  }

  /**
   * Create new repository
   *
   * @param {Object} options
   * @param {string} options.name - Repository name
   * @param {string} [options.visibility] - 'public' or 'private' (default: private)
   * @param {string} [options.description] - Repository description
   * @param {Object} [options.metadata] - Additional metadata (stored in description)
   * @returns {Promise<{url: string, name: string, created: boolean}>}
   */
  async createRepo({ name, visibility = null, description = '', metadata = {} }) {
    this.log('Creating repository', { name, visibility, description });

    // Validate name
    if (!name || typeof name !== 'string') {
      throw new Error('Repository name is required and must be a string');
    }

    // Check if repo already exists
    const existing = await this._repoExists(name);
    if (existing.exists) {
      this.log('Repository already exists', existing);
      return {
        url: existing.url,
        name: existing.name,
        created: false
      };
    }

    if (this.dryRun) {
      this.log('[DRY RUN] Would create repository', { name, visibility: visibility || this.defaultVisibility });
      return {
        url: `https://github.com/${this.orgName || 'user'}/${name}`,
        name,
        created: false,
        dryRun: true
      };
    }

    try {
      // Build description with metadata
      let fullDescription = description;
      if (metadata && Object.keys(metadata).length > 0) {
        fullDescription += `\n\nMetadata: ${JSON.stringify(metadata)}`;
      }

      // Build create command
      const visibilityFlag = visibility === 'public' ? '--public' : '--private';
      const orgFlag = this.orgName ? `--org ${this.orgName}` : '';

      const createCmd = [
        'gh', 'repo', 'create',
        this.orgName ? `${this.orgName}/${name}` : name,
        visibilityFlag,
        fullDescription ? `--description "${fullDescription.replace(/"/g, '\\"')}"` : '',
        orgFlag,
        '--confirm'
      ].filter(Boolean).join(' ');

      this.log('Executing create command', createCmd);

      const output = execSync(createCmd, { encoding: 'utf-8' });

      // Extract URL from output
      const urlMatch = output.match(/https:\/\/github\.com\/[^\s]+/);
      const url = urlMatch ? urlMatch[0] : `https://github.com/${this.orgName || 'user'}/${name}`;

      this.log('Repository created', { url, name });

      return {
        url,
        name,
        created: true
      };

    } catch (error) {
      throw new Error(`Failed to create repository: ${error.message}`);
    }
  }

  /**
   * Connect to existing repository (verify it exists and return metadata)
   *
   * @param {string} nameOrUrl - Repository name or URL
   * @returns {Promise<{url: string, name: string, description?: string}>}
   */
  async connectRepo(nameOrUrl) {
    this.log('Connecting to repository', nameOrUrl);

    try {
      // Extract repo name from URL if needed
      let repoName = nameOrUrl;
      if (nameOrUrl.includes('github.com')) {
        const match = nameOrUrl.match(/github\.com\/([^\/]+\/[^\/]+)/);
        if (match) {
          repoName = match[1];
        }
      }

      // Get repository details
      const viewCmd = `gh repo view ${repoName} --json name,url,description`;
      const output = execSync(viewCmd, { encoding: 'utf-8' });
      const repo = JSON.parse(output);

      this.log('Connected to repository', repo);

      return {
        url: repo.url,
        name: repo.name,
        description: repo.description
      };

    } catch (error) {
      throw new Error(`Failed to connect to repository: ${error.message}`);
    }
  }

  /**
   * Generate standardized repository name
   *
   * @param {string} customerId - Customer ID (e.g., RP-ACM123456)
   * @param {string} customer - Customer name (e.g., "Acme Robotics")
   * @returns {string} - Repository name (e.g., revpal-rp-acm123456-acme-robotics)
   */
  generateRepoName(customerId, customer) {
    const slug = this._slugify(customer);
    return `revpal-${customerId.toLowerCase()}-${slug}`;
  }

  /**
   * Delete repository (use with caution!)
   *
   * @param {string} name - Repository name
   * @returns {Promise<{deleted: boolean}>}
   */
  async deleteRepo(name) {
    this.log('Deleting repository', name);

    if (this.dryRun) {
      this.log('[DRY RUN] Would delete repository', name);
      return { deleted: false, dryRun: true };
    }

    try {
      const deleteCmd = `gh repo delete ${this.orgName ? `${this.orgName}/` : ''}${name} --yes`;
      execSync(deleteCmd, { encoding: 'utf-8' });

      this.log('Repository deleted', name);

      return { deleted: true };

    } catch (error) {
      throw new Error(`Failed to delete repository: ${error.message}`);
    }
  }

  /**
   * Check if repository exists
   *
   * @private
   * @param {string} name - Repository name
   * @returns {Promise<{exists: boolean, url?: string, name?: string}>}
   */
  async _repoExists(name) {
    try {
      const fullName = this.orgName ? `${this.orgName}/${name}` : name;
      const viewCmd = `gh repo view ${fullName} --json name,url`;
      const output = execSync(viewCmd, { encoding: 'utf-8' });
      const repo = JSON.parse(output);

      return {
        exists: true,
        url: repo.url,
        name: repo.name
      };
    } catch (error) {
      return { exists: false };
    }
  }

  /**
   * Detect false matches (repository name matches but isn't actually the customer)
   *
   * @private
   * @param {Object} repo - Repository object from GitHub
   * @param {string} customer - Customer name
   * @param {string} customerId - Customer ID
   * @returns {{isFalseMatch: boolean, reason?: string}}
   */
  _detectFalseMatch(repo, customer, customerId) {
    const repoName = repo.name.toLowerCase();
    const repoDesc = (repo.description || '').toLowerCase();

    // Check 1: Repo should contain customer slug
    if (customer) {
      const customerSlug = this._slugify(customer).toLowerCase();
      if (!repoName.includes(customerSlug) && !repoDesc.includes(customerSlug)) {
        return {
          isFalseMatch: true,
          reason: `Repo name/description doesn't contain customer slug: ${customerSlug}`
        };
      }
    }

    // Check 2: Repo should contain customerId if provided
    if (customerId && !repoName.includes(customerId.toLowerCase()) && !repoDesc.includes(customerId.toLowerCase())) {
      return {
        isFalseMatch: true,
        reason: `Repo name/description doesn't contain customer ID: ${customerId}`
      };
    }

    // Check 3: Repo should start with 'revpal-' for standardized repos
    if (!repoName.startsWith('revpal-') && customerId) {
      return {
        isFalseMatch: true,
        reason: 'Repo name doesn\'t follow revpal-{customerId}-{slug} convention'
      };
    }

    return { isFalseMatch: false };
  }

  /**
   * Convert string to URL-friendly slug
   *
   * @private
   * @param {string} str - Input string
   * @returns {string} - Slugified string
   */
  _slugify(str) {
    return str
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '') // Remove non-word chars (except spaces and hyphens)
      .replace(/\s+/g, '-')     // Replace spaces with hyphens
      .replace(/-+/g, '-');     // Replace multiple hyphens with single hyphen
  }

  /**
   * Log message if verbose mode enabled
   *
   * @private
   * @param {string} message - Log message
   * @param {*} [data] - Optional data to log
   */
  log(message, data = null) {
    if (this.verbose) {
      console.log(`[GitHubRepoManager] ${message}`, data !== null ? data : '');
    }
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.log(`
Usage: node github-repo-manager.js <command> [options]

Commands:
  find       Find repository by customer information
  create     Create new repository
  connect    Connect to existing repository
  delete     Delete repository (use with caution!)

Examples:
  # Find repo
  node github-repo-manager.js find --customer "Acme Robotics" --customerId "RP-ACM123456"

  # Create repo
  node github-repo-manager.js create --name "revpal-rp-acm123456-acme-robotics" --description "Acme Robotics RevPal Project"

  # Connect to repo
  node github-repo-manager.js connect revpal-rp-acm123456-acme-robotics

  # Delete repo
  node github-repo-manager.js delete revpal-rp-acm123456-acme-robotics
    `);
    process.exit(0);
  }

  const parseArgs = (args) => {
    const parsed = {};
    for (let i = 1; i < args.length; i++) {
      if (args[i].startsWith('--')) {
        const key = args[i].substring(2);
        const value = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
        parsed[key] = value;
        if (value !== true) i++;
      }
    }
    return parsed;
  };

  const options = parseArgs(args);
  const manager = new GitHubRepoManager({
    verbose: true,
    dryRun: options['dry-run'] || false,
    orgName: options.org || null
  });

  (async () => {
    try {
      switch (command) {
        case 'find':
          const findResult = await manager.findRepo({
            customerId: options.customerId,
            customer: options.customer,
            aliases: options.aliases ? options.aliases.split(',') : []
          });
          console.log(JSON.stringify(findResult, null, 2));
          break;

        case 'create':
          const createResult = await manager.createRepo({
            name: options.name,
            visibility: options.visibility || 'private',
            description: options.description || ''
          });
          console.log(JSON.stringify(createResult, null, 2));
          break;

        case 'connect':
          const connectResult = await manager.connectRepo(args[1]);
          console.log(JSON.stringify(connectResult, null, 2));
          break;

        case 'delete':
          const deleteResult = await manager.deleteRepo(args[1]);
          console.log(JSON.stringify(deleteResult, null, 2));
          break;

        default:
          console.error(`Unknown command: ${command}`);
          process.exit(1);
      }
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  })();
}

module.exports = GitHubRepoManager;
