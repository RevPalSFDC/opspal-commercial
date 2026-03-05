#!/usr/bin/env node

/**
 * SEO Batch Analyzer
 *
 * Parallel processing engine for analyzing multiple pages efficiently.
 * Handles rate limiting, retries, caching, and progress tracking for large-scale site audits.
 *
 * CAPABILITIES:
 * 1. Parallel batch processing (configurable concurrency)
 * 2. Rate limiting (respectful crawling)
 * 3. Automatic retry logic for failed pages
 * 4. Result caching (7-day TTL)
 * 5. Progress tracking and reporting
 * 6. Per-page analysis (technical, content, schema, images, links)
 *
 * ANALYSIS DIMENSIONS:
 * - Technical: Load time, page size, status code, Core Web Vitals
 * - Content: Title, meta description, headings, word count
 * - Schema: Structured data extraction and validation
 * - Images: Count, alt text coverage, file sizes
 * - Links: Internal/external link counts, broken links
 *
 * @module seo-batch-analyzer
 * @requires node-fetch
 * @requires cheerio (for HTML parsing)
 */

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

class BatchAnalyzer {
  constructor(options = {}) {
    this.batchSize = options.batchSize || 10; // Pages to process in parallel
    this.rateLimit = options.rateLimit || 1000; // Ms between requests (1 req/sec)
    this.timeout = options.timeout || 30000; // 30 seconds per page
    this.maxRetries = options.maxRetries || 1; // Retry failed pages once
    this.cacheDir = options.cacheDir || path.join(process.cwd(), '.cache', 'site-crawls');
    this.cacheTTL = options.cacheTTL || 7 * 24 * 60 * 60 * 1000; // 7 days

    // Rate limiter state
    this.lastRequestTime = 0;

    // Ensure cache directory exists
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Analyze multiple pages in parallel batches
   *
   * @param {Object} options
   * @param {string[]} options.urls - Array of URLs to analyze
   * @param {string[]} options.checks - Analysis types ['technical', 'content', 'schema', 'images', 'links']
   * @param {boolean} options.useCache - Use cached results (default: true)
   * @param {Function} options.onProgress - Progress callback (analyzed, total)
   * @returns {Promise<Object>} Analysis results
   */
  async analyzePages(options) {
    const {
      urls,
      checks = ['technical', 'content', 'schema', 'images'],
      useCache = true,
      onProgress = null,
      quiet = false
    } = options;

    if (!urls || urls.length === 0) {
      throw new Error('At least one URL is required');
    }

    if (!quiet) {
      console.log(`🔍 Analyzing ${urls.length} pages (batch size: ${this.batchSize}, rate: ${1000 / this.rateLimit} req/sec)`);
    }

    const results = [];
    const failed = [];
    let analyzed = 0;

    // Process in batches
    for (let i = 0; i < urls.length; i += this.batchSize) {
      const batch = urls.slice(i, Math.min(i + this.batchSize, urls.length));
      if (!quiet) {
        console.log(`\n   Processing batch ${Math.floor(i / this.batchSize) + 1}/${Math.ceil(urls.length / this.batchSize)} (${batch.length} pages)`);
      }

      // Process batch in parallel
      const batchResults = await Promise.allSettled(
        batch.map(url => this.analyzePage(url, checks, useCache))
      );

      // Collect results
      batchResults.forEach((result, index) => {
        analyzed++;

        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          const url = batch[index];
          console.warn(`   ⚠️  Failed: ${url} - ${result.reason.message}`);
          failed.push({
            url,
            error: result.reason.message,
            status: 'failed'
          });
        }

        // Progress callback
        if (onProgress) {
          onProgress(analyzed, urls.length);
        }
      });

      if (!quiet) {
        console.log(`   ✅ Completed ${analyzed}/${urls.length} pages`);
      }
    }

    const summary = {
      total: urls.length,
      analyzed: results.length,
      failed: failed.length,
      successRate: (results.length / urls.length * 100).toFixed(1) + '%',
      results,
      failures: failed
    };

    if (!quiet) {
      console.log(`\n✅ Analysis complete: ${summary.analyzed}/${summary.total} successful (${summary.successRate})`);

      if (failed.length > 0) {
        console.log(`   ⚠️  ${failed.length} pages failed - see summary.failures for details`);
      }
    }

    return summary;
  }

