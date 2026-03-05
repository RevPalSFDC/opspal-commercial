#!/usr/bin/env node

/**
 * Domain Enricher
 *
 * Verifies and enriches website domain information for entity matching:
 * - DNS resolution to verify domain is active
 * - HTTP redirect following to find canonical domains
 * - Domain similarity detection for corporate consolidation
 * - Basic WHOIS information extraction
 *
 * Features:
 * - Active domain verification
 * - Redirect chain following
 * - Vanity domain detection
 * - Registrant comparison (when available)
 * - Corporate domain pattern detection
 *
 * Usage:
 *   const { DomainEnricher } = require('./domain-enricher');
 *   const enricher = new DomainEnricher();
 *
 *   const result = await enricher.verifyDomain('example.com');
 *   const shareInfo = await enricher.domainsShareOwnership('company.com', 'company.io');
 */

'use strict';

const dns = require('dns').promises;
const https = require('https');
const http = require('http');
const url = require('url');
const { EnrichmentCache } = require('./enrichment-cache');

// Common corporate domain patterns
const CORPORATE_DOMAIN_PATTERNS = [
  // Same base, different TLD
  { pattern: /^(.+)\.(com|net|org|io|co|biz)$/i, type: 'TLD_VARIANT' },
  // With/without www
  { pattern: /^www\.(.+)$/i, type: 'WWW_PREFIX' },
  // Country variants
  { pattern: /^(.+)\.(co\.uk|com\.au|ca|de|fr|jp)$/i, type: 'COUNTRY_VARIANT' },
  // Corporate subdomains
  { pattern: /^(careers|jobs|blog|support|help|shop|store|my)\.(.+)$/i, type: 'SUBDOMAIN' }
];

// Redirect status codes
const REDIRECT_CODES = [301, 302, 303, 307, 308];

class DomainEnricher {
  constructor(options = {}) {
    // Initialize cache
    this.cache = options.cache || new EnrichmentCache();

    // Configuration
    this.timeout = options.timeout || 10000;
    this.maxRedirects = options.maxRedirects || 5;
    this.followRedirects = options.followRedirects !== false;

    // DNS resolver (can be overridden for testing)
    this.dnsResolver = options.dnsResolver || dns;
  }

  /**
   * Verify if a domain is active and accessible
   * @param {string} domain - Domain to verify (without protocol)
   * @returns {Promise<Object>} Verification result
   */
  async verifyDomain(domain) {
    // Normalize domain
    const normalized = this._normalizeDomain(domain);

    if (!normalized) {
      return {
        active: false,
        domain: domain,
        error: 'Invalid domain format'
      };
    }

    // Check cache
    const cached = this.cache.get('DOMAIN_DNS', normalized);
    if (cached) {
      return { ...cached, fromCache: true };
    }

    const result = {
      active: false,
      domain: normalized,
      dnsRecords: null,
      httpStatus: null,
      redirectChain: [],
      canonicalDomain: null,
      sslValid: null,
      verifiedAt: new Date().toISOString()
    };

    // Step 1: DNS resolution
    try {
      const dnsResult = await this._resolveDNS(normalized);
      result.dnsRecords = dnsResult;
      result.active = dnsResult.hasRecords;
    } catch (error) {
      result.dnsError = error.message;
    }

    // Step 2: HTTP verification (if DNS resolved)
    if (result.active) {
      try {
        const httpResult = await this._verifyHTTP(normalized);
        result.httpStatus = httpResult.status;
        result.redirectChain = httpResult.redirectChain;
        result.canonicalDomain = httpResult.finalDomain;
        result.sslValid = httpResult.sslValid;
      } catch (error) {
        result.httpError = error.message;
      }
    }

    // Cache result
    this.cache.set('DOMAIN_DNS', normalized, result);

    return result;
  }

