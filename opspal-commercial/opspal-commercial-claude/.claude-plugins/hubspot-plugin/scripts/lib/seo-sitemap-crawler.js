#!/usr/bin/env node

/**
 * SEO Sitemap Crawler
 *
 * Parses XML sitemaps to discover all site pages for comprehensive SEO analysis.
 * Supports sitemap index files, compressed sitemaps, and robots.txt sitemap discovery.
 *
 * CAPABILITIES:
 * 1. Automatic sitemap discovery (standard locations + robots.txt)
 * 2. XML sitemap parsing (URLs, lastmod, changefreq, priority)
 * 3. Sitemap index support (nested sitemaps)
 * 4. Compressed sitemap handling (.xml.gz)
 * 5. Sitemap validation (structure, URLs, priorities)
 * 6. Multi-language sitemap support (hreflang)
 *
 * STANDARDS COMPLIANCE:
 * - Sitemaps.org protocol specification
 * - Google Search Console sitemap guidelines
 * - Bing Webmaster Tools sitemap standards
 *
 * @module seo-sitemap-crawler
 * @requires node-fetch (for sitemap fetching)
 * @requires xml2js (for XML parsing)
 */

const fs = require('fs');
const path = require('path');
const { parseString } = require('xml2js');
const { promisify } = require('util');
const zlib = require('zlib');

const parseXML = promisify(parseString);
const gunzip = promisify(zlib.gunzip);

