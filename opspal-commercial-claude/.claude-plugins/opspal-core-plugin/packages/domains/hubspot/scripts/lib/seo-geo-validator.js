#!/usr/bin/env node

/**
 * SEO GEO Validator
 *
 * Validates website readiness for Generative Engine Optimization (GEO).
 * Checks AI crawler access, entity markup, structured content, and answer blocks.
 *
 * GEO focuses on visibility in AI-powered search results:
 * - ChatGPT search
 * - Google AI Overviews
 * - Perplexity AI
 * - Claude web search
 * - Bing Copilot
 *
 * Usage:
 *   node seo-geo-validator.js <url> [options]
 *   node seo-geo-validator.js https://example.com --check-robots
 *   node seo-geo-validator.js ./crawl-results.json --format json
 *
 * Options:
 *   --check-robots       Fetch and analyze robots.txt
 *   --format <format>    Input format: url, json (default: url)
 *   --output <file>      Save results to JSON file
 *
 * Exit codes:
 *   0 - Success
 *   1 - Error
 */

const fs = require('fs');
const https = require('https');
const http = require('http');
const { URL } = require('url');

class SEOGEOValidator {
  constructor() {
    this.aiCrawlers = [
      { name: 'GPTBot', userAgent: 'GPTBot', importance: 'high' },
      { name: 'Google-Extended', userAgent: 'Google-Extended', importance: 'high' },
      { name: 'Claude-Web', userAgent: 'Claude-Web', importance: 'high' },
      { name: 'PerplexityBot', userAgent: 'PerplexityBot', importance: 'medium' },
      { name: 'Anthropic-AI', userAgent: 'anthropic-ai', importance: 'high' },
      { name: 'ChatGPT-User', userAgent: 'ChatGPT-User', importance: 'high' },
      { name: 'Bytespider', userAgent: 'Bytespider', importance: 'low' }, // TikTok
      { name: 'CCBot', userAgent: 'CCBot', importance: 'medium' }, // Common Crawl
      { name: 'Applebot-Extended', userAgent: 'Applebot-Extended', importance: 'medium' }
    ];
  }

  async validateURL(url, options = {}) {
    console.log('🎯 Analyzing GEO readiness...\n');

    const results = {
      url,
      analyzedAt: new Date().toISOString(),
      geoScore: 0,
      grade: 'F',
      dimensions: {},
      recommendations: [],
      summary: {}
    };

    try {
      // Fetch page content
      const content = await this.fetchContent(url);
      const parsedUrl = new URL(url);
      const baseUrl = `${parsedUrl.protocol}//${parsedUrl.hostname}`;

      // Run all checks
      results.dimensions.aiCrawlerAccess = options.checkRobots
        ? await this.checkAICrawlerAccess(baseUrl)
        : { score: 50, status: 'unknown', note: 'Use --check-robots to analyze' };

      results.dimensions.entityMarkup = this.checkEntityMarkup(content);
      results.dimensions.structuredContent = this.checkStructuredContent(content);
      results.dimensions.answerBlocks = this.checkAnswerBlocks(content);
      results.dimensions.citationReadiness = this.checkCitationReadiness(content);

      // Calculate overall score
      results.geoScore = this.calculateGEOScore(results.dimensions);
      results.grade = this.getGrade(results.geoScore);

      // Generate recommendations
      results.recommendations = this.generateRecommendations(results.dimensions);
      results.summary = this.generateSummary(results);

      return results;

    } catch (error) {
      throw new Error(`GEO validation failed: ${error.message}`);
    }
  }

  async validateJSON(crawlData, options = {}) {
    console.log('🎯 Analyzing GEO readiness from crawl data...\n');

    const results = {
      domain: crawlData.domain || 'unknown',
      analyzedAt: new Date().toISOString(),
      geoScore: 0,
      grade: 'F',
      dimensions: {},
      recommendations: [],
      summary: {},
      pages: []
    };

    try {
      // Analyze each page
      for (const page of crawlData.pages || []) {
        const pageResults = {
          url: page.url,
          dimensions: {}
        };

        const content = page.content?.text || page.content?.html || '';

        pageResults.dimensions.entityMarkup = this.checkEntityMarkup(content);
        pageResults.dimensions.structuredContent = this.checkStructuredContent(content);
        pageResults.dimensions.answerBlocks = this.checkAnswerBlocks(content);
        pageResults.dimensions.citationReadiness = this.checkCitationReadiness(content);

        pageResults.score = this.calculatePageGEOScore(pageResults.dimensions);
        results.pages.push(pageResults);
      }

      // Aggregate scores
      results.dimensions = this.aggregateDimensions(results.pages);
      results.geoScore = this.calculateGEOScore(results.dimensions);
      results.grade = this.getGrade(results.geoScore);
      results.recommendations = this.generateRecommendations(results.dimensions);
      results.summary = this.generateSummary(results);

      return results;

    } catch (error) {
      throw new Error(`GEO validation failed: ${error.message}`);
    }
  }