  /**
   * Check if two domains might share the same owner/registrant
   * @param {string} domainA - First domain
   * @param {string} domainB - Second domain
   * @returns {Promise<Object>} Ownership comparison result
   */
  async domainsShareOwnership(domainA, domainB) {
    const normA = this._normalizeDomain(domainA);
    const normB = this._normalizeDomain(domainB);

    if (!normA || !normB) {
      return {
        likelySameOwner: false,
        confidence: 0,
        error: 'Invalid domain format'
      };
    }

    const result = {
      domainA: normA,
      domainB: normB,
      likelySameOwner: false,
      confidence: 0,
      signals: [],
      verifiedAt: new Date().toISOString()
    };

    // Signal 1: Same base domain with different TLD
    const baseA = this._extractBaseDomain(normA);
    const baseB = this._extractBaseDomain(normB);

    if (baseA === baseB) {
      result.signals.push({
        type: 'SAME_BASE_DOMAIN',
        weight: 40,
        detail: `Both share base domain: ${baseA}`
      });
      result.confidence += 40;
    }

    // Signal 2: Check if one redirects to the other
    const redirectA = await this._checkRedirectsTo(normA, normB);
    const redirectB = await this._checkRedirectsTo(normB, normA);

    if (redirectA || redirectB) {
      result.signals.push({
        type: 'REDIRECT_RELATIONSHIP',
        weight: 50,
        detail: redirectA
          ? `${normA} redirects to ${normB}`
          : `${normB} redirects to ${normA}`
      });
      result.confidence += 50;
    }

    // Signal 3: Check DNS for same IP
    try {
      const ipsA = await this._resolveIPs(normA);
      const ipsB = await this._resolveIPs(normB);
      const sharedIPs = ipsA.filter(ip => ipsB.includes(ip));

      if (sharedIPs.length > 0) {
        result.signals.push({
          type: 'SHARED_IP',
          weight: 20,
          detail: `Shared IP addresses: ${sharedIPs.join(', ')}`
        });
        result.confidence += 20;
      }
    } catch (e) {
      // DNS resolution failed
    }

    // Signal 4: Similar domain pattern
    const patternMatch = this._detectCorporatePattern(normA, normB);
    if (patternMatch) {
      result.signals.push({
        type: 'CORPORATE_PATTERN',
        weight: 15,
        detail: patternMatch
      });
      result.confidence += 15;
    }

    // Determine likely same owner
    result.likelySameOwner = result.confidence >= 50;
    result.confidence = Math.min(result.confidence, 100);

    return result;
  }

  /**
   * Follow redirects to find canonical domain
   * @param {string} domain - Starting domain
   * @returns {Promise<Object>} Redirect chain and final domain
   */
  async detectRedirects(domain) {
    const normalized = this._normalizeDomain(domain);

    if (!normalized) {
      return { error: 'Invalid domain format' };
    }

    // Check cache
    const cached = this.cache.get('DOMAIN_REDIRECT', normalized);
    if (cached) {
      return { ...cached, fromCache: true };
    }

    const result = await this._verifyHTTP(normalized);

    // Cache result
    this.cache.set('DOMAIN_REDIRECT', normalized, result);

    return result;
  }

  /**
   * Extract company name from domain
   * @param {string} domain - Domain to analyze
   * @returns {Object} Extracted company info
   */
  extractCompanyFromDomain(domain) {
    const normalized = this._normalizeDomain(domain);

    if (!normalized) {
      return { error: 'Invalid domain format' };
    }

    // Remove TLD
    const baseDomain = this._extractBaseDomain(normalized);

    // Common patterns to clean
    const cleaned = baseDomain
      .replace(/^(www|get|try|go|my|the)/, '')  // Common prefixes
      .replace(/(inc|llc|corp|co|io|app|hq|online)$/, '')  // Common suffixes
      .replace(/[^a-z0-9]/gi, ' ')  // Replace non-alphanumeric
      .trim();

    // Capitalize words
    const companyName = cleaned
      .split(/\s+/)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

    return {
      domain: normalized,
      baseDomain,
      extractedName: companyName,
      confidence: cleaned.length > 2 ? 0.7 : 0.3
    };
  }

  // ========== Private Methods ==========

