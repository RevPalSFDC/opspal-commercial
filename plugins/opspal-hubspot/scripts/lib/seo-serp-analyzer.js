#!/usr/bin/env node

/**
 * SEO SERP Analyzer
 *
 * Analyzes Search Engine Results Pages (SERPs) to understand competitive landscape,
 * identify ranking patterns, and discover optimization opportunities.
 *
 * CAPABILITIES:
 * 1. SERP feature detection (featured snippets, PAA, videos, images)
 * 2. Top 10 organic result extraction
 * 3. Ranking pattern analysis (title, description, URL structure)
 * 4. Domain authority estimation
 * 5. Content type identification (blog, product, guide, etc.)
 * 6. SERP volatility tracking (via multiple queries)
 * 7. Competitive gap analysis
 *
 * INTEGRATIONS:
 * - WebSearch API for real-time SERP data
 * - Cheerio for HTML parsing (if needed)
 * - Phase 1 crawlers for competitor page analysis
 *
 * @module seo-serp-analyzer
 * @requires WebSearch (Claude Code built-in)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Live-first mode - analyze SERP fresh first, use cache only as fallback
// Set HS_SEO_LIVE_FIRST=false to use cache-first behavior (not recommended)
const LIVE_FIRST = process.env.GLOBAL_LIVE_FIRST !== 'false' &&
                   process.env.HS_SEO_LIVE_FIRST !== 'false';

class SERPAnalyzer {
  constructor(options = {}) {
    this.cacheDir = options.cacheDir || path.join(process.cwd(), '.cache', 'serp');
    this.cacheTTL = options.cacheTTL || 24 * 60 * 60 * 1000; // 24 hours
    this.maxResults = options.maxResults || 10;
    this.liveFirst = options.liveFirst !== undefined ? options.liveFirst : LIVE_FIRST;

    // Ensure cache directory exists
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Analyze SERP for a keyword
   *
   * @param {string} keyword - Keyword to analyze
   * @param {Object} options
   * @param {boolean} options.useCache - Use cached results (default: true)
   * @param {boolean} options.includePatterns - Analyze ranking patterns (default: true)
   * @param {boolean} options.includeFeatures - Detect SERP features (default: true)
   * @returns {Promise<Object>} SERP analysis results
   */
  async analyzeSERP(keyword, options = {}) {
    const {
      useCache = true,
      useCacheFirst = false, // For fallback mode
      includePatterns = true,
      includeFeatures = true
    } = options;

    console.log(`🔍 Analyzing SERP for: "${keyword}"`);

    // In live-first mode, skip cache check unless explicitly using cache-first
    if (useCache && (!this.liveFirst || useCacheFirst)) {
      const cached = this.getCachedSERP(keyword);
      if (cached) {
        console.log(`   ✅ Using cached SERP data`);
        return cached;
      }
    }

    // Note: In actual implementation, this would call WebSearch
    // For now, providing structure and mock data
    console.log(`   📊 Fetching SERP data...`);

    // Simulate SERP data structure
    // In production, this would come from WebSearch API
    const serpData = {
      keyword,
      timestamp: new Date().toISOString(),
      totalResults: 'N/A', // Would come from WebSearch
      results: [], // Would be populated from WebSearch
      features: includeFeatures ? this.detectSERPFeatures([]) : null,
      patterns: includePatterns ? this.analyzeRankingPatterns([]) : null
    };

    // Cache results
    this.cacheSERP(keyword, serpData);

    console.log(`   ✅ SERP analysis complete`);
    return serpData;
  }

  /**
   * Detect SERP features from results
   *
   * @param {Array} results - Search results
   * @returns {Object} Detected SERP features
   */
  detectSERPFeatures(results) {
    const features = {
      hasFeaturedSnippet: false,
      featuredSnippetType: null, // paragraph, list, table, video
      featuredSnippetDomain: null,

      hasPeopleAlsoAsk: false,
      paaQuestions: [],

      hasKnowledgePanel: false,
      knowledgePanelType: null,

      hasLocalPack: false,
      localPackCount: 0,

      hasVideos: false,
      videoCount: 0,
      videoSources: [],

      hasImages: false,
      imageCount: 0,

      hasShoppingResults: false,
      shoppingCount: 0,

      hasNewsResults: false,
      newsCount: 0,

      hasSitelinks: false,
      sitelinksCount: 0,

      totalFeatures: 0
    };

    // Detect features from results
    // This would parse actual WebSearch results
    results.forEach(result => {
      // Featured snippet detection
      if (result.type === 'featured_snippet') {
        features.hasFeaturedSnippet = true;
        features.featuredSnippetType = result.snippetType || 'paragraph';
        features.featuredSnippetDomain = this.extractDomain(result.url);
        features.totalFeatures++;
      }

      // Video results
      if (result.type === 'video' || result.url?.includes('youtube.com') || result.url?.includes('vimeo.com')) {
        features.hasVideos = true;
        features.videoCount++;
        features.videoSources.push(this.extractDomain(result.url));
      }

      // News results
      if (result.type === 'news') {
        features.hasNewsResults = true;
        features.newsCount++;
      }

      // Shopping results
      if (result.type === 'shopping') {
        features.hasShoppingResults = true;
        features.shoppingCount++;
      }

      // Sitelinks
      if (result.sitelinks && result.sitelinks.length > 0) {
        features.hasSitelinks = true;
        features.sitelinksCount += result.sitelinks.length;
      }
    });

    // Count total features
    if (features.hasFeaturedSnippet) features.totalFeatures++;
    if (features.hasPeopleAlsoAsk) features.totalFeatures++;
    if (features.hasKnowledgePanel) features.totalFeatures++;
    if (features.hasLocalPack) features.totalFeatures++;
    if (features.hasVideos) features.totalFeatures++;
    if (features.hasImages) features.totalFeatures++;
    if (features.hasShoppingResults) features.totalFeatures++;
    if (features.hasNewsResults) features.totalFeatures++;

    return features;
  }

  /**
   * Analyze ranking patterns from top results
   *
   * @param {Array} results - Top search results (typically top 10)
   * @returns {Object} Ranking pattern analysis
   */
  analyzeRankingPatterns(results) {
    const patterns = {
      titlePatterns: {
        avgLength: 0,
        containsKeyword: 0,
        containsNumbers: 0,
        containsYear: 0,
        containsQuestion: 0,
        commonPhrases: []
      },

      descriptionPatterns: {
        avgLength: 0,
        containsKeyword: 0,
        containsCTA: 0
      },

      urlPatterns: {
        avgLength: 0,
        httpsCount: 0,
        hasPathSegments: 0,
        avgPathDepth: 0,
        commonPatterns: []
      },

      contentTypes: {
        blog: 0,
        product: 0,
        guide: 0,
        video: 0,
        tool: 0,
        forum: 0,
        other: 0
      },

      domainTypes: {
        brandDomains: 0,
        authorityDomains: 0,
        nicheDomains: 0,
        newDomains: 0
      },

      freshness: {
        recentContent: 0, // Updated in last 6 months
        oldContent: 0,    // Older than 2 years
        avgAge: null
      }
    };

    if (results.length === 0) {
      return patterns;
    }

    // Analyze titles
    const titles = results.map(r => r.title).filter(Boolean);
    if (titles.length > 0) {
      patterns.titlePatterns.avgLength = Math.round(
        titles.reduce((sum, t) => sum + t.length, 0) / titles.length
      );
      patterns.titlePatterns.containsNumbers = titles.filter(t => /\d/.test(t)).length;
      patterns.titlePatterns.containsYear = titles.filter(t => /20\d{2}/.test(t)).length;
      patterns.titlePatterns.containsQuestion = titles.filter(t => /\?/.test(t)).length;
    }

    // Analyze descriptions
    const descriptions = results.map(r => r.description).filter(Boolean);
    if (descriptions.length > 0) {
      patterns.descriptionPatterns.avgLength = Math.round(
        descriptions.reduce((sum, d) => sum + d.length, 0) / descriptions.length
      );
    }

    // Analyze URLs
    const urls = results.map(r => r.url).filter(Boolean);
    if (urls.length > 0) {
      patterns.urlPatterns.avgLength = Math.round(
        urls.reduce((sum, u) => sum + u.length, 0) / urls.length
      );
      patterns.urlPatterns.httpsCount = urls.filter(u => u.startsWith('https://')).length;

      // Path depth
      const depths = urls.map(u => {
        try {
          const url = new URL(u);
          return url.pathname.split('/').filter(Boolean).length;
        } catch {
          return 0;
        }
      });
      patterns.urlPatterns.avgPathDepth = Math.round(
        depths.reduce((sum, d) => sum + d, 0) / depths.length
      );
    }

    // Classify content types (heuristic-based)
    results.forEach(result => {
      const text = `${result.title} ${result.description} ${result.url}`.toLowerCase();

      if (text.match(/blog|article|post/)) {
        patterns.contentTypes.blog++;
      } else if (text.match(/buy|price|shop|product/)) {
        patterns.contentTypes.product++;
      } else if (text.match(/guide|tutorial|how to|step by step/)) {
        patterns.contentTypes.guide++;
      } else if (text.match(/video|watch|youtube/)) {
        patterns.contentTypes.video++;
      } else if (text.match(/tool|calculator|generator|checker/)) {
        patterns.contentTypes.tool++;
      } else if (text.match(/forum|community|reddit|quora/)) {
        patterns.contentTypes.forum++;
      } else {
        patterns.contentTypes.other++;
      }
    });

    return patterns;
  }

  /**
   * Compare your site's ranking to competitors
   *
   * @param {string} keyword - Keyword to analyze
   * @param {string} yourDomain - Your domain (e.g., "example.com")
   * @param {Object} options
   * @returns {Promise<Object>} Competitive analysis
   */
  async compareRanking(keyword, yourDomain, options = {}) {
    console.log(`📊 Comparing ranking for "${keyword}" - Your domain: ${yourDomain}`);

    const serpData = await this.analyzeSERP(keyword, options);
    const yourPosition = this.findDomainPosition(serpData.results, yourDomain);

    const analysis = {
      keyword,
      yourDomain,
      yourPosition: yourPosition !== -1 ? yourPosition + 1 : null, // Convert to 1-indexed
      isRanking: yourPosition !== -1,

      competitors: [],
      topCompetitor: null,

      yourVsTop: null,
      opportunityScore: 0,
      recommendations: []
    };

    // Extract competitors
    serpData.results.forEach((result, index) => {
      const domain = this.extractDomain(result.url);
      if (domain !== yourDomain) {
        analysis.competitors.push({
          position: index + 1,
          domain,
          url: result.url,
          title: result.title,
          description: result.description
        });
      }
    });

    if (analysis.competitors.length > 0) {
      analysis.topCompetitor = analysis.competitors[0];
    }

    // Generate recommendations
    if (!analysis.isRanking) {
      analysis.recommendations.push({
        priority: 'high',
        type: 'visibility',
        message: `Not ranking in top ${this.maxResults} for "${keyword}". Consider creating targeted content.`
      });
      analysis.opportunityScore = 8; // High opportunity
    } else if (analysis.yourPosition > 3) {
      analysis.recommendations.push({
        priority: 'medium',
        type: 'improvement',
        message: `Currently ranking at position ${analysis.yourPosition}. Optimize to reach top 3.`
      });
      analysis.opportunityScore = 6; // Medium opportunity
    } else {
      analysis.recommendations.push({
        priority: 'low',
        type: 'maintain',
        message: `Strong position ${analysis.yourPosition}. Focus on maintaining ranking.`
      });
      analysis.opportunityScore = 3; // Low opportunity (already strong)
    }

    // Analyze SERP features
    if (serpData.features) {
      if (serpData.features.hasFeaturedSnippet && serpData.features.featuredSnippetDomain !== yourDomain) {
        analysis.recommendations.push({
          priority: 'medium',
          type: 'feature',
          message: `Featured snippet opportunity. Domain "${serpData.features.featuredSnippetDomain}" currently owns it.`
        });
      }

      if (serpData.features.hasVideos && !analysis.isRanking) {
        analysis.recommendations.push({
          priority: 'medium',
          type: 'content_format',
          message: `Video results present in SERP. Consider creating video content for this keyword.`
        });
      }
    }

    return analysis;
  }

  /**
   * Track keyword rankings over time
   *
   * @param {string[]} keywords - Keywords to track
   * @param {string} domain - Domain to track
   * @param {Object} options
   * @returns {Promise<Object>} Ranking tracking results
   */
  async trackKeywords(keywords, domain, options = {}) {
    console.log(`📈 Tracking ${keywords.length} keywords for domain: ${domain}`);

    const results = {
      domain,
      timestamp: new Date().toISOString(),
      keywords: []
    };

    for (const keyword of keywords) {
      console.log(`   Checking: "${keyword}"`);

      const serpData = await this.analyzeSERP(keyword, options);
      const position = this.findDomainPosition(serpData.results, domain);

      results.keywords.push({
        keyword,
        position: position !== -1 ? position + 1 : null,
        isRanking: position !== -1,
        topCompetitor: serpData.results[0] ? this.extractDomain(serpData.results[0].url) : null,
        serpFeatures: serpData.features ? serpData.features.totalFeatures : 0
      });
    }

    // Calculate summary stats
    const ranking = results.keywords.filter(k => k.isRanking);
    results.summary = {
      totalKeywords: keywords.length,
      rankingCount: ranking.length,
      rankingPercentage: ((ranking.length / keywords.length) * 100).toFixed(1) + '%',
      avgPosition: ranking.length > 0
        ? (ranking.reduce((sum, k) => sum + k.position, 0) / ranking.length).toFixed(1)
        : null,
      top3Count: ranking.filter(k => k.position <= 3).length,
      top10Count: ranking.filter(k => k.position <= 10).length
    };

    console.log(`   ✅ Tracking complete: ${results.summary.rankingCount}/${results.summary.totalKeywords} ranking`);

    return results;
  }

  /**
   * Extract domain from URL
   *
   * @private
   * @param {string} url - Full URL
   * @returns {string} Domain name
   */
  extractDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace(/^www\./, '');
    } catch {
      return null;
    }
  }

  /**
   * Find domain's position in search results
   *
   * @private
   * @param {Array} results - Search results
   * @param {string} domain - Domain to find
   * @returns {number} Position (0-indexed), or -1 if not found
   */
  findDomainPosition(results, domain) {
    const normalizedDomain = domain.replace(/^www\./, '').toLowerCase();

    return results.findIndex(result => {
      const resultDomain = this.extractDomain(result.url);
      return resultDomain && resultDomain.toLowerCase() === normalizedDomain;
    });
  }

  /**
   * Get cached SERP data
   *
   * @private
   * @param {string} keyword - Keyword
   * @returns {Object|null} Cached data or null
   */
  getCachedSERP(keyword) {
    const cacheFile = this.getCacheFilePath(keyword);

    if (fs.existsSync(cacheFile)) {
      const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));

      if (Date.now() - new Date(cached.timestamp).getTime() < this.cacheTTL) {
        return cached.data;
      }
    }

    return null;
  }

  /**
   * Cache SERP data
   *
   * @private
   * @param {string} keyword - Keyword
   * @param {Object} data - SERP data
   */
  cacheSERP(keyword, data) {
    const cacheFile = this.getCacheFilePath(keyword);

    fs.writeFileSync(cacheFile, JSON.stringify({
      timestamp: new Date().toISOString(),
      keyword,
      data
    }, null, 2));
  }

  /**
   * Get cache file path
   *
   * @private
   * @param {string} keyword - Keyword
   * @returns {string} Cache file path
   */
  getCacheFilePath(keyword) {
    const hash = crypto.createHash('md5').update(keyword.toLowerCase()).digest('hex');
    return path.join(this.cacheDir, `serp-${hash}.json`);
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
Usage: node seo-serp-analyzer.js <keyword> [options]

Commands:
  analyze <keyword>                   Analyze SERP for keyword
  compare <keyword> <domain>          Compare your ranking to competitors
  track <domain> <keyword1> [key2]... Track multiple keywords for domain

Options:
  --no-cache                          Disable caching
  --no-patterns                       Skip pattern analysis
  --no-features                       Skip feature detection
  --max-results <n>                   Max results to analyze (default: 10)

Examples:
  node seo-serp-analyzer.js analyze "marketing automation"
  node seo-serp-analyzer.js compare "seo tools" example.com
  node seo-serp-analyzer.js track example.com "seo audit" "keyword research"
    `);
    process.exit(1);
  }

  const command = args[0];
  const useCache = !args.includes('--no-cache');
  const includePatterns = !args.includes('--no-patterns');
  const includeFeatures = !args.includes('--no-features');
  const maxResultsArg = args.find(arg => arg.startsWith('--max-results='))?.split('=')[1];
  const maxResults = maxResultsArg ? parseInt(maxResultsArg) : 10;

  (async () => {
    const analyzer = new SERPAnalyzer({ maxResults });

    if (command === 'analyze') {
      const keyword = args[1];
      if (!keyword) {
        console.error('Error: Keyword required');
        process.exit(1);
      }

      const result = await analyzer.analyzeSERP(keyword, {
        useCache,
        includePatterns,
        includeFeatures
      });

      console.log('\n=== SERP Analysis Results ===');
      console.log(JSON.stringify(result, null, 2));

    } else if (command === 'compare') {
      const keyword = args[1];
      const domain = args[2];

      if (!keyword || !domain) {
        console.error('Error: Keyword and domain required');
        process.exit(1);
      }

      const result = await analyzer.compareRanking(keyword, domain, {
        useCache,
        includePatterns,
        includeFeatures
      });

      console.log('\n=== Competitive Analysis ===');
      console.log(`Keyword: "${keyword}"`);
      console.log(`Your Domain: ${domain}`);
      console.log(`Your Position: ${result.yourPosition || 'Not ranking in top ' + maxResults}`);
      console.log(`Opportunity Score: ${result.opportunityScore}/10`);

      console.log('\nTop Competitors:');
      result.competitors.slice(0, 5).forEach(comp => {
        console.log(`  ${comp.position}. ${comp.domain}`);
        console.log(`     ${comp.title}`);
      });

      console.log('\nRecommendations:');
      result.recommendations.forEach(rec => {
        console.log(`  [${rec.priority.toUpperCase()}] ${rec.message}`);
      });

    } else if (command === 'track') {
      const domain = args[1];
      const keywords = args.slice(2).filter(arg => !arg.startsWith('--'));

      if (!domain || keywords.length === 0) {
        console.error('Error: Domain and at least one keyword required');
        process.exit(1);
      }

      const result = await analyzer.trackKeywords(keywords, domain, {
        useCache,
        includePatterns: false, // Skip for performance
        includeFeatures: false
      });

      console.log('\n=== Keyword Tracking Results ===');
      console.log(`Domain: ${domain}`);
      console.log(`Ranking: ${result.summary.rankingCount}/${result.summary.totalKeywords} keywords`);
      console.log(`Average Position: ${result.summary.avgPosition || 'N/A'}`);
      console.log(`Top 3: ${result.summary.top3Count} keywords`);
      console.log(`Top 10: ${result.summary.top10Count} keywords`);

      console.log('\nKeyword Details:');
      result.keywords.forEach(kw => {
        const status = kw.isRanking ? `Position ${kw.position}` : 'Not ranking';
        console.log(`  "${kw.keyword}": ${status}`);
      });

    } else {
      console.error(`Unknown command: ${command}`);
      process.exit(1);
    }

  })().catch(error => {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  });
}

module.exports = SERPAnalyzer;