  async checkAICrawlerAccess(baseUrl) {
    try {
      const robotsTxt = await this.fetchRobotsTxt(baseUrl);
      const analysis = this.parseRobotsTxt(robotsTxt);

      const allowedCrawlers = [];
      const disallowedCrawlers = [];
      const unknownCrawlers = [];

      for (const crawler of this.aiCrawlers) {
        const status = this.checkCrawlerAccess(robotsTxt, crawler.userAgent);

        if (status === 'allowed') {
          allowedCrawlers.push(crawler);
        } else if (status === 'disallowed') {
          disallowedCrawlers.push(crawler);
        } else {
          unknownCrawlers.push(crawler);
        }
      }

      // Score based on allowed high-importance crawlers
      const highImportanceAllowed = allowedCrawlers.filter(c => c.importance === 'high').length;
      const highImportanceTotal = this.aiCrawlers.filter(c => c.importance === 'high').length;

      let score = (highImportanceAllowed / highImportanceTotal) * 100;

      // Deduct for explicitly disallowed
      const highImportanceDisallowed = disallowedCrawlers.filter(c => c.importance === 'high').length;
      score -= (highImportanceDisallowed * 20); // -20 per blocked high-importance crawler

      score = Math.max(0, Math.min(100, score));

      return {
        score: Math.round(score),
        status: score > 70 ? 'good' : score > 40 ? 'fair' : 'poor',
        allowed: allowedCrawlers.map(c => c.name),
        disallowed: disallowedCrawlers.map(c => c.name),
        unknown: unknownCrawlers.map(c => c.name),
        details: analysis
      };

    } catch (error) {
      return {
        score: 0,
        status: 'error',
        error: error.message,
        note: 'Could not fetch robots.txt'
      };
    }
  }