  _normalizeDomain(domain) {
    if (!domain) return null;

    // Remove protocol if present
    let normalized = String(domain)
      .toLowerCase()
      .replace(/^https?:\/\//i, '')
      .replace(/\/.*$/, '')  // Remove path
      .replace(/:\d+$/, '')  // Remove port
      .trim();

    // Basic validation
    if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/i.test(normalized)) {
      return null;
    }

    return normalized;
  }

  _extractBaseDomain(domain) {
    // Extract base domain (e.g., "example" from "www.example.com")
    const parts = domain.split('.');

    // Handle common TLDs
    if (parts.length >= 2) {
      // Check for country code TLDs like .co.uk
      if (parts.length >= 3 &&
          ['co', 'com', 'net', 'org', 'ac', 'gov'].includes(parts[parts.length - 2])) {
        return parts[parts.length - 3];
      }
      return parts[parts.length - 2];
    }

    return domain;
  }

  async _resolveDNS(domain) {
    const result = {
      hasRecords: false,
      a: [],
      aaaa: [],
      mx: [],
      ns: []
    };

    try {
      // A records (IPv4)
      result.a = await this.dnsResolver.resolve4(domain).catch(() => []);
      // AAAA records (IPv6)
      result.aaaa = await this.dnsResolver.resolve6(domain).catch(() => []);
      // MX records
      result.mx = await this.dnsResolver.resolveMx(domain).catch(() => []);
      // NS records
      result.ns = await this.dnsResolver.resolveNs(domain).catch(() => []);

      result.hasRecords = result.a.length > 0 || result.aaaa.length > 0;
    } catch (error) {
      // DNS lookup failed
    }

    return result;
  }

  async _resolveIPs(domain) {
    try {
      const records = await this.dnsResolver.resolve4(domain);
      return records || [];
    } catch (e) {
      return [];
    }
  }

  async _verifyHTTP(domain) {
    const result = {
      status: null,
      sslValid: null,
      redirectChain: [],
      finalDomain: domain
    };

    let currentUrl = `https://${domain}`;
    let redirectCount = 0;

    while (redirectCount < this.maxRedirects) {
      const response = await this._httpHead(currentUrl);

      if (!response) {
        // Try HTTP if HTTPS failed
        if (currentUrl.startsWith('https://') && redirectCount === 0) {
          result.sslValid = false;
          currentUrl = currentUrl.replace('https://', 'http://');
          continue;
        }
        break;
      }

      result.status = response.statusCode;
      result.sslValid = currentUrl.startsWith('https://');

      if (REDIRECT_CODES.includes(response.statusCode) && response.headers.location) {
        const redirectTo = this._resolveRedirectUrl(currentUrl, response.headers.location);
        result.redirectChain.push({
          from: currentUrl,
          to: redirectTo,
          status: response.statusCode
        });

        currentUrl = redirectTo;
        redirectCount++;

        // Extract domain from new URL
        const parsed = new URL(redirectTo);
        result.finalDomain = parsed.hostname;
      } else {
        break;
      }
    }

    return result;
  }

  async _checkRedirectsTo(fromDomain, toDomain) {
    try {
      const result = await this._verifyHTTP(fromDomain);
      const normalizedTo = this._normalizeDomain(toDomain);

      // Check if final domain matches target
      return result.finalDomain === normalizedTo ||
             result.redirectChain.some(r => {
               const parsed = new URL(r.to);
               return parsed.hostname === normalizedTo;
             });
    } catch (e) {
      return false;
    }
  }

  _resolveRedirectUrl(baseUrl, location) {
    if (location.startsWith('http://') || location.startsWith('https://')) {
      return location;
    }

    const base = new URL(baseUrl);

    if (location.startsWith('//')) {
      return `${base.protocol}${location}`;
    }

    if (location.startsWith('/')) {
      return `${base.protocol}//${base.host}${location}`;
    }

    // Relative URL
    return `${base.protocol}//${base.host}/${location}`;
  }

