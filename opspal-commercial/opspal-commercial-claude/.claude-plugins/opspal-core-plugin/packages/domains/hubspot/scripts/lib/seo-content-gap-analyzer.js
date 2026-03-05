#!/usr/bin/env node

/**
 * SEO Content Gap Analyzer
 *
 * Identifies content and keyword gaps between your site and competitors.
 * Analyzes:
 * - Topic gaps (competitors cover, you don't)
 * - Keyword gaps (competitors rank, you don't)
 * - SERP feature opportunities
 * - Content depth differences
 * - Priority opportunities
 *
 * Usage:
 *   node seo-content-gap-analyzer.js --your-site https://example.com --competitors https://comp1.com,https://comp2.com
 *   node seo-content-gap-analyzer.js --your-crawl ./your-site.json --competitor-crawls ./comp1.json,./comp2.json
 *   node seo-content-gap-analyzer.js --serp-analysis ./serp-results.json --your-site https://example.com
 *
 * Caching: 7-day TTL in .cache/content-gaps/
 *
 * Phase: 2 (Competitor Analysis & SERP Intelligence)
 * Version: 1.0.0
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class ContentGapAnalyzer {
  constructor(options = {}) {
    this.cacheDir = options.cacheDir || path.join(process.cwd(), '.cache', 'content-gaps');
    this.cacheTTL = options.cacheTTL || 7 * 24 * 60 * 60 * 1000; // 7 days
    this.useCache = options.useCache !== false;
  }

  /**
   * Analyze content gaps between your site and competitors
   */
  async analyzeGaps(yourSite, competitors, options = {}) {
    const {
      yourCrawlData = null,
      competitorCrawlData = [],
      serpAnalysis = null,
      includeTopics = true,
      includeKeywords = true,
      includeSERPFeatures = true,
      includeContentDepth = true
    } = options;

    console.log('🔍 Analyzing content gaps...');
    console.log(`   Your site: ${yourSite}`);
    console.log(`   Competitors: ${competitors.length} sites`);

    const gaps = {
      yourSite,
      competitors: competitors.map(c => c.domain || c),
      analyzedAt: new Date().toISOString(),
      topicGaps: [],
      keywordGaps: [],
      serpFeatureGaps: [],
      contentDepthGaps: [],
      recommendations: []
    };

    // Topic gap analysis
    if (includeTopics && yourCrawlData && competitorCrawlData.length > 0) {
      console.log('\n   Analyzing topic gaps...');
      gaps.topicGaps = await this.analyzeTopicGaps(yourCrawlData, competitorCrawlData);
    }

    // Keyword gap analysis
    if (includeKeywords && serpAnalysis) {
      console.log('   Analyzing keyword gaps...');
      gaps.keywordGaps = await this.analyzeKeywordGaps(yourSite, serpAnalysis);
    }

    // SERP feature gap analysis
    if (includeSERPFeatures && serpAnalysis) {
      console.log('   Analyzing SERP feature gaps...');
      gaps.serpFeatureGaps = await this.analyzeSERPFeatureGaps(yourSite, serpAnalysis);
    }

    // Content depth gap analysis
    if (includeContentDepth && yourCrawlData && competitorCrawlData.length > 0) {
      console.log('   Analyzing content depth gaps...');
      gaps.contentDepthGaps = await this.analyzeContentDepthGaps(yourCrawlData, competitorCrawlData);
    }

    // Generate recommendations
    console.log('   Generating recommendations...');
    gaps.recommendations = this.generateRecommendations(gaps);

    // Calculate summary stats
    gaps.summary = this.calculateSummary(gaps);

    console.log('✅ Content gap analysis complete');
    return gaps;
  }

  /**
   * Analyze topic gaps - topics competitors cover but you don't
   */
  async analyzeTopicGaps(yourCrawl, competitorCrawls) {
    const yourTopics = this.extractTopics(yourCrawl);
    const competitorTopics = competitorCrawls.map(crawl => this.extractTopics(crawl));

    const gaps = [];

    // For each competitor
    competitorCrawls.forEach((crawl, idx) => {
      const compTopics = competitorTopics[idx];

      // Find topics competitor has but you don't
      for (const [topic, compPages] of Object.entries(compTopics)) {
        if (!yourTopics[topic] || yourTopics[topic].length === 0) {
          gaps.push({
            topic,
            competitor: crawl.domain || `Competitor ${idx + 1}`,
            competitorPages: compPages.length,
            competitorUrls: compPages.slice(0, 3), // Top 3 examples
            yourCoverage: 0,
            opportunity: this.calculateTopicOpportunity(topic, compPages),
            priority: compPages.length >= 5 ? 'high' : compPages.length >= 2 ? 'medium' : 'low'
          });
        }
      }
    });

    // Deduplicate and prioritize
    const uniqueGaps = this.deduplicateTopicGaps(gaps);
    return uniqueGaps.sort((a, b) => b.opportunity - a.opportunity).slice(0, 50);
  }

  /**
   * Extract topics from crawl data using URL patterns, titles, and keywords
   */
  extractTopics(crawl) {
    const topics = {};

    if (!crawl || !crawl.pages) return topics;

    crawl.pages.forEach(page => {
      // Extract from URL path
      const urlTopics = this.extractTopicsFromUrl(page.url);
      urlTopics.forEach(topic => {
        if (!topics[topic]) topics[topic] = [];
        topics[topic].push({
          url: page.url,
          title: page.title || '',
          wordCount: page.content?.wordCount || 0
        });
      });

      // Extract from title
      const titleTopics = this.extractTopicsFromTitle(page.title || '');
      titleTopics.forEach(topic => {
        if (!topics[topic]) topics[topic] = [];
        if (!topics[topic].find(p => p.url === page.url)) {
          topics[topic].push({
            url: page.url,
            title: page.title || '',
            wordCount: page.content?.wordCount || 0
          });
        }
      });

      // Extract from H1/H2 headings
      if (page.content?.headings) {
        const headingTopics = this.extractTopicsFromHeadings(page.content.headings);
        headingTopics.forEach(topic => {
          if (!topics[topic]) topics[topic] = [];
          if (!topics[topic].find(p => p.url === page.url)) {
            topics[topic].push({
              url: page.url,
              title: page.title || '',
              wordCount: page.content?.wordCount || 0
            });
          }
        });
      }
    });

    return topics;
  }

  /**
   * Extract topics from URL path segments
   */
  extractTopicsFromUrl(url) {
    try {
      const urlObj = new URL(url);
      const segments = urlObj.pathname.split('/').filter(s => s.length > 0);

      return segments
        .filter(seg => seg.length > 3 && !seg.match(/^\d+$/)) // Skip short or numeric
        .map(seg => seg.replace(/-/g, ' ').toLowerCase())
        .filter(topic => {
          // Filter out common noise words
          const noise = ['page', 'post', 'category', 'tag', 'author', 'archive', 'index'];
          return !noise.includes(topic);
        });
    } catch (error) {
      return [];
    }
  }

  /**
   * Extract topics from page title
   */
  extractTopicsFromTitle(title) {
    if (!title) return [];

    // Remove common separators
    const cleaned = title.replace(/[\|\-—–]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

    // Extract key phrases (2-3 words)
    const words = cleaned.split(' ');
    const topics = [];

    // Bigrams
    for (let i = 0; i < words.length - 1; i++) {
      const bigram = `${words[i]} ${words[i + 1]}`;
      if (bigram.length >= 6) topics.push(bigram);
    }

    // Trigrams
    for (let i = 0; i < words.length - 2; i++) {
      const trigram = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
      if (trigram.length >= 10) topics.push(trigram);
    }

    return topics.slice(0, 5); // Limit to top 5
  }

  /**
   * Extract topics from headings
   */
  extractTopicsFromHeadings(headings) {
    if (!headings || !Array.isArray(headings)) return [];

    return headings
      .filter(h => h.level === 'h1' || h.level === 'h2')
      .map(h => h.text.toLowerCase().trim())
      .filter(text => text.length >= 10 && text.length <= 100);
  }

  /**
   * Calculate topic opportunity score
   */
  calculateTopicOpportunity(topic, pages) {
    // Factors:
    // 1. Number of pages (more = higher opportunity)
    // 2. Content depth (word count)
    // 3. Topic breadth (how generic/specific)

    const pageScore = Math.min(10, pages.length * 2);
    const avgWordCount = pages.reduce((sum, p) => sum + (p.wordCount || 0), 0) / pages.length;
    const depthScore = Math.min(10, avgWordCount / 200); // 2000 words = 10
    const breadthScore = topic.split(' ').length >= 3 ? 8 : 5; // Specific = higher

    return Math.round((pageScore * 0.4) + (depthScore * 0.4) + (breadthScore * 0.2));
  }

  /**
   * Deduplicate topic gaps by combining similar topics
   */
  deduplicateTopicGaps(gaps) {
    const unique = new Map();

    gaps.forEach(gap => {
      const normalizedTopic = gap.topic.trim().toLowerCase();

      if (unique.has(normalizedTopic)) {
        // Merge with existing
        const existing = unique.get(normalizedTopic);
        existing.competitorPages += gap.competitorPages;
        existing.competitorUrls.push(...gap.competitorUrls);
        existing.opportunity = Math.max(existing.opportunity, gap.opportunity);
      } else {
        unique.set(normalizedTopic, { ...gap });
      }
    });

    return Array.from(unique.values());
  }

  /**
   * Analyze keyword gaps - keywords competitors rank for but you don't
   */
  async analyzeKeywordGaps(yourSite, serpAnalysis) {
    const gaps = [];

    if (!serpAnalysis || !Array.isArray(serpAnalysis)) return gaps;

    serpAnalysis.forEach(serp => {
      const keyword = serp.keyword;
      const yourRanking = serp.results.find(r => this.matchesDomain(r.url, yourSite));
      const competitorRankings = serp.results.filter(r => !this.matchesDomain(r.url, yourSite));

      // If you're not ranking but competitors are
      if (!yourRanking && competitorRankings.length > 0) {
        const topCompetitors = competitorRankings.slice(0, 3);

        gaps.push({
          keyword,
          searchVolume: serp.searchVolume || 'Unknown',
          difficulty: serp.difficulty || 'Unknown',
          yourPosition: null,
          competitorPositions: topCompetitors.map((r, idx) => ({
            position: idx + 1,
            domain: this.extractDomain(r.url),
            url: r.url,
            title: r.title
          })),
          serpFeatures: serp.features || [],
          opportunity: this.calculateKeywordOpportunity(serp),
          priority: this.calculateKeywordPriority(serp)
        });
      }
      // If you're ranking but poorly (position > 10)
      else if (yourRanking && yourRanking.position > 10) {
        const betterCompetitors = competitorRankings.filter(r => r.position < yourRanking.position).slice(0, 3);

        if (betterCompetitors.length > 0) {
          gaps.push({
            keyword,
            searchVolume: serp.searchVolume || 'Unknown',
            difficulty: serp.difficulty || 'Unknown',
            yourPosition: yourRanking.position,
            competitorPositions: betterCompetitors.map(r => ({
              position: r.position,
              domain: this.extractDomain(r.url),
              url: r.url,
              title: r.title
            })),
            serpFeatures: serp.features || [],
            opportunity: this.calculateKeywordOpportunity(serp),
            priority: this.calculateKeywordPriority(serp)
          });
        }
      }
    });

    return gaps.sort((a, b) => b.opportunity - a.opportunity).slice(0, 100);
  }

  /**
   * Check if URL matches domain
   */
  matchesDomain(url, domain) {
    try {
      const urlDomain = new URL(url).hostname.replace('www.', '');
      const targetDomain = domain.replace(/^https?:\/\//, '').replace('www.', '').split('/')[0];
      return urlDomain === targetDomain;
    } catch (error) {
      return false;
    }
  }

  /**
   * Extract domain from URL
   */
  extractDomain(url) {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch (error) {
      return url;
    }
  }

  /**
   * Calculate keyword opportunity score
   */
  calculateKeywordOpportunity(serp) {
    let score = 5; // Base score

    // Higher search volume = higher opportunity
    if (typeof serp.searchVolume === 'number') {
      if (serp.searchVolume >= 10000) score += 3;
      else if (serp.searchVolume >= 1000) score += 2;
      else if (serp.searchVolume >= 100) score += 1;
    }

    // Lower difficulty = higher opportunity
    if (typeof serp.difficulty === 'number') {
      if (serp.difficulty <= 30) score += 3;
      else if (serp.difficulty <= 60) score += 1;
    }

    // SERP features = higher opportunity
    if (serp.features && serp.features.length > 0) {
      score += Math.min(2, serp.features.length);
    }

    return Math.min(10, score);
  }

  /**
   * Calculate keyword priority
   */
  calculateKeywordPriority(serp) {
    const opportunity = this.calculateKeywordOpportunity(serp);
    if (opportunity >= 8) return 'high';
    if (opportunity >= 5) return 'medium';
    return 'low';
  }

  /**
   * Analyze SERP feature gaps - features competitors have but you don't
   */
  async analyzeSERPFeatureGaps(yourSite, serpAnalysis) {
    const gaps = [];

    if (!serpAnalysis || !Array.isArray(serpAnalysis)) return gaps;

    serpAnalysis.forEach(serp => {
      if (!serp.features || serp.features.length === 0) return;

      const yourResult = serp.results.find(r => this.matchesDomain(r.url, yourSite));
      const yourFeatures = yourResult?.features || [];

      // Find features present in SERP but not for your site
      const missingFeatures = serp.features.filter(feature => !yourFeatures.includes(feature));

      if (missingFeatures.length > 0) {
        // Find which competitors have these features
        const competitorsWithFeatures = serp.results
          .filter(r => !this.matchesDomain(r.url, yourSite))
          .filter(r => r.features && r.features.some(f => missingFeatures.includes(f)))
          .slice(0, 3);

        missingFeatures.forEach(feature => {
          gaps.push({
            keyword: serp.keyword,
            feature,
            yourHasFeature: false,
            competitorsWithFeature: competitorsWithFeatures
              .filter(c => c.features.includes(feature))
              .map(c => ({
                domain: this.extractDomain(c.url),
                url: c.url,
                position: c.position
              })),
            opportunity: this.calculateFeatureOpportunity(feature, serp),
            priority: this.calculateFeaturePriority(feature)
          });
        });
      }
    });

    // Aggregate by feature type
    const aggregated = this.aggregateFeatureGaps(gaps);
    return aggregated.sort((a, b) => b.opportunity - a.opportunity);
  }

  /**
   * Calculate feature opportunity score
   */
  calculateFeatureOpportunity(feature, serp) {
    const featureScores = {
      'featured_snippet': 10,
      'people_also_ask': 8,
      'knowledge_panel': 9,
      'local_pack': 7,
      'videos': 6,
      'images': 5,
      'shopping': 7,
      'news': 6
    };

    return featureScores[feature] || 5;
  }

  /**
   * Calculate feature priority
   */
  calculateFeaturePriority(feature) {
    const highPriority = ['featured_snippet', 'knowledge_panel', 'people_also_ask'];
    const mediumPriority = ['local_pack', 'shopping', 'videos'];

    if (highPriority.includes(feature)) return 'high';
    if (mediumPriority.includes(feature)) return 'medium';
    return 'low';
  }

  /**
   * Aggregate feature gaps by feature type
   */
  aggregateFeatureGaps(gaps) {
    const aggregated = new Map();

    gaps.forEach(gap => {
      if (aggregated.has(gap.feature)) {
        const existing = aggregated.get(gap.feature);
        existing.keywords.push(gap.keyword);
        existing.totalOpportunities++;
      } else {
        aggregated.set(gap.feature, {
          feature: gap.feature,
          keywords: [gap.keyword],
          totalOpportunities: 1,
          opportunity: gap.opportunity,
          priority: gap.priority,
          exampleCompetitors: gap.competitorsWithFeature
        });
      }
    });

    return Array.from(aggregated.values());
  }

  /**
   * Analyze content depth gaps - where competitors have deeper content
   */
  async analyzeContentDepthGaps(yourCrawl, competitorCrawls) {
    const gaps = [];

    if (!yourCrawl || !yourCrawl.pages) return gaps;

    // Calculate your average metrics
    const yourMetrics = this.calculateContentMetrics(yourCrawl);

    // Compare to each competitor
    competitorCrawls.forEach((crawl, idx) => {
      const compMetrics = this.calculateContentMetrics(crawl);

      // Compare dimensions
      const dimensions = [
        {
          name: 'Average Word Count',
          yours: yourMetrics.avgWordCount,
          theirs: compMetrics.avgWordCount,
          unit: 'words',
          threshold: 500
        },
        {
          name: 'Schema Markup Coverage',
          yours: yourMetrics.schemaPercentage,
          theirs: compMetrics.schemaPercentage,
          unit: '%',
          threshold: 20
        },
        {
          name: 'Image Usage',
          yours: yourMetrics.avgImages,
          theirs: compMetrics.avgImages,
          unit: 'images/page',
          threshold: 2
        },
        {
          name: 'Internal Linking',
          yours: yourMetrics.avgInternalLinks,
          theirs: compMetrics.avgInternalLinks,
          unit: 'links/page',
          threshold: 3
        }
      ];

      dimensions.forEach(dim => {
        const difference = dim.theirs - dim.yours;
        if (difference > dim.threshold) {
          gaps.push({
            competitor: crawl.domain || `Competitor ${idx + 1}`,
            dimension: dim.name,
            yourValue: Math.round(dim.yours),
            competitorValue: Math.round(dim.theirs),
            difference: Math.round(difference),
            unit: dim.unit,
            opportunity: this.calculateDepthOpportunity(difference, dim.threshold),
            priority: difference > dim.threshold * 2 ? 'high' : 'medium'
          });
        }
      });
    });

    return gaps.sort((a, b) => b.opportunity - a.opportunity);
  }

  /**
   * Calculate content metrics from crawl data
   */
  calculateContentMetrics(crawl) {
    if (!crawl || !crawl.pages || crawl.pages.length === 0) {
      return {
        avgWordCount: 0,
        schemaPercentage: 0,
        avgImages: 0,
        avgInternalLinks: 0
      };
    }

    const pages = crawl.pages;
    const totalPages = pages.length;

    const totalWords = pages.reduce((sum, p) => sum + (p.content?.wordCount || 0), 0);
    const pagesWithSchema = pages.filter(p => p.schema && p.schema.length > 0).length;
    const totalImages = pages.reduce((sum, p) => sum + (p.images?.total || 0), 0);
    const totalInternalLinks = pages.reduce((sum, p) => sum + (p.links?.internal || 0), 0);

    return {
      avgWordCount: totalWords / totalPages,
      schemaPercentage: (pagesWithSchema / totalPages) * 100,
      avgImages: totalImages / totalPages,
      avgInternalLinks: totalInternalLinks / totalPages
    };
  }

  /**
   * Calculate content depth opportunity score
   */
  calculateDepthOpportunity(difference, threshold) {
    const ratio = difference / threshold;
    return Math.min(10, Math.round(ratio * 3));
  }

  /**
   * Generate actionable recommendations from gaps
   */
  generateRecommendations(gaps) {
    const recommendations = [];

    // Topic gap recommendations (top 10)
    if (gaps.topicGaps && gaps.topicGaps.length > 0) {
      const topTopicGaps = gaps.topicGaps.slice(0, 10);
      topTopicGaps.forEach(gap => {
        recommendations.push({
          type: 'topic_gap',
          priority: gap.priority,
          title: `Create content about "${gap.topic}"`,
          description: `${gap.competitor} has ${gap.competitorPages} pages on this topic. This represents a significant content opportunity.`,
          impact: gap.opportunity,
          effort: this.estimateEffort(gap.competitorPages),
          action: `Create ${Math.min(gap.competitorPages, 5)} comprehensive pieces of content covering this topic`,
          examples: gap.competitorUrls.slice(0, 3)
        });
      });
    }

    // Keyword gap recommendations (top 10)
    if (gaps.keywordGaps && gaps.keywordGaps.length > 0) {
      const topKeywordGaps = gaps.keywordGaps.slice(0, 10);
      topKeywordGaps.forEach(gap => {
        recommendations.push({
          type: 'keyword_gap',
          priority: gap.priority,
          title: `Target keyword "${gap.keyword}"`,
          description: `Competitors rank in top ${gap.competitorPositions.length} for this keyword${gap.searchVolume !== 'Unknown' ? ` (${gap.searchVolume} monthly searches)` : ''}.`,
          impact: gap.opportunity,
          effort: this.estimateKeywordEffort(gap.difficulty),
          action: gap.yourPosition
            ? `Optimize existing content at position ${gap.yourPosition} to move into top 10`
            : `Create new content targeting this keyword`,
          examples: gap.competitorPositions.map(c => c.url)
        });
      });
    }

    // SERP feature recommendations (all)
    if (gaps.serpFeatureGaps && gaps.serpFeatureGaps.length > 0) {
      gaps.serpFeatureGaps.forEach(gap => {
        recommendations.push({
          type: 'serp_feature',
          priority: gap.priority,
          title: `Optimize for ${gap.feature.replace('_', ' ')}`,
          description: `Competitors appear in ${gap.feature} for ${gap.keywords.length} keywords. This is a high-visibility opportunity.`,
          impact: gap.opportunity,
          effort: this.estimateFeatureEffort(gap.feature),
          action: this.getFeatureAction(gap.feature),
          examples: gap.keywords.slice(0, 5)
        });
      });
    }

    // Content depth recommendations (top 5)
    if (gaps.contentDepthGaps && gaps.contentDepthGaps.length > 0) {
      const topDepthGaps = gaps.contentDepthGaps.slice(0, 5);
      topDepthGaps.forEach(gap => {
        recommendations.push({
          type: 'content_depth',
          priority: gap.priority,
          title: `Improve ${gap.dimension.toLowerCase()}`,
          description: `${gap.competitor} averages ${gap.competitorValue} ${gap.unit} vs your ${gap.yourValue} ${gap.unit}.`,
          impact: gap.opportunity,
          effort: this.estimateDepthEffort(gap.dimension),
          action: this.getDepthAction(gap.dimension, gap.difference),
          examples: []
        });
      });
    }

    // Sort by impact/effort ratio
    return recommendations.sort((a, b) => {
      const ratioA = a.impact / a.effort;
      const ratioB = b.impact / b.effort;
      return ratioB - ratioA;
    });
  }

  /**
   * Estimate effort for topic content creation
   */
  estimateEffort(pageCount) {
    if (pageCount >= 10) return 8; // High effort
    if (pageCount >= 5) return 5;  // Medium effort
    return 3; // Low effort
  }

  /**
   * Estimate effort for keyword targeting
   */
  estimateKeywordEffort(difficulty) {
    if (difficulty === 'Unknown') return 5;
    if (typeof difficulty === 'number') {
      if (difficulty >= 70) return 8;
      if (difficulty >= 40) return 5;
      return 3;
    }
    return 5;
  }

  /**
   * Estimate effort for SERP feature optimization
   */
  estimateFeatureEffort(feature) {
    const efforts = {
      'featured_snippet': 4,
      'people_also_ask': 5,
      'knowledge_panel': 8,
      'local_pack': 6,
      'videos': 7,
      'images': 3,
      'shopping': 6,
      'news': 5
    };
    return efforts[feature] || 5;
  }

  /**
   * Estimate effort for content depth improvement
   */
  estimateDepthEffort(dimension) {
    const efforts = {
      'Average Word Count': 6,
      'Schema Markup Coverage': 4,
      'Image Usage': 3,
      'Internal Linking': 2
    };
    return efforts[dimension] || 5;
  }

  /**
   * Get action for SERP feature
   */
  getFeatureAction(feature) {
    const actions = {
      'featured_snippet': 'Structure content with clear Q&A format, use lists and tables, target question keywords',
      'people_also_ask': 'Add FAQ section with schema markup, answer related questions comprehensively',
      'knowledge_panel': 'Claim and optimize Knowledge Graph entity, ensure consistent NAP citations',
      'local_pack': 'Optimize Google Business Profile, build local citations, gather reviews',
      'videos': 'Create video content, optimize with transcripts and schema markup, publish to YouTube',
      'images': 'Add high-quality images with descriptive alt text and structured data',
      'shopping': 'Add product schema markup, optimize product pages, use high-quality images',
      'news': 'Publish timely, newsworthy content, optimize for freshness signals'
    };
    return actions[feature] || 'Optimize content for this SERP feature';
  }

  /**
   * Get action for content depth dimension
   */
  getDepthAction(dimension, difference) {
    const actions = {
      'Average Word Count': `Expand content by ~${Math.round(difference)} words per page. Add depth, examples, and comprehensive coverage.`,
      'Schema Markup Coverage': `Add structured data markup to pages. Start with Article, Organization, and BreadcrumbList schemas.`,
      'Image Usage': `Add ~${Math.round(difference)} more images per page. Use relevant screenshots, diagrams, and infographics.`,
      'Internal Linking': `Add ~${Math.round(difference)} more internal links per page. Create topic clusters and hub pages.`
    };
    return actions[dimension] || 'Improve this content dimension';
  }

  /**
   * Calculate summary statistics
   */
  calculateSummary(gaps) {
    return {
      totalTopicGaps: gaps.topicGaps.length,
      totalKeywordGaps: gaps.keywordGaps.length,
      totalSERPFeatureGaps: gaps.serpFeatureGaps.reduce((sum, g) => sum + g.totalOpportunities, 0),
      totalContentDepthGaps: gaps.contentDepthGaps.length,
      totalRecommendations: gaps.recommendations.length,
      highPriorityRecommendations: gaps.recommendations.filter(r => r.priority === 'high').length,
      topOpportunities: gaps.recommendations.slice(0, 5).map(r => ({
        type: r.type,
        title: r.title,
        impact: r.impact,
        effort: r.effort
      }))
    };
  }

  /**
   * Load from cache if available and fresh
   */
  async loadFromCache(cacheKey) {
    if (!this.useCache) return null;

    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
      const cachePath = path.join(this.cacheDir, `${cacheKey}.json`);
      const stats = await fs.stat(cachePath);
      const age = Date.now() - stats.mtimeMs;

      if (age < this.cacheTTL) {
        const data = await fs.readFile(cachePath, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      // Cache miss
    }

    return null;
  }

  /**
   * Save to cache
   */
  async saveToCache(cacheKey, data) {
    if (!this.useCache) return;

    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
      const cachePath = path.join(this.cacheDir, `${cacheKey}.json`);
      await fs.writeFile(cachePath, JSON.stringify(data, null, 2));
    } catch (error) {
      console.warn(`   ⚠️  Failed to save cache: ${error.message}`);
    }
  }

  /**
   * Generate cache key
   */
  generateCacheKey(input) {
    const hash = crypto.createHash('md5');
    hash.update(JSON.stringify(input));
    return hash.digest('hex');
  }
}

// CLI interface
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
SEO Content Gap Analyzer

Usage:
  node seo-content-gap-analyzer.js --your-site <url> --competitors <url1,url2,...> [options]
  node seo-content-gap-analyzer.js --your-crawl <path> --competitor-crawls <path1,path2> [options]
  node seo-content-gap-analyzer.js --serp-analysis <path> --your-site <url> [options]

Options:
  --your-site <url>                Your website URL
  --competitors <urls>             Comma-separated competitor URLs
  --your-crawl <path>             Path to your site crawl JSON
  --competitor-crawls <paths>     Comma-separated paths to competitor crawl JSONs
  --serp-analysis <path>          Path to SERP analysis JSON
  --output <path>                 Output file path (default: ./content-gaps.json)
  --format <json|text>            Output format (default: json)
  --no-cache                      Disable caching
  --help                          Show this help

Examples:
  node seo-content-gap-analyzer.js --your-site https://example.com --competitors https://comp1.com,https://comp2.com
  node seo-content-gap-analyzer.js --your-crawl ./my-site.json --competitor-crawls ./comp1.json,./comp2.json
  node seo-content-gap-analyzer.js --serp-analysis ./serp.json --your-site https://example.com
    `);
    process.exit(0);
  }

  // Parse arguments
  const config = {
    yourSite: null,
    competitors: [],
    yourCrawl: null,
    competitorCrawls: [],
    serpAnalysis: null,
    output: './content-gaps.json',
    format: 'json',
    useCache: true
  };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--your-site') config.yourSite = args[++i];
    else if (args[i] === '--competitors') config.competitors = args[++i].split(',');
    else if (args[i] === '--your-crawl') config.yourCrawl = args[++i];
    else if (args[i] === '--competitor-crawls') config.competitorCrawls = args[++i].split(',');
    else if (args[i] === '--serp-analysis') config.serpAnalysis = args[++i];
    else if (args[i] === '--output') config.output = args[++i];
    else if (args[i] === '--format') config.format = args[++i];
    else if (args[i] === '--no-cache') config.useCache = false;
  }

  // Validate inputs
  if (!config.yourSite && !config.yourCrawl) {
    console.error('❌ Error: Must provide --your-site or --your-crawl');
    process.exit(1);
  }

  // Run analysis
  (async () => {
    try {
      const analyzer = new ContentGapAnalyzer({ useCache: config.useCache });

      // Load crawl data if provided
      let yourCrawlData = null;
      let competitorCrawlData = [];

      if (config.yourCrawl) {
        yourCrawlData = JSON.parse(await fs.readFile(config.yourCrawl, 'utf8'));
      }

      if (config.competitorCrawls.length > 0) {
        for (const crawlPath of config.competitorCrawls) {
          const data = JSON.parse(await fs.readFile(crawlPath, 'utf8'));
          competitorCrawlData.push(data);
        }
      }

      // Load SERP analysis if provided
      let serpAnalysis = null;
      if (config.serpAnalysis) {
        serpAnalysis = JSON.parse(await fs.readFile(config.serpAnalysis, 'utf8'));
      }

      // Run analysis
      const result = await analyzer.analyzeGaps(
        config.yourSite,
        config.competitors,
        {
          yourCrawlData,
          competitorCrawlData,
          serpAnalysis
        }
      );

      // Output
      if (config.format === 'json') {
        await fs.writeFile(config.output, JSON.stringify(result, null, 2));
        console.log(`\n✅ Results saved to ${config.output}`);
      } else {
        // Text format
        console.log('\n\n=== CONTENT GAP ANALYSIS ===\n');
        console.log(`Your Site: ${result.yourSite}`);
        console.log(`Competitors: ${result.competitors.join(', ')}`);
        console.log(`\nSummary:`);
        console.log(`  Topic Gaps: ${result.summary.totalTopicGaps}`);
        console.log(`  Keyword Gaps: ${result.summary.totalKeywordGaps}`);
        console.log(`  SERP Feature Gaps: ${result.summary.totalSERPFeatureGaps}`);
        console.log(`  Content Depth Gaps: ${result.summary.totalContentDepthGaps}`);
        console.log(`  Total Recommendations: ${result.summary.totalRecommendations}`);
        console.log(`  High Priority: ${result.summary.highPriorityRecommendations}`);

        console.log('\n\nTop 10 Recommendations:\n');
        result.recommendations.slice(0, 10).forEach((rec, idx) => {
          console.log(`${idx + 1}. [${rec.priority.toUpperCase()}] ${rec.title}`);
          console.log(`   ${rec.description}`);
          console.log(`   Impact: ${rec.impact}/10 | Effort: ${rec.effort}/10`);
          console.log(`   Action: ${rec.action}\n`);
        });
      }

    } catch (error) {
      console.error(`\n❌ Error: ${error.message}`);
      if (process.env.DEBUG) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  })();
}

module.exports = ContentGapAnalyzer;