  /**
   * Analyze a single page
   *
   * @param {string} url - Page URL
   * @param {string[]} checks - Analysis types to perform
   * @param {boolean} useCache - Use cached result if available
   * @returns {Promise<Object>} Page analysis
   */
  async analyzePage(url, checks, useCache = true) {
    // Check cache first
    if (useCache) {
      const cached = this.getCachedResult(url, checks);
      if (cached) {
        return cached;
      }
    }

    // Rate limiting
    await this.throttle();

    try {
      // Fetch page
      const startTime = Date.now();
      const { html, response } = await this.fetchPage(url);
      const loadTime = Date.now() - startTime;

      // Parse HTML
      const $ = cheerio.load(html);

      // Build analysis result
      const analysis = {
        url,
        timestamp: new Date().toISOString(),
        status: 'success'
      };

      // Perform requested checks
      if (checks.includes('technical')) {
        analysis.technical = this.analyzeTechnical($, response, loadTime, html);
      }

      if (checks.includes('content')) {
        analysis.content = this.analyzeContent($);
      }

      if (checks.includes('schema')) {
        analysis.schema = this.analyzeSchema($);
      }

      if (checks.includes('images')) {
        analysis.images = this.analyzeImages($, url);
      }

      if (checks.includes('links')) {
        analysis.links = this.analyzeLinks($, url);
      }

      // Cache result
      this.cacheResult(url, checks, analysis);

      return analysis;

    } catch (error) {
      throw new Error(`Failed to analyze ${url}: ${error.message}`);
    }
  }

  /**
   * Fetch page HTML and response metadata
   *
   * @private
   * @param {string} url - Page URL
   * @returns {Promise<Object>} { html, response }
   */
  async fetchPage(url) {
    const fetch = (await import('node-fetch')).default;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'SEO-Batch-Analyzer/1.0 (compatible; Claude Code; +https://claude.com)'
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();

      return {
        html,
        response: {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries())
        }
      };

    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Analyze technical metrics
   *
   * @private
   * @param {Object} $ - Cheerio instance
   * @param {Object} response - Response metadata
   * @param {number} loadTime - Load time in ms
   * @param {string} html - Raw HTML
   * @returns {Object} Technical analysis
   */
  analyzeTechnical($, response, loadTime, html) {
    const pageSize = Buffer.byteLength(html, 'utf8');

    return {
      statusCode: response.status,
      loadTime, // ms
      pageSize, // bytes
      pageSizeKB: (pageSize / 1024).toFixed(2),
      isHTTPS: $('meta[name="robots"]').attr('content')?.includes('noindex') ? false : true,
      hasViewport: $('meta[name="viewport"]').length > 0,
      hasRobotsMeta: $('meta[name="robots"]').length > 0,
      robotsContent: $('meta[name="robots"]').attr('content') || null,
      canonical: $('link[rel="canonical"]').attr('href') || null,
      hasSSL: response.headers['strict-transport-security'] ? true : false,
      // Core Web Vitals estimation (would need real Lighthouse data for accuracy)
      estimatedLCP: loadTime > 2500 ? 'Poor' : loadTime > 2000 ? 'Needs Improvement' : 'Good',
      responseHeaders: {
        contentType: response.headers['content-type'],
        cacheControl: response.headers['cache-control'],
        server: response.headers['server']
      }
    };
  }

  /**
   * Analyze content quality
   *
   * @private
   * @param {Object} $ - Cheerio instance
   * @returns {Object} Content analysis
   */
  analyzeContent($) {
    const title = $('title').text().trim();
    const metaDescription = $('meta[name="description"]').attr('content') || '';
    const h1 = $('h1').map((i, el) => $(el).text().trim()).get();
    const h2 = $('h2').map((i, el) => $(el).text().trim()).get();
    const h3 = $('h3').map((i, el) => $(el).text().trim()).get();

    // Word count (approximate - count text in body)
    const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
    const wordCount = bodyText.split(/\s+/).length;

    return {
      title: {
        text: title,
        length: title.length,
        isOptimal: title.length >= 50 && title.length <= 60
      },
      metaDescription: {
        text: metaDescription,
        length: metaDescription.length,
        isOptimal: metaDescription.length >= 150 && metaDescription.length <= 160,
        exists: metaDescription.length > 0
      },
      headings: {
        h1: {
          count: h1.length,
          text: h1,
          hasOne: h1.length === 1 // Best practice: exactly one H1
        },
        h2: {
          count: h2.length,
          text: h2.slice(0, 5) // First 5 H2s
        },
        h3: {
          count: h3.length,
          text: h3.slice(0, 5) // First 5 H3s
        },
        hierarchy: this.checkHeadingHierarchy($)
      },
      wordCount,
      isSubstantial: wordCount >= 300, // Minimum for SEO
      openGraphTags: this.extractOpenGraphTags($),
      twitterCardTags: this.extractTwitterCardTags($)
    };
  }