  _detectCorporatePattern(domainA, domainB) {
    const baseA = this._extractBaseDomain(domainA);
    const baseB = this._extractBaseDomain(domainB);

    // Same base with different TLD
    if (baseA === baseB && domainA !== domainB) {
      return `Same company name "${baseA}" with different TLDs`;
    }

    // One is subdomain of other
    if (domainA.endsWith(`.${domainB}`) || domainB.endsWith(`.${domainA}`)) {
      return `Subdomain relationship detected`;
    }

    // Similar base (Levenshtein distance <= 2)
    if (this._levenshteinDistance(baseA, baseB) <= 2 && baseA.length > 3) {
      return `Similar base domains: ${baseA} vs ${baseB}`;
    }

    return null;
  }

  _levenshteinDistance(str1, str2) {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  _httpHead(urlString) {
    return new Promise((resolve) => {
      const protocol = urlString.startsWith('https') ? https : http;

      try {
        const parsed = new URL(urlString);

        const options = {
          hostname: parsed.hostname,
          port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
          path: parsed.pathname + parsed.search,
          method: 'HEAD',
          headers: {
            'User-Agent': 'OpsPal-DomainEnricher/1.0'
          },
          timeout: this.timeout,
          rejectUnauthorized: false  // Allow self-signed for verification
        };

        const req = protocol.request(options, (res) => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers
          });
        });

        req.on('error', () => resolve(null));
        req.on('timeout', () => {
          req.destroy();
          resolve(null);
        });

        req.end();
      } catch (e) {
        resolve(null);
      }
    });
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cache.getStats();
  }
}

// Domain signal weights (exported for testing and configuration)
const DOMAIN_SIGNAL_WEIGHTS = {
  SAME_BASE_DOMAIN: 40,
  REDIRECT_RELATIONSHIP: 50,
  SHARED_IP: 20,
  CORPORATE_PATTERN: 15,
  SAME_REGISTRAR: 10,
  SIMILAR_WHOIS_INFO: 25
};

// Export
module.exports = {
  DomainEnricher,
  DOMAIN_SIGNAL_WEIGHTS
};

// CLI Usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const enricher = new DomainEnricher();

  if (args.length === 0) {
    console.log(`
Domain Enricher CLI

Usage:
  node domain-enricher.js verify <domain>              Verify domain is active
  node domain-enricher.js compare <domain1> <domain2>  Check if domains share owner
  node domain-enricher.js redirects <domain>           Follow redirect chain
  node domain-enricher.js extract <domain>             Extract company name

Examples:
  node domain-enricher.js verify google.com
  node domain-enricher.js compare google.com google.co.uk
  node domain-enricher.js redirects www.google.com
  node domain-enricher.js extract salesforce.com
`);
    process.exit(0);
  }

  const command = args[0];

  (async () => {
    if (command === 'verify') {
      const domain = args[1];
      if (!domain) {
        console.error('Error: Domain required');
        process.exit(1);
      }

      const result = await enricher.verifyDomain(domain);
      console.log('\n=== Domain Verification ===\n');
      console.log(JSON.stringify(result, null, 2));

    } else if (command === 'compare') {
      const domain1 = args[1];
      const domain2 = args[2];

      if (!domain1 || !domain2) {
        console.error('Error: Two domains required');
        process.exit(1);
      }

      const result = await enricher.domainsShareOwnership(domain1, domain2);
      console.log('\n=== Domain Ownership Comparison ===\n');
      console.log(JSON.stringify(result, null, 2));

    } else if (command === 'redirects') {
      const domain = args[1];
      if (!domain) {
        console.error('Error: Domain required');
        process.exit(1);
      }

      const result = await enricher.detectRedirects(domain);
      console.log('\n=== Redirect Chain ===\n');
      console.log(JSON.stringify(result, null, 2));

    } else if (command === 'extract') {
      const domain = args[1];
      if (!domain) {
        console.error('Error: Domain required');
        process.exit(1);
      }

      const result = enricher.extractCompanyFromDomain(domain);
      console.log('\n=== Company Extraction ===\n');
      console.log(JSON.stringify(result, null, 2));

    } else {
      console.error(`Unknown command: ${command}`);
      process.exit(1);
    }

    enricher.cache.close();
    console.log('');
  })();
}