  checkEntityMarkup(content) {
    const checks = {
      hasOrganization: false,
      organizationComplete: false,
      hasWebSite: false,
      hasPerson: false,
      hasSameAs: false,
      hasLogo: false,
      hasContactPoint: false,
      hasAddress: false
    };

    // Check for Organization schema
    const orgMatch = content.match(/"@type"\s*:\s*"Organization"/i);
    if (orgMatch) {
      checks.hasOrganization = true;

      // Check completeness
      const sameAsMatch = content.match(/"sameAs"\s*:\s*\[/i);
      const logoMatch = content.match(/"logo"\s*:\s*"/i);
      const contactMatch = content.match(/"contactPoint"\s*:/i);
      const addressMatch = content.match(/"address"\s*:/i);

      checks.hasSameAs = !!sameAsMatch;
      checks.hasLogo = !!logoMatch;
      checks.hasContactPoint = !!contactMatch;
      checks.hasAddress = !!addressMatch;

      // Consider complete if has at least sameAs and logo
      checks.organizationComplete = checks.hasSameAs && checks.hasLogo;
    }

    // Check for WebSite schema
    checks.hasWebSite = /"@type"\s*:\s*"WebSite"/i.test(content);

    // Check for Person schema (author markup)
    checks.hasPerson = /"@type"\s*:\s*"Person"/i.test(content);

    // Calculate score
    let score = 0;
    if (checks.hasOrganization) score += 30;
    if (checks.organizationComplete) score += 20;
    if (checks.hasWebSite) score += 20;
    if (checks.hasPerson) score += 15;
    if (checks.hasSameAs) score += 10;
    if (checks.hasContactPoint) score += 5;

    return {
      score: Math.min(100, score),
      status: score > 70 ? 'good' : score > 40 ? 'fair' : 'poor',
      checks,
      issues: this.getEntityMarkupIssues(checks)
    };
  }

  checkStructuredContent(content) {
    const checks = {
      hasTLDR: false,
      hasLists: false,
      hasTables: false,
      hasDefinitions: false,
      hasSteps: false,
      hasQA: false
    };

    // Check for TL;DR or summary sections
    checks.hasTLDR = /(?:TL;?DR|Summary|Key Takeaways?|At a Glance)/i.test(content);

    // Check for lists
    checks.hasLists = /<ul|<ol|^\s*[-*•]\s/m.test(content);

    // Check for tables
    checks.hasTables = /<table/i.test(content);

    // Check for definition patterns
    checks.hasDefinitions = /(?:is defined as|means that|refers to|definition:)/i.test(content);

    // Check for step-by-step content
    checks.hasSteps = /(?:step \d+|first,|second,|third,|finally)/i.test(content);

    // Check for Q&A format
    checks.hasQA = /(?:<h[2-6][^>]*>.*\?.*<\/h[2-6]>|^Q:|Question:)/im.test(content);

    // Calculate score
    let score = 0;
    if (checks.hasTLDR) score += 25;
    if (checks.hasLists) score += 20;
    if (checks.hasTables) score += 15;
    if (checks.hasDefinitions) score += 15;
    if (checks.hasSteps) score += 15;
    if (checks.hasQA) score += 10;

    return {
      score: Math.min(100, score),
      status: score > 70 ? 'good' : score > 40 ? 'fair' : 'poor',
      checks,
      issues: this.getStructuredContentIssues(checks)
    };
  }

  checkAnswerBlocks(content) {
    const checks = {
      hasShortAnswers: false,
      answerWordCount: 0,
      hasConciseParagraphs: false,
      hasDirectAnswers: false
    };

    // Strip HTML tags for analysis
    const text = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    // Look for answer-like blocks (40-60 word paragraphs)
    const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);

    for (const para of paragraphs) {
      const words = para.trim().split(/\s+/).length;
      if (words >= 40 && words <= 60) {
        checks.hasShortAnswers = true;
        checks.answerWordCount = words;
        break;
      }
    }

    // Check for concise paragraphs (most < 100 words)
    const shortParas = paragraphs.filter(p => p.trim().split(/\s+/).length < 100).length;
    checks.hasConciseParagraphs = (shortParas / Math.max(1, paragraphs.length)) > 0.6;

    // Check for direct answer patterns
    checks.hasDirectAnswers = /(?:The answer is|Simply put,|In short,|To summarize,)/i.test(text);

    // Calculate score
    let score = 0;
    if (checks.hasShortAnswers) score += 40;
    if (checks.hasConciseParagraphs) score += 30;
    if (checks.hasDirectAnswers) score += 30;

    return {
      score: Math.min(100, score),
      status: score > 70 ? 'good' : score > 40 ? 'fair' : 'poor',
      checks,
      issues: this.getAnswerBlockIssues(checks)
    };
  }

  checkCitationReadiness(content) {
    const checks = {
      hasExternalLinks: false,
      hasAuthorInfo: false,
      hasPublishDate: false,
      hasUpdateDate: false,
      hasSources: false
    };

    // Check for external links (citations)
    checks.hasExternalLinks = /<a[^>]+href=["']https?:\/\/(?!(?:www\.)?(?:example\.com))/i.test(content);

    // Check for author information
    checks.hasAuthorInfo = /(?:by|author|written by|posted by)/i.test(content) ||
                           /"author"\s*:\s*\{/i.test(content);

    // Check for publish date
    checks.hasPublishDate = /"datePublished"/i.test(content) ||
                            /(?:published|posted).*\d{4}/i.test(content);

    // Check for update date
    checks.hasUpdateDate = /"dateModified"/i.test(content) ||
                           /(?:updated|modified|last updated).*\d{4}/i.test(content);

    // Check for explicit sources section
    checks.hasSources = /(?:sources?|references?|citations?|bibliography):/i.test(content);

    // Calculate score
    let score = 0;
    if (checks.hasExternalLinks) score += 25;
    if (checks.hasAuthorInfo) score += 25;
    if (checks.hasPublishDate) score += 20;
    if (checks.hasUpdateDate) score += 15;
    if (checks.hasSources) score += 15;

    return {
      score: Math.min(100, score),
      status: score > 70 ? 'good' : score > 40 ? 'fair' : 'poor',
      checks,
      issues: this.getCitationReadinessIssues(checks)
    };
  }

  calculateGEOScore(dimensions) {
    const weights = {
      aiCrawlerAccess: 0.25,
      entityMarkup: 0.25,
      structuredContent: 0.20,
      answerBlocks: 0.20,
      citationReadiness: 0.10
    };

    let totalScore = 0;
    let totalWeight = 0;

    for (const [key, weight] of Object.entries(weights)) {
      if (dimensions[key] && typeof dimensions[key].score === 'number') {
        totalScore += dimensions[key].score * weight;
        totalWeight += weight;
      }
    }

    return totalWeight > 0 ? Math.round(totalScore / totalWeight) : 0;
  }

  calculatePageGEOScore(dimensions) {
    const weights = {
      entityMarkup: 0.30,
      structuredContent: 0.30,
      answerBlocks: 0.25,
      citationReadiness: 0.15
    };

    let totalScore = 0;
    for (const [key, weight] of Object.entries(weights)) {
      if (dimensions[key]) {
        totalScore += dimensions[key].score * weight;
      }
    }

    return Math.round(totalScore);
  }

  aggregateDimensions(pages) {
    if (!pages || pages.length === 0) return {};

    const dimensions = {};
    const dimKeys = ['entityMarkup', 'structuredContent', 'answerBlocks', 'citationReadiness'];

    for (const key of dimKeys) {
      const scores = pages.map(p => p.dimensions[key]?.score || 0);
      const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

      dimensions[key] = {
        score: Math.round(avgScore),
        status: avgScore > 70 ? 'good' : avgScore > 40 ? 'fair' : 'poor'
      };
    }

    return dimensions;
  }

  getGrade(score) {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }

  getEntityMarkupIssues(checks) {
    const issues = [];
    if (!checks.hasOrganization) {
      issues.push({ severity: 'high', issue: 'Missing Organization schema' });
    }
    if (!checks.hasSameAs) {
      issues.push({ severity: 'high', issue: 'Organization missing sameAs links' });
    }
    if (!checks.hasLogo) {
      issues.push({ severity: 'medium', issue: 'Organization missing logo' });
    }
    if (!checks.hasWebSite) {
      issues.push({ severity: 'low', issue: 'Missing WebSite schema' });
    }
    if (!checks.hasContactPoint) {
      issues.push({ severity: 'low', issue: 'Organization missing contactPoint' });
    }
    return issues;
  }

  getStructuredContentIssues(checks) {
    const issues = [];
    if (!checks.hasTLDR) {
      issues.push({ severity: 'high', issue: 'No TL;DR or summary section' });
    }
    if (!checks.hasLists) {
      issues.push({ severity: 'medium', issue: 'No lists (bullets or numbered)' });
    }
    if (!checks.hasQA) {
      issues.push({ severity: 'medium', issue: 'No Q&A format sections' });
    }
    if (!checks.hasSteps) {
      issues.push({ severity: 'low', issue: 'No step-by-step instructions' });
    }
    return issues;
  }

  getAnswerBlockIssues(checks) {
    const issues = [];
    if (!checks.hasShortAnswers) {
      issues.push({ severity: 'high', issue: 'No 40-60 word answer blocks' });
    }
    if (!checks.hasConciseParagraphs) {
      issues.push({ severity: 'medium', issue: 'Paragraphs too long (>100 words)' });
    }
    if (!checks.hasDirectAnswers) {
      issues.push({ severity: 'low', issue: 'No direct answer phrases' });
    }
    return issues;
  }

  getCitationReadinessIssues(checks) {
    const issues = [];
    if (!checks.hasAuthorInfo) {
      issues.push({ severity: 'high', issue: 'Missing author information' });
    }
    if (!checks.hasPublishDate) {
      issues.push({ severity: 'high', issue: 'Missing publish date' });
    }
    if (!checks.hasExternalLinks) {
      issues.push({ severity: 'medium', issue: 'No external citations/sources' });
    }
    if (!checks.hasSources) {
      issues.push({ severity: 'low', issue: 'No explicit sources section' });
    }
    return issues;
  }

  generateRecommendations(dimensions) {
    const recommendations = [];

    // AI Crawler Access
    if (dimensions.aiCrawlerAccess?.score < 70) {
      if (dimensions.aiCrawlerAccess.disallowed?.length > 0) {
        recommendations.push({
          priority: 'high',
          category: 'AI Access',
          issue: `Blocked AI crawlers: ${dimensions.aiCrawlerAccess.disallowed.join(', ')}`,
          solution: 'Update robots.txt to allow GPTBot, Google-Extended, and Claude-Web',
          impact: 9
        });
      }
    }

    // Entity Markup
    if (dimensions.entityMarkup?.score < 70) {
      const issues = dimensions.entityMarkup.issues || [];
      for (const issue of issues.filter(i => i.severity === 'high')) {
        recommendations.push({
          priority: 'high',
          category: 'Entity Markup',
          issue: issue.issue,
          solution: 'Add complete Organization schema with sameAs and logo',
          impact: 8
        });
      }
    }

    // Structured Content
    if (dimensions.structuredContent?.score < 70) {
      const issues = dimensions.structuredContent.issues || [];
      if (issues.some(i => i.issue.includes('TL;DR'))) {
        recommendations.push({
          priority: 'high',
          category: 'Structured Content',
          issue: 'Missing TL;DR or summary section',
          solution: 'Add a concise summary (40-60 words) at the top of the page',
          impact: 9
        });
      }
    }

    // Answer Blocks
    if (dimensions.answerBlocks?.score < 70) {
      recommendations.push({
        priority: 'high',
        category: 'Answer Blocks',
        issue: 'No concise answer blocks for AI extraction',
        solution: 'Add 40-60 word paragraphs that directly answer key questions',
        impact: 8
      });
    }

    // Citation Readiness
    if (dimensions.citationReadiness?.score < 70) {
      const issues = dimensions.citationReadiness.issues || [];
      if (issues.some(i => i.issue.includes('author'))) {
        recommendations.push({
          priority: 'medium',
          category: 'Citation',
          issue: 'Missing author information',
          solution: 'Add author name and credentials with Person schema',
          impact: 6
        });
      }
      if (issues.some(i => i.issue.includes('date'))) {
        recommendations.push({
          priority: 'medium',
          category: 'Citation',
          issue: 'Missing publish/update dates',
          solution: 'Add datePublished and dateModified in schema',
          impact: 6
        });
      }
    }

    // Sort by priority and impact
    return recommendations.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      return b.impact - a.impact;
    });
  }

  generateSummary(results) {
    const highPriority = results.recommendations.filter(r => r.priority === 'high').length;
    const mediumPriority = results.recommendations.filter(r => r.priority === 'medium').length;
    const lowPriority = results.recommendations.filter(r => r.priority === 'low').length;

    return {
      overallScore: results.geoScore,
      grade: results.grade,
      totalRecommendations: results.recommendations.length,
      highPriority,
      mediumPriority,
      lowPriority,
      topIssue: results.recommendations[0] || null
    };
  }

  async fetchContent(url) {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const client = parsedUrl.protocol === 'https:' ? https : http;

      const options = {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; SEO-GEO-Validator/1.0)'
        },
        timeout: 10000
      };

