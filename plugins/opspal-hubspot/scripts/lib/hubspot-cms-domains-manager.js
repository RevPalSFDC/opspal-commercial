/**
 * HubSpot CMS Domains Manager
 *
 * Script library for HubSpot Domains API (v3) operations.
 * Provides read-only domain listing, health checks, and monitoring.
 *
 * Note: The Domains API is read-only. Configuration changes must be
 * made via the HubSpot portal.
 *
 * @requires HUBSPOT_ACCESS_TOKEN - HubSpot API access token
 * @requires HUBSPOT_PORTAL_ID - HubSpot portal ID
 */

const https = require('https');

class HubSpotCMSDomainsManager {
  /**
   * Initialize the Domains Manager
   * @param {Object} config - Configuration object
   * @param {string} config.accessToken - HubSpot access token
   * @param {string} config.portalId - HubSpot portal ID
   */
  constructor(config) {
    if (!config.accessToken) {
      throw new Error('HUBSPOT_ACCESS_TOKEN is required');
    }
    this.accessToken = config.accessToken;
    this.portalId = config.portalId;
    this.baseUrl = 'api.hubapi.com';
    this.basePath = '/cms/v3/domains';
  }

  /**
   * Make an API request to HubSpot
   * @param {string} method - HTTP method
   * @param {string} path - API path
   * @param {Object} data - Request body (for POST/PATCH)
   * @returns {Promise<Object>} API response
   */
  async request(method, path, data = null) {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: this.baseUrl,
        port: 443,
        path: path,
        method: method,
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json'
        }
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const response = body ? JSON.parse(body) : {};
            if (res.statusCode >= 400) {
              const error = new Error(response.message || `HTTP ${res.statusCode}`);
              error.status = res.statusCode;
              error.response = response;
              reject(error);
            } else {
              resolve(response);
            }
          } catch (e) {
            reject(new Error(`Failed to parse response: ${body}`));
          }
        });
      });

      req.on('error', reject);

      if (data) {
        req.write(JSON.stringify(data));
      }

      req.end();
    });
  }

  // ==========================================
  // DOMAIN LISTING OPERATIONS
  // ==========================================

  /**
   * List all connected domains
   * @param {Object} options - Query options
   * @param {number} options.limit - Results per page (default: 100)
   * @param {string} options.after - Pagination cursor
   * @param {string} options.sort - Sort field
   * @returns {Promise<Object>} Paginated domains response
   */
  async listDomains(options = {}) {
    const params = new URLSearchParams();
    if (options.limit) params.append('limit', options.limit);
    if (options.after) params.append('after', options.after);
    if (options.sort) params.append('sort', options.sort);

    const queryString = params.toString();
    const path = queryString ? `${this.basePath}?${queryString}` : this.basePath;

    return await this.request('GET', path);
  }

  /**
   * Get all domains with automatic pagination
   * @returns {Promise<Array>} All domains
   */
  async getAllDomains() {
    const allDomains = [];
    let after = null;

    do {
      const response = await this.listDomains({ limit: 100, after });
      allDomains.push(...(response.results || []));
      after = response.paging?.next?.after || null;
    } while (after);

    return allDomains;
  }

  /**
   * Get domain by ID
   * @param {string} domainId - Domain ID
   * @returns {Promise<Object>} Domain details
   */
  async getDomain(domainId) {
    return await this.request('GET', `${this.basePath}/${domainId}`);
  }

  /**
   * Find domain by name
   * @param {string} domainName - Domain name (e.g., www.example.com)
   * @returns {Promise<Object|null>} Domain if found, null otherwise
   */
  async findDomainByName(domainName) {
    const domains = await this.getAllDomains();
    return domains.find(d => d.domain === domainName) || null;
  }

  // ==========================================
  // PRIMARY DOMAIN OPERATIONS
  // ==========================================

  /**
   * Get primary domains for each content type
   * @returns {Promise<Object>} Primary domains by content type
   */
  async getPrimaryDomains() {
    const domains = await this.getAllDomains();

    const primaryDomains = {
      blog: null,
      sitePage: null,
      landingPage: null,
      email: null,
      knowledge: null
    };

    for (const domain of domains) {
      if (domain.primaryBlogPost && !primaryDomains.blog) {
        primaryDomains.blog = {
          id: domain.id,
          domain: domain.domain,
          isResolving: domain.isResolving,
          isHttpsEnabled: domain.isHttpsEnabled
        };
      }
      if (domain.primarySitePage && !primaryDomains.sitePage) {
        primaryDomains.sitePage = {
          id: domain.id,
          domain: domain.domain,
          isResolving: domain.isResolving,
          isHttpsEnabled: domain.isHttpsEnabled
        };
      }
      if (domain.primaryLandingPage && !primaryDomains.landingPage) {
        primaryDomains.landingPage = {
          id: domain.id,
          domain: domain.domain,
          isResolving: domain.isResolving,
          isHttpsEnabled: domain.isHttpsEnabled
        };
      }
      if (domain.primaryEmail && !primaryDomains.email) {
        primaryDomains.email = {
          id: domain.id,
          domain: domain.domain,
          isResolving: domain.isResolving,
          isHttpsEnabled: domain.isHttpsEnabled
        };
      }
      if (domain.primaryKnowledge && !primaryDomains.knowledge) {
        primaryDomains.knowledge = {
          id: domain.id,
          domain: domain.domain,
          isResolving: domain.isResolving,
          isHttpsEnabled: domain.isHttpsEnabled
        };
      }
    }

    return primaryDomains;
  }

  // ==========================================
  // HEALTH CHECK OPERATIONS
  // ==========================================

  /**
   * Perform comprehensive domain health check
   * @returns {Promise<Object>} Health check report
   */
  async healthCheck() {
    const domains = await this.getAllDomains();

    const report = {
      timestamp: new Date().toISOString(),
      total: domains.length,
      healthy: 0,
      warnings: [],
      errors: [],
      domains: []
    };

    for (const domain of domains) {
      const domainHealth = {
        id: domain.id,
        domain: domain.domain,
        status: 'HEALTHY',
        issues: []
      };

      // Check CNAME resolution (CRITICAL)
      if (!domain.isResolving) {
        domainHealth.status = 'ERROR';
        domainHealth.issues.push({
          type: 'CNAME_NOT_RESOLVING',
          severity: 'CRITICAL',
          message: 'Domain CNAME is not resolving',
          recommendation: 'Verify DNS configuration points to HubSpot'
        });
        report.errors.push({
          domain: domain.domain,
          issue: 'CNAME not resolving',
          severity: 'CRITICAL'
        });
      }

      // Check HTTPS enabled (HIGH)
      if (!domain.isHttpsEnabled) {
        if (domainHealth.status === 'HEALTHY') domainHealth.status = 'WARNING';
        domainHealth.issues.push({
          type: 'HTTPS_NOT_ENABLED',
          severity: 'HIGH',
          message: 'HTTPS is not enabled',
          recommendation: 'Enable HTTPS in HubSpot portal settings'
        });
        report.warnings.push({
          domain: domain.domain,
          issue: 'HTTPS not enabled',
          severity: 'HIGH'
        });
      }

      // Check HTTPS enforcement (MEDIUM)
      if (domain.isHttpsEnabled && !domain.isHttpsOnly) {
        if (domainHealth.status === 'HEALTHY') domainHealth.status = 'WARNING';
        domainHealth.issues.push({
          type: 'HTTPS_NOT_ENFORCED',
          severity: 'MEDIUM',
          message: 'HTTP is not redirected to HTTPS',
          recommendation: 'Enable HTTPS-only mode in portal settings'
        });
        report.warnings.push({
          domain: domain.domain,
          issue: 'HTTPS not enforced',
          severity: 'MEDIUM'
        });
      }

      // Count healthy domains
      if (domainHealth.status === 'HEALTHY') {
        report.healthy++;
      }

      report.domains.push(domainHealth);
    }

    // Calculate health score
    report.healthScore = report.total > 0
      ? Math.round((report.healthy / report.total) * 100)
      : 100;

    return report;
  }

  /**
   * Check HTTPS status for a specific domain
   * @param {string} domainName - Domain name
   * @returns {Promise<Object>} HTTPS status
   */
  async checkHttpsStatus(domainName) {
    const domain = await this.findDomainByName(domainName);

    if (!domain) {
      return {
        domain: domainName,
        found: false,
        status: 'NOT_FOUND',
        message: `Domain ${domainName} not found in HubSpot`
      };
    }

    return {
      domain: domainName,
      found: true,
      id: domain.id,
      isResolving: domain.isResolving,
      https: {
        enabled: domain.isHttpsEnabled,
        enforced: domain.isHttpsOnly
      },
      status: this.getHttpsStatusLabel(domain),
      recommendations: this.getHttpsRecommendations(domain)
    };
  }

  /**
   * Get HTTPS status label
   * @param {Object} domain - Domain object
   * @returns {string} Status label
   */
  getHttpsStatusLabel(domain) {
    if (!domain.isResolving) return 'NOT_RESOLVING';
    if (!domain.isHttpsEnabled) return 'HTTPS_DISABLED';
    if (!domain.isHttpsOnly) return 'HTTPS_NOT_ENFORCED';
    return 'SECURE';
  }

  /**
   * Get HTTPS recommendations for domain
   * @param {Object} domain - Domain object
   * @returns {Array} Recommendations
   */
  getHttpsRecommendations(domain) {
    const recommendations = [];

    if (!domain.isResolving) {
      recommendations.push({
        priority: 1,
        action: 'Fix DNS configuration',
        details: 'CNAME record must point to HubSpot nameservers'
      });
    }

    if (!domain.isHttpsEnabled) {
      recommendations.push({
        priority: 2,
        action: 'Enable HTTPS',
        details: 'Go to Settings > Domains & URLs > Enable SSL'
      });
    }

    if (domain.isHttpsEnabled && !domain.isHttpsOnly) {
      recommendations.push({
        priority: 3,
        action: 'Enforce HTTPS',
        details: 'Enable "Require HTTPS" to redirect all HTTP traffic'
      });
    }

    return recommendations;
  }

  // ==========================================
  // INVENTORY & REPORTING
  // ==========================================

  /**
   * Generate domain inventory report
   * @returns {Promise<Object>} Inventory report
   */
  async generateInventory() {
    const domains = await this.getAllDomains();

    const inventory = {
      generatedAt: new Date().toISOString(),
      portalId: this.portalId,
      totalDomains: domains.length,
      summary: {
        resolving: 0,
        notResolving: 0,
        httpsEnabled: 0,
        httpsDisabled: 0,
        httpsEnforced: 0,
        primaryAssignments: {
          blog: 0,
          sitePage: 0,
          landingPage: 0,
          email: 0,
          knowledge: 0
        }
      },
      domains: []
    };

    for (const domain of domains) {
      // Update summary counts
      if (domain.isResolving) inventory.summary.resolving++;
      else inventory.summary.notResolving++;

      if (domain.isHttpsEnabled) inventory.summary.httpsEnabled++;
      else inventory.summary.httpsDisabled++;

      if (domain.isHttpsOnly) inventory.summary.httpsEnforced++;

      if (domain.primaryBlogPost) inventory.summary.primaryAssignments.blog++;
      if (domain.primarySitePage) inventory.summary.primaryAssignments.sitePage++;
      if (domain.primaryLandingPage) inventory.summary.primaryAssignments.landingPage++;
      if (domain.primaryEmail) inventory.summary.primaryAssignments.email++;
      if (domain.primaryKnowledge) inventory.summary.primaryAssignments.knowledge++;

      // Add domain entry
      inventory.domains.push({
        id: domain.id,
        domain: domain.domain,
        status: domain.isResolving ? 'ACTIVE' : 'NOT_RESOLVING',
        https: {
          enabled: domain.isHttpsEnabled,
          enforced: domain.isHttpsOnly
        },
        primaryFor: this.getPrimaryAssignments(domain),
        timestamps: {
          created: domain.created,
          updated: domain.updated
        }
      });
    }

    return inventory;
  }

  /**
   * Get primary assignments for a domain
   * @param {Object} domain - Domain object
   * @returns {Array} List of content types this domain is primary for
   */
  getPrimaryAssignments(domain) {
    const assignments = [];
    if (domain.primaryBlogPost) assignments.push('Blog');
    if (domain.primarySitePage) assignments.push('Site Pages');
    if (domain.primaryLandingPage) assignments.push('Landing Pages');
    if (domain.primaryEmail) assignments.push('Email');
    if (domain.primaryKnowledge) assignments.push('Knowledge Base');
    return assignments;
  }

  // ==========================================
  // MIGRATION SUPPORT
  // ==========================================

  /**
   * Pre-check for domain migration
   * @param {string} sourceDomain - Source domain name
   * @param {string} targetDomain - Target domain name
   * @returns {Promise<Object>} Migration readiness report
   */
  async migrationPreCheck(sourceDomain, targetDomain) {
    const domains = await this.getAllDomains();

    const source = domains.find(d => d.domain === sourceDomain);
    const target = domains.find(d => d.domain === targetDomain);

    const report = {
      timestamp: new Date().toISOString(),
      sourceDomain,
      targetDomain,
      ready: true,
      checks: [],
      recommendations: []
    };

    // Check source exists
    if (!source) {
      report.checks.push({
        check: 'Source domain exists',
        status: 'FAIL',
        message: `Domain ${sourceDomain} not found in HubSpot`
      });
      report.ready = false;
    } else {
      report.checks.push({
        check: 'Source domain exists',
        status: 'PASS',
        domainId: source.id
      });

      // Document primary assignments
      const sourceAssignments = this.getPrimaryAssignments(source);
      if (sourceAssignments.length > 0) {
        report.checks.push({
          check: 'Primary assignments identified',
          status: 'INFO',
          message: `Source is primary for: ${sourceAssignments.join(', ')}`,
          assignments: sourceAssignments
        });
        report.recommendations.push({
          action: 'Update primary domain assignments',
          details: `Reassign ${sourceAssignments.join(', ')} to target domain after migration`
        });
      }
    }

    // Check target exists
    if (!target) {
      report.checks.push({
        check: 'Target domain exists',
        status: 'FAIL',
        message: `Domain ${targetDomain} not found in HubSpot. Add it via portal settings first.`
      });
      report.ready = false;
    } else {
      report.checks.push({
        check: 'Target domain exists',
        status: 'PASS',
        domainId: target.id
      });

      // Check target CNAME
      if (!target.isResolving) {
        report.checks.push({
          check: 'Target CNAME resolving',
          status: 'FAIL',
          message: 'Target domain CNAME is not resolving. Fix DNS before migration.'
        });
        report.ready = false;
      } else {
        report.checks.push({
          check: 'Target CNAME resolving',
          status: 'PASS'
        });
      }

      // Check target HTTPS
      if (!target.isHttpsEnabled) {
        report.checks.push({
          check: 'Target HTTPS enabled',
          status: 'WARN',
          message: 'Target domain does not have HTTPS enabled'
        });
        report.recommendations.push({
          action: 'Enable HTTPS on target',
          details: 'Enable HTTPS before migration for secure redirects'
        });
      } else {
        report.checks.push({
          check: 'Target HTTPS enabled',
          status: 'PASS'
        });

        if (!target.isHttpsOnly) {
          report.checks.push({
            check: 'Target HTTPS enforced',
            status: 'WARN',
            message: 'Target domain should enforce HTTPS'
          });
          report.recommendations.push({
            action: 'Enforce HTTPS on target',
            details: 'Enable HTTPS-only mode after migration'
          });
        }
      }
    }

    // Add redirect recommendation
    if (report.ready) {
      report.recommendations.push({
        action: 'Set up redirects',
        details: `Use hubspot-cms-redirect-manager to create redirects from ${sourceDomain} to ${targetDomain}`
      });
    }

    return report;
  }
}

module.exports = HubSpotCMSDomainsManager;