class SitemapCrawler {
  constructor(options = {}) {
    this.cacheDir = options.cacheDir || path.join(process.cwd(), '.cache', 'sitemaps');
    this.cacheTTL = options.cacheTTL || 7 * 24 * 60 * 60 * 1000; // 7 days
    this.maxUrls = options.maxUrls || 50000; // Google limit
    this.timeout = options.timeout || 30000; // 30 seconds

    // Ensure cache directory exists
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Parse sitemap from URL or file path
   *
   * @param {string} sitemapUrl - URL or file path to sitemap.xml
   * @param {Object} options
   * @param {boolean} options.followSitemapIndex - Follow sitemap index files (default: true)
   * @param {boolean} options.useCache - Use cached results if available (default: true)
   * @param {boolean} options.validate - Validate sitemap structure (default: true)
   * @returns {Promise<Object>} Parsed sitemap data
   */
  async parseSitemap(sitemapUrl, options = {}) {
    const {
      followSitemapIndex = true,
      useCache = true,
      validate = true
    } = options;

    console.log(`🗺️  Parsing sitemap: ${sitemapUrl}`);

    // Check cache first
    if (useCache) {
      const cached = this.getCachedSitemap(sitemapUrl);
      if (cached) {
        console.log(`   ✅ Using cached sitemap (${this.getCacheAge(sitemapUrl)} old)`);
        return cached;
      }
    }

    try {
      // Step 1: Fetch sitemap content
      const sitemapContent = await this.fetchSitemap(sitemapUrl);

      // Step 2: Parse XML
      const parsedData = await this.parseXML(sitemapContent);

      // Step 3: Determine sitemap type
      const sitemapType = this.detectSitemapType(parsedData);

      let result;
      if (sitemapType === 'sitemapindex' && followSitemapIndex) {
        // Sitemap index - recursively parse child sitemaps
        result = await this.parseSitemapIndex(parsedData, options);
      } else if (sitemapType === 'urlset') {
        // Standard sitemap - extract URLs
        result = await this.parseURLSet(parsedData);
      } else {
        throw new Error(`Unknown sitemap type: ${sitemapType}`);
      }

      // Step 4: Validate if requested
      if (validate) {
        const validation = this.validateSitemap(result);
        if (!validation.isValid) {
          console.warn(`⚠️  Sitemap validation warnings: ${validation.errors.length} issues found`);
          validation.errors.slice(0, 5).forEach(err => console.warn(`   - ${err}`));
        }
        result.validation = validation;
      }

      // Step 5: Cache result
      this.cacheSitemap(sitemapUrl, result);

      console.log(`✅ Parsed ${result.totalPages} URLs from sitemap`);
      return result;

    } catch (error) {
      console.error(`❌ Failed to parse sitemap: ${error.message}`);
      throw error;
    }
  }

  /**
   * Discover sitemap URLs from multiple sources
   *
   * @param {string} baseUrl - Base URL of website (e.g., https://example.com)
   * @param {Object} options
   * @param {boolean} options.checkStandardLocations - Check /sitemap.xml, /sitemap_index.xml (default: true)
   * @param {boolean} options.checkRobotsTxt - Check robots.txt for sitemap declarations (default: true)
   * @returns {Promise<string[]>} Array of sitemap URLs
   */
  async discoverSitemaps(baseUrl, options = {}) {
    const {
      checkStandardLocations = true,
      checkRobotsTxt = true
    } = options;

    console.log(`🔍 Discovering sitemaps for: ${baseUrl}`);

    const sitemaps = [];
    const baseUrlNormalized = baseUrl.replace(/\/$/, ''); // Remove trailing slash

    // Check standard locations
    if (checkStandardLocations) {
      const standardLocations = [
        `${baseUrlNormalized}/sitemap.xml`,
        `${baseUrlNormalized}/sitemap_index.xml`,
        `${baseUrlNormalized}/sitemap.xml.gz`,
        `${baseUrlNormalized}/sitemap1.xml`
      ];

      for (const url of standardLocations) {
        const exists = await this.checkUrlExists(url);
        if (exists) {
          sitemaps.push(url);
          console.log(`   ✅ Found sitemap: ${url}`);
        }
      }
    }

    // Check robots.txt for sitemap declarations
    if (checkRobotsTxt) {
      try {
        const robotsSitemaps = await this.parseSitemapsFromRobotsTxt(`${baseUrlNormalized}/robots.txt`);
        sitemaps.push(...robotsSitemaps);
        if (robotsSitemaps.length > 0) {
          console.log(`   ✅ Found ${robotsSitemaps.length} sitemaps in robots.txt`);
        }
      } catch (error) {
        console.warn(`   ⚠️  Could not parse robots.txt: ${error.message}`);
      }
    }

    // Deduplicate
    const uniqueSitemaps = [...new Set(sitemaps)];

    if (uniqueSitemaps.length === 0) {
      console.warn('⚠️  No sitemaps found');
    } else {
      console.log(`✅ Discovered ${uniqueSitemaps.length} sitemap(s)`);
    }

    return uniqueSitemaps;
  }

  /**
   * Fetch sitemap content from URL or file
   *
   * @private
   * @param {string} sitemapUrl - URL or file path
   * @returns {Promise<string>} Sitemap content (XML string)
   */
  async fetchSitemap(sitemapUrl) {
    // Check if it's a local file
    if (fs.existsSync(sitemapUrl)) {
      let content = fs.readFileSync(sitemapUrl);

      // Handle gzip compression
      if (sitemapUrl.endsWith('.gz')) {
        content = await gunzip(content);
      }

      return content.toString('utf8');
    }

    // Fetch from URL
    const fetch = (await import('node-fetch')).default;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(sitemapUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'SEO-Sitemap-Crawler/1.0 (compatible; Claude Code; +https://claude.com)'
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      let content = await response.buffer();

      // Only manually decompress if URL ends with .gz
      // (node-fetch automatically handles content-encoding: gzip)
      if (sitemapUrl.endsWith('.gz')) {
        try {
          content = await gunzip(content);
        } catch (error) {
          // If decompression fails, assume it's already decompressed
          console.warn(`   ⚠️  Decompression failed, assuming uncompressed: ${error.message}`);
        }
      }

      return content.toString('utf8');

    } catch (error) {
      clearTimeout(timeoutId);
      throw new Error(`Failed to fetch sitemap: ${error.message}`);
    }
  }

  /**
   * Parse XML content into JavaScript object
   *
   * @private
   * @param {string} xmlContent - XML content
   * @returns {Promise<Object>} Parsed XML object
   */
  async parseXML(xmlContent) {
    try {
      const result = await parseXML(xmlContent, {
        explicitArray: false,
        ignoreAttrs: false,
        trim: true
      });
      return result;
    } catch (error) {
      throw new Error(`Invalid XML: ${error.message}`);
    }
  }

  /**
   * Detect sitemap type (sitemapindex or urlset)
   *
   * @private
   * @param {Object} parsedXML - Parsed XML object
   * @returns {string} 'sitemapindex' or 'urlset'
   */
  detectSitemapType(parsedXML) {
    if (parsedXML.sitemapindex) {
      return 'sitemapindex';
    } else if (parsedXML.urlset) {
      return 'urlset';
    } else {
      throw new Error('Unknown sitemap format - missing <sitemapindex> or <urlset> root element');
    }
  }

  /**
   * Parse sitemap index (nested sitemaps)
   *
   * @private
   * @param {Object} parsedXML - Parsed sitemap index XML
   * @param {Object} options - Parse options
   * @returns {Promise<Object>} Combined sitemap data from all child sitemaps
   */
  async parseSitemapIndex(parsedXML, options) {
    const sitemapIndex = parsedXML.sitemapindex;
    const sitemaps = Array.isArray(sitemapIndex.sitemap) ? sitemapIndex.sitemap : [sitemapIndex.sitemap];

    console.log(`   📑 Sitemap index contains ${sitemaps.length} child sitemaps`);

    const allUrls = [];
    let totalPages = 0;

    // Parse each child sitemap
    for (const sitemap of sitemaps) {
      const sitemapUrl = sitemap.loc;
      console.log(`   🗺️  Parsing child sitemap: ${sitemapUrl}`);

      try {
        const childSitemap = await this.parseSitemap(sitemapUrl, { ...options, followSitemapIndex: false });
        allUrls.push(...childSitemap.urls);
        totalPages += childSitemap.totalPages;
      } catch (error) {
        console.warn(`   ⚠️  Failed to parse child sitemap ${sitemapUrl}: ${error.message}`);
      }
    }

    return {
      type: 'sitemapindex',
      totalPages,
      urls: allUrls,
      childSitemaps: sitemaps.length
    };
  }

  /**
   * Parse URL set (standard sitemap)
   *
   * @private
   * @param {Object} parsedXML - Parsed sitemap XML
   * @returns {Promise<Object>} Sitemap data
   */
  async parseURLSet(parsedXML) {
    const urlset = parsedXML.urlset;
    const urls = Array.isArray(urlset.url) ? urlset.url : [urlset.url];

    const parsedUrls = urls.map(url => ({
      loc: url.loc,
      lastmod: url.lastmod || null,
      changefreq: url.changefreq || null,
      priority: url.priority ? parseFloat(url.priority) : null,
      // Extract hreflang if present (multi-language support)
      hreflang: url['xhtml:link'] ? this.parseHreflang(url['xhtml:link']) : null
    })).filter(url => url.loc); // Filter out invalid entries

    return {
      type: 'urlset',
      totalPages: parsedUrls.length,
      urls: parsedUrls,
      lastModified: this.getMostRecentLastMod(parsedUrls)
    };
  }

  /**
   * Parse hreflang links for multi-language support
   *
   * @private
   * @param {Object|Object[]} hreflangData - Hreflang link data
   * @returns {Object[]} Parsed hreflang links
   */
  parseHreflang(hreflangData) {
    const links = Array.isArray(hreflangData) ? hreflangData : [hreflangData];
    return links.map(link => ({
      hreflang: link.$.hreflang,
      href: link.$.href
    }));
  }

  /**
   * Get most recent lastmod date from URLs
   *
   * @private
   * @param {Object[]} urls - Array of URL objects
   * @returns {string|null} Most recent lastmod date
   */
  getMostRecentLastMod(urls) {
    const dates = urls
      .map(url => url.lastmod)
      .filter(date => date)
      .map(date => new Date(date))
      .filter(date => !isNaN(date.getTime()));

    if (dates.length === 0) return null;

    const mostRecent = new Date(Math.max(...dates));
    return mostRecent.toISOString().split('T')[0]; // Return YYYY-MM-DD
  }

  /**
   * Validate sitemap structure and content
   *
   * @param {Object} sitemap - Parsed sitemap data
   * @returns {Object} Validation result
   */
  validateSitemap(sitemap) {
    const errors = [];
    const warnings = [];

    // Check total URLs doesn't exceed Google limit
    if (sitemap.totalPages > this.maxUrls) {
      errors.push(`Sitemap exceeds Google's 50,000 URL limit (${sitemap.totalPages} URLs)`);
    }

    // Validate individual URLs
    for (const url of sitemap.urls.slice(0, 100)) { // Sample first 100 URLs
      // Check URL is absolute
      if (!url.loc.startsWith('http://') && !url.loc.startsWith('https://')) {
        errors.push(`Relative URL found: ${url.loc} (must be absolute)`);
      }

      // Check priority is in valid range
      if (url.priority !== null && (url.priority < 0 || url.priority > 1)) {
        warnings.push(`Invalid priority for ${url.loc}: ${url.priority} (must be 0.0-1.0)`);
      }

      // Check changefreq is valid
      const validFreqs = ['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'];
      if (url.changefreq && !validFreqs.includes(url.changefreq)) {
        warnings.push(`Invalid changefreq for ${url.loc}: ${url.changefreq}`);
      }
    }

    // Check for duplicate URLs
    const urlSet = new Set();
    const duplicates = [];
    for (const url of sitemap.urls) {
      if (urlSet.has(url.loc)) {
        duplicates.push(url.loc);
      }
      urlSet.add(url.loc);
    }

    if (duplicates.length > 0) {
      warnings.push(`Found ${duplicates.length} duplicate URLs`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Check if URL exists (HEAD request)
   *
   * @private
   * @param {string} url - URL to check
   * @returns {Promise<boolean>} True if URL exists (2xx or 3xx status)
   */
  async checkUrlExists(url) {
    try {
      const fetch = (await import('node-fetch')).default;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        headers: {
          'User-Agent': 'SEO-Sitemap-Crawler/1.0'
        }
      });

      clearTimeout(timeoutId);
      return response.ok || (response.status >= 300 && response.status < 400); // Accept 2xx and 3xx
    } catch (error) {
      return false;
    }
  }

  /**
   * Parse sitemap URLs from robots.txt
   *
   * @private
   * @param {string} robotsTxtUrl - URL to robots.txt
   * @returns {Promise<string[]>} Array of sitemap URLs declared in robots.txt
   */
  async parseSitemapsFromRobotsTxt(robotsTxtUrl) {
    const fetch = (await import('node-fetch')).default;

    try {
      const response = await fetch(robotsTxtUrl);
      if (!response.ok) return [];

      const robotsTxt = await response.text();
      const sitemapLines = robotsTxt
        .split('\n')
        .filter(line => line.trim().toLowerCase().startsWith('sitemap:'));

      const sitemaps = sitemapLines.map(line => {
        const match = line.match(/sitemap:\s*(.+)/i);
        return match ? match[1].trim() : null;
      }).filter(url => url);

      return sitemaps;
    } catch (error) {
      return [];
    }
  }

  /**
   * Get cached sitemap if available and not expired
   *
   * @private
   * @param {string} sitemapUrl - Sitemap URL
   * @returns {Object|null} Cached sitemap or null
   */
  getCachedSitemap(sitemapUrl) {
    const cacheFile = this.getCacheFilePath(sitemapUrl);

    if (fs.existsSync(cacheFile)) {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));

      if (Date.now() - cached.timestamp < this.cacheTTL) {
        return cached.data;
      }
    }

    return null;
  }