      client.get(url, options, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      }).on('error', reject).on('timeout', () => reject(new Error('Request timeout')));
    });
  }

  async fetchRobotsTxt(baseUrl) {
    const robotsUrl = `${baseUrl}/robots.txt`;

    try {
      return await this.fetchContent(robotsUrl);
    } catch (error) {
      throw new Error(`Could not fetch robots.txt: ${error.message}`);
    }
  }

  parseRobotsTxt(robotsTxt) {
    const lines = robotsTxt.split('\n');
    const rules = [];
    let currentUserAgent = null;

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.startsWith('User-agent:')) {
        currentUserAgent = trimmed.substring(11).trim();
      } else if (trimmed.startsWith('Allow:') || trimmed.startsWith('Disallow:')) {
        const [directive, path] = trimmed.split(':').map(s => s.trim());
        rules.push({
          userAgent: currentUserAgent,
          directive: directive.toLowerCase(),
          path
        });
      }
    }

    return rules;
  }

  checkCrawlerAccess(robotsTxt, userAgent) {
    const lines = robotsTxt.toLowerCase().split('\n');
    let currentAgent = null;
    let isAllowed = 'unknown'; // default to unknown

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      if (line.startsWith('user-agent:')) {
        const agent = line.substring(11).trim();
        currentAgent = (agent === '*' || agent === userAgent.toLowerCase()) ? agent : null;
      }

      if (currentAgent && line.startsWith('allow:')) {
        const path = line.substring(6).trim();
        if (path === '/' || path === '') {
          isAllowed = 'allowed';
        }
      }

      if (currentAgent && line.startsWith('disallow:')) {
        const path = line.substring(9).trim();
        if (path === '/' || path === '') {
          isAllowed = 'disallowed';
        }
      }
    }

    return isAllowed;
  }
}