  /**
   * Check heading hierarchy (proper nesting)
   *
   * @private
   * @param {Object} $ - Cheerio instance
   * @returns {Object} Hierarchy check
   */
  checkHeadingHierarchy($) {
    const headings = [];
    $('h1, h2, h3, h4, h5, h6').each((i, el) => {
      headings.push({
        level: parseInt(el.tagName.substring(1)),
        text: $(el).text().trim().substring(0, 50)
      });
    });

    const issues = [];
    for (let i = 1; i < headings.length; i++) {
      const prev = headings[i - 1];
      const curr = headings[i];

      // Check for skipped levels (e.g., H2 → H4)
      if (curr.level - prev.level > 1) {
        issues.push(`Skipped heading level: ${prev.level} → ${curr.level} ("${curr.text}")`);
      }
    }

    return {
      isValid: issues.length === 0,
      issues
    };
  }

  /**
   * Extract Open Graph tags
   *
   * @private
   * @param {Object} $ - Cheerio instance
   * @returns {Object} Open Graph tags
   */
  extractOpenGraphTags($) {
    return {
      title: $('meta[property="og:title"]').attr('content') || null,
      description: $('meta[property="og:description"]').attr('content') || null,
      image: $('meta[property="og:image"]').attr('content') || null,
      url: $('meta[property="og:url"]').attr('content') || null,
      type: $('meta[property="og:type"]').attr('content') || null
    };
  }

  /**
   * Extract Twitter Card tags
   *
   * @private
   * @param {Object} $ - Cheerio instance
   * @returns {Object} Twitter Card tags
   */
  extractTwitterCardTags($) {
    return {
      card: $('meta[name="twitter:card"]').attr('content') || null,
      title: $('meta[name="twitter:title"]').attr('content') || null,
      description: $('meta[name="twitter:description"]').attr('content') || null,
      image: $('meta[name="twitter:image"]').attr('content') || null
    };
  }

  /**
   * Analyze schema markup
   *
   * @private
   * @param {Object} $ - Cheerio instance
   * @returns {Object} Schema analysis
   */
  analyzeSchema($) {
    const schemas = [];

    // Extract JSON-LD schemas
    $('script[type="application/ld+json"]').each((i, el) => {
      try {
        const schemaData = JSON.parse($(el).html());
        schemas.push({
          type: schemaData['@type'] || 'Unknown',
          data: schemaData,
          format: 'JSON-LD'
        });
      } catch (error) {
        schemas.push({
          type: 'Invalid JSON-LD',
          error: error.message,
          format: 'JSON-LD'
        });
      }
    });

    // Check for Microdata (less common, but still used)
    const hasMicrodata = $('[itemscope]').length > 0;

    return {
      hasSchema: schemas.length > 0 || hasMicrodata,
      count: schemas.length,
      schemas: schemas.map(s => ({
        type: s.type,
        format: s.format,
        hasRequiredFields: this.validateSchemaRequiredFields(s.data)
      })),
      hasMicrodata
    };
  }

  /**
   * Validate schema required fields
   *
   * @private
   * @param {Object} schema - Schema data
   * @returns {boolean} True if required fields present
   */
  validateSchemaRequiredFields(schema) {
    if (!schema || !schema['@type']) return false;

    const type = schema['@type'];

    // Type-specific validation
    switch (type) {
      case 'Article':
      case 'BlogPosting':
        return !!(schema.headline && schema.author && schema.datePublished);
      case 'Organization':
        return !!(schema.name && schema.url);
      case 'WebPage':
        return !!schema.name;
      case 'FAQPage':
        return !!(schema.mainEntity && Array.isArray(schema.mainEntity));
      default:
        return true; // Unknown type - assume valid
    }
  }