  /**
   * Cache sitemap data
   *
   * @private
   * @param {string} sitemapUrl - Sitemap URL
   * @param {Object} data - Sitemap data
   */
  cacheSitemap(sitemapUrl, data) {
    const cacheFile = this.getCacheFilePath(sitemapUrl);

    fs.writeFileSync(cacheFile, JSON.stringify({
      timestamp: Date.now(),
      url: sitemapUrl,
      data
    }, null, 2));
  }

  /**
   * Get cache file path for sitemap URL
   *
   * @private
   * @param {string} sitemapUrl - Sitemap URL
   * @returns {string} Cache file path
   */
  getCacheFilePath(sitemapUrl) {
    const crypto = require('crypto');
    const hash = crypto.createHash('md5').update(sitemapUrl).digest('hex');
    return path.join(this.cacheDir, `${hash}.json`);
  }

  /**
   * Get cache age in human-readable format
   *
   * @private
   * @param {string} sitemapUrl - Sitemap URL
   * @returns {string} Cache age (e.g., "2 days ago")
   */
  getCacheAge(sitemapUrl) {
    const cacheFile = this.getCacheFilePath(sitemapUrl);

    if (fs.existsSync(cacheFile)) {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      const ageMs = Date.now() - cached.timestamp;
      const ageDays = Math.floor(ageMs / (24 * 60 * 60 * 1000));
      const ageHours = Math.floor((ageMs % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));

      if (ageDays > 0) {
        return `${ageDays} day${ageDays > 1 ? 's' : ''} ago`;
      } else if (ageHours > 0) {
        return `${ageHours} hour${ageHours > 1 ? 's' : ''} ago`;
      } else {
        return 'less than 1 hour ago';
      }
    }

    return 'unknown';
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
Usage: node seo-sitemap-crawler.js <sitemap-url> [options]

Examples:
  node seo-sitemap-crawler.js https://example.com/sitemap.xml
  node seo-sitemap-crawler.js https://example.com/sitemap.xml --no-cache
  node seo-sitemap-crawler.js https://example.com/sitemap.xml --validate

Discover sitemaps:
  node seo-sitemap-crawler.js discover https://example.com
    `);
    process.exit(1);
  }

  const command = args[0];

  (async () => {
    const crawler = new SitemapCrawler();

    if (command === 'discover') {
      const baseUrl = args[1];
      if (!baseUrl) {
        console.error('Error: Base URL required for discover command');
        process.exit(1);
      }

      const sitemaps = await crawler.discoverSitemaps(baseUrl);
      console.log('\nDiscovered sitemaps:');
      sitemaps.forEach(url => console.log(`  - ${url}`));
    } else {
      const sitemapUrl = args[0];
      const useCache = !args.includes('--no-cache');
      const validate = args.includes('--validate');

      const result = await crawler.parseSitemap(sitemapUrl, { useCache, validate });

      console.log('\n=== Sitemap Summary ===');
      console.log(`Type: ${result.type}`);
      console.log(`Total URLs: ${result.totalPages}`);
      if (result.lastModified) {
        console.log(`Last Modified: ${result.lastModified}`);
      }
      if (result.childSitemaps) {
        console.log(`Child Sitemaps: ${result.childSitemaps}`);
      }

      if (validate && result.validation) {
        console.log(`\nValidation: ${result.validation.isValid ? '✅ Valid' : '❌ Invalid'}`);
        if (result.validation.errors.length > 0) {
          console.log(`Errors: ${result.validation.errors.length}`);
        }
        if (result.validation.warnings.length > 0) {
          console.log(`Warnings: ${result.validation.warnings.length}`);
        }
      }

      console.log('\nFirst 10 URLs:');
      result.urls.slice(0, 10).forEach((url, i) => {
        console.log(`${i + 1}. ${url.loc}`);
        if (url.lastmod) console.log(`   Last Modified: ${url.lastmod}`);
        if (url.priority !== null) console.log(`   Priority: ${url.priority}`);
      });
    }
  })().catch(error => {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  });
}

module.exports = SitemapCrawler;