// CLI handling
async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
SEO GEO Validator - Generative Engine Optimization Analysis

Usage:
  node seo-geo-validator.js <url> [options]
  node seo-geo-validator.js ./crawl-results.json --format json

Options:
  --check-robots       Fetch and analyze robots.txt for AI crawler access
  --format <format>    Input format: url, json (default: url)
  --output <file>      Save results to JSON file

Examples:
  node seo-geo-validator.js https://example.com --check-robots
  node seo-geo-validator.js ./crawl.json --format json --output geo-results.json

GEO Dimensions:
  • AI Crawler Access (25%) - GPTBot, Google-Extended, Claude-Web access
  • Entity Markup (25%) - Organization, WebSite, Person schema completeness
  • Structured Content (20%) - TL;DR, lists, tables, Q&A format
  • Answer Blocks (20%) - 40-60 word concise answers for AI extraction
  • Citation Readiness (10%) - Author info, dates, external sources

Exit codes:
  0 - Success
  1 - Error
`);
    process.exit(0);
  }

  const input = args[0];
  const options = {
    checkRobots: args.includes('--check-robots'),
    format: 'url',
    outputFile: null
  };

  // Parse options
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--format' && args[i + 1]) {
      options.format = args[i + 1];
      i++;
    } else if (args[i] === '--output' && args[i + 1]) {
      options.outputFile = args[i + 1];
      i++;
    }
  }

  const validator = new SEOGEOValidator();

  try {
    let result;

    if (options.format === 'json') {
      const crawlData = JSON.parse(fs.readFileSync(input, 'utf-8'));
      result = await validator.validateJSON(crawlData, options);
    } else {
      result = await validator.validateURL(input, options);
    }

    // Save to file if specified
    if (options.outputFile) {
      fs.writeFileSync(options.outputFile, JSON.stringify(result, null, 2));
      console.log(`\n📄 Results saved to: ${options.outputFile}`);
    }

    // Display summary
    console.log('\n' + '='.repeat(60));
    console.log('SEO GEO VALIDATION REPORT');
    console.log('='.repeat(60));
    console.log(`\nOverall GEO Score: ${result.geoScore}/100 (${result.grade})`);
    console.log(`\nDimension Scores:`);

    if (result.dimensions.aiCrawlerAccess) {
      console.log(`  AI Crawler Access: ${result.dimensions.aiCrawlerAccess.score}/100 (${result.dimensions.aiCrawlerAccess.status})`);
    }
    console.log(`  Entity Markup: ${result.dimensions.entityMarkup.score}/100 (${result.dimensions.entityMarkup.status})`);
    console.log(`  Structured Content: ${result.dimensions.structuredContent.score}/100 (${result.dimensions.structuredContent.status})`);
    console.log(`  Answer Blocks: ${result.dimensions.answerBlocks.score}/100 (${result.dimensions.answerBlocks.status})`);
    console.log(`  Citation Readiness: ${result.dimensions.citationReadiness.score}/100 (${result.dimensions.citationReadiness.status})`);

    if (result.recommendations.length > 0) {
      console.log(`\n🔝 Top ${Math.min(5, result.recommendations.length)} Recommendations:\n`);

      result.recommendations.slice(0, 5).forEach((rec, i) => {
        const emoji = rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : '🟢';
        console.log(`${i + 1}. ${emoji} [${rec.category.toUpperCase()}] ${rec.issue}`);
        console.log(`   ${rec.solution}`);
        console.log(`   Impact: ${rec.impact}/10\n`);
      });
    }

    console.log('='.repeat(60) + '\n');

    process.exit(0);

  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = SEOGEOValidator;