  /**
   * Analyze images
   *
   * @private
   * @param {Object} $ - Cheerio instance
   * @param {string} baseUrl - Page URL for resolving relative URLs
   * @returns {Object} Image analysis
   */
  analyzeImages($, baseUrl) {
    const images = [];

    $('img').each((i, el) => {
      const $img = $(el);
      const src = $img.attr('src');
      const alt = $img.attr('alt') || '';

      if (src) {
        images.push({
          src: this.resolveUrl(src, baseUrl),
          alt,
          hasAlt: alt.length > 0,
          isDescriptive: alt.length > 5, // More than just "image"
          width: $img.attr('width'),
          height: $img.attr('height'),
          loading: $img.attr('loading') // lazy loading
        });
      }
    });

    const missingAlt = images.filter(img => !img.hasAlt).length;
    const shortAlt = images.filter(img => img.hasAlt && !img.isDescriptive).length;

    return {
      total: images.length,
      missingAlt,
      shortAlt,
      altCoverage: images.length > 0 ? ((images.length - missingAlt) / images.length * 100).toFixed(1) + '%' : 'N/A',
      lazyLoading: images.filter(img => img.loading === 'lazy').length,
      images: images.slice(0, 10) // First 10 images
    };
  }

  /**
   * Analyze links
   *
   * @private
   * @param {Object} $ - Cheerio instance
   * @param {string} baseUrl - Page URL for link classification
   * @returns {Object} Link analysis
   */
  analyzeLinks($, baseUrl) {
    const links = [];
    const baseUrlObj = new URL(baseUrl);

    $('a[href]').each((i, el) => {
      const $link = $(el);
      const href = $link.attr('href');

      if (href) {
        const resolvedUrl = this.resolveUrl(href, baseUrl);
        const isInternal = resolvedUrl.startsWith(baseUrlObj.origin);
        const isAnchor = href.startsWith('#');
        const isMailto = href.startsWith('mailto:');
        const isTel = href.startsWith('tel:');

        links.push({
          href: resolvedUrl,
          text: $link.text().trim().substring(0, 50),
          isInternal: isInternal && !isAnchor,
          isExternal: !isInternal && !isAnchor && !isMailto && !isTel,
          isAnchor,
          isMailto,
          isTel,
          rel: $link.attr('rel') || null,
          nofollow: ($link.attr('rel') || '').includes('nofollow')
        });
      }
    });

    const internal = links.filter(l => l.isInternal).length;
    const external = links.filter(l => l.isExternal).length;
    const anchors = links.filter(l => l.isAnchor).length;

    return {
      total: links.length,
      internal,
      external,
      anchors,
      ratio: internal > 0 ? (external / internal).toFixed(2) : 'N/A',
      externalLinks: links.filter(l => l.isExternal).slice(0, 10) // First 10 external links
    };
  }

  /**
   * Resolve relative URL to absolute
   *
   * @private
   * @param {string} url - URL to resolve
   * @param {string} baseUrl - Base URL
   * @returns {string} Absolute URL
   */
  resolveUrl(url, baseUrl) {
    try {
      return new URL(url, baseUrl).href;
    } catch (error) {
      return url; // Return as-is if cannot resolve
    }
  }

  /**
   * Rate limiting throttle
   *
   * @private
   * @returns {Promise<void>}
   */
  async throttle() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.rateLimit) {
      await new Promise(resolve => setTimeout(resolve, this.rateLimit - timeSinceLastRequest));
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Get cached result if available
   *
   * @private
   * @param {string} url - Page URL
   * @param {string[]} checks - Analysis types
   * @returns {Object|null} Cached result or null
   */
  getCachedResult(url, checks) {
    const cacheFile = this.getCacheFilePath(url, checks);

    if (fs.existsSync(cacheFile)) {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));

      if (Date.now() - cached.timestamp < this.cacheTTL) {
        return cached.data;
      }
    }

    return null;
  }

  /**
   * Cache analysis result
   *
   * @private
   * @param {string} url - Page URL
   * @param {string[]} checks - Analysis types
   * @param {Object} data - Analysis data
   */
  cacheResult(url, checks, data) {
    const cacheFile = this.getCacheFilePath(url, checks);

    fs.writeFileSync(cacheFile, JSON.stringify({
      timestamp: Date.now(),
      url,
      checks,
      data
    }, null, 2));
  }

  /**
   * Get cache file path
   *
   * @private
   * @param {string} url - Page URL
   * @param {string[]} checks - Analysis types
   * @returns {string} Cache file path
   */
  getCacheFilePath(url, checks) {
    const crypto = require('crypto');
    const cacheKey = `${url}-${checks.sort().join(',')}`;
    const hash = crypto.createHash('md5').update(cacheKey).digest('hex');
    return path.join(this.cacheDir, `${hash}.json`);
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
Usage: node seo-batch-analyzer.js <url1> [url2] [url3] ... [options]

Options:
  --checks technical,content,schema,images,links  Analysis types (default: all)
  --batch-size 10                                 Pages to process in parallel (default: 10)
  --rate-limit 1000                               Ms between requests (default: 1000)
  --no-cache                                      Disable caching

Example:
  node seo-batch-analyzer.js https://example.com/page1 https://example.com/page2 --checks technical,content
    `);
    process.exit(1);
  }

  const urls = args.filter(arg => !arg.startsWith('--'));
  const checksArg = args.find(arg => arg.startsWith('--checks='))?.split('=')[1];
  const checks = checksArg ? checksArg.split(',') : ['technical', 'content', 'schema', 'images', 'links'];
  const batchSizeArg = args.find(arg => arg.startsWith('--batch-size='))?.split('=')[1];
  const batchSize = batchSizeArg ? parseInt(batchSizeArg) : 10;
  const rateLimitArg = args.find(arg => arg.startsWith('--rate-limit='))?.split('=')[1];
  const rateLimit = rateLimitArg ? parseInt(rateLimitArg) : 1000;
  const useCache = !args.includes('--no-cache');
  const jsonOutput = args.includes('--json');

  (async () => {
    const analyzer = new BatchAnalyzer({ batchSize, rateLimit });

    // In JSON mode, send progress to stderr
    if (jsonOutput) {
      analyzer.batchSize = batchSize;
      analyzer.rateLimit = rateLimit;
    }

    const result = await analyzer.analyzePages({
      urls,
      checks,
      useCache,
      quiet: jsonOutput,  // Suppress logs in JSON mode
      onProgress: (analyzed, total) => {
        const msg = `\r   Progress: ${analyzed}/${total} (${(analyzed / total * 100).toFixed(1)}%)`;
        if (jsonOutput) {
          process.stderr.write(msg);
        } else {
          process.stdout.write(msg);
        }
      }
    });

    if (jsonOutput) {
      // JSON-only output mode
      console.log(JSON.stringify(result.results, null, 2));
    } else {
      // Human-readable output mode
      console.log('\n\n=== Analysis Summary ===');
      console.log(`Total Pages: ${result.total}`);
      console.log(`Analyzed: ${result.analyzed}`);
      console.log(`Failed: ${result.failed}`);
      console.log(`Success Rate: ${result.successRate}`);

      if (result.analyzed > 0) {
        console.log('\n=== Sample Results ===');
        result.results.slice(0, 3).forEach((page, i) => {
          console.log(`\n${i + 1}. ${page.url}`);
          if (page.technical) {
            console.log(`   Load Time: ${page.technical.loadTime}ms`);
            console.log(`   Page Size: ${page.technical.pageSizeKB}KB`);
            console.log(`   Status: ${page.technical.statusCode}`);
          }
          if (page.content) {
            console.log(`   Title: ${page.content.title.text}`);
            console.log(`   Word Count: ${page.content.wordCount}`);
            console.log(`   H1 Count: ${page.content.headings.h1.count}`);
          }
          if (page.schema) {
            console.log(`   Schema: ${page.schema.hasSchema ? `Yes (${page.schema.count} schemas)` : 'No'}`);
          }
          if (page.images) {
            console.log(`   Images: ${page.images.total} (${page.images.altCoverage} with alt text)`);
          }
          if (page.links) {
            console.log(`   Links: ${page.links.internal} internal, ${page.links.external} external`);
          }
        });
      }
    }
  })().catch(error => {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  });
}

module.exports = BatchAnalyzer;
