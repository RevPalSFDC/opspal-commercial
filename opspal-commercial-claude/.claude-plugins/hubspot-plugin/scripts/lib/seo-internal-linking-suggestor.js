#!/usr/bin/env node

/**
 * SEO Internal Linking Suggestor
 *
 * Suggests strategic internal linking opportunities:
 * - Orphan page detection
 * - Hub page identification
 * - Topic cluster analysis
 * - Anchor text suggestions
 * - Link distribution analysis
 * - Priority scoring
 *
 * Part of Phase 3: Content Optimization & AEO
 *
 * Usage:
 *   node seo-internal-linking-suggestor.js ./crawl-results.json
 *   node seo-internal-linking-suggestor.js https://example.com --analyze-clusters
 *   node seo-internal-linking-suggestor.js ./crawl.json --output linking.json
 */

const fs = require('fs');
const path = require('path');
const { URL } = require('url');

class SEOInternalLinkingSuggestor {
  constructor(options = {}) {
    this.options = {
      minInboundLinks: 3,        // Minimum links to not be orphan
      minWordCount: 500,         // Minimum word count for hub page
      minClusterSize: 3,         // Minimum pages in cluster
      maxLinkSuggestions: 10,    // Max suggestions per page
      ...options
    };

    // Link opportunity types with scoring
    this.opportunityTypes = {
      'orphan': { weight: 10, description: 'Page with no internal links' },
      'hub-to-spoke': { weight: 8, description: 'Link from pillar to cluster content' },
      'spoke-to-hub': { weight: 8, description: 'Link from cluster content to pillar' },
      'related-content': { weight: 6, description: 'Link between related topics' },
      'deep-link': { weight: 7, description: 'Link to deep page' },
      'contextual': { weight: 5, description: 'Natural in-content link' }
    };
  }

  /**
   * Analyze internal linking structure
   */
  async analyzeLinking(input, options = {}) {
    const { analyzeClusters = true, outputFile = null } = options;

    console.log('🔗 Analyzing internal linking structure...');

    // Load crawl data
    const crawl = this.loadCrawl(input);

    // Build link graph
    const linkGraph = this.buildLinkGraph(crawl);

    // Detect orphan pages
    const orphanPages = this.detectOrphanPages(crawl, linkGraph);

    // Identify hub pages
    const hubPages = this.identifyHubPages(crawl, linkGraph);

    // Analyze topic clusters (if requested)
    let clusters = [];
    if (analyzeClusters) {
      clusters = this.analyzeTopicClusters(crawl, linkGraph);
    }

    // Generate link recommendations
    const recommendations = this.generateLinkRecommendations(
      crawl,
      linkGraph,
      orphanPages,
      hubPages,
      clusters
    );

    // Analyze link distribution
    const linkDistribution = this.analyzeLinkDistribution(linkGraph);

    // Calculate overall linking health score
    const healthScore = this.calculateLinkingHealthScore({
      orphanPages,
      hubPages,
      linkDistribution,
      totalPages: crawl.pages.length
    });

    const result = {
      healthScore,
      totalPages: crawl.pages.length,
      orphanPages,
      hubPages,
      clusters: analyzeClusters ? clusters : [],
      linkDistribution,
      recommendations,
      summary: this.generateSummary({
        healthScore,
        orphanPages,
        hubPages,
        clusters,
        recommendations
      })
    };

    // Save to file if specified
    if (outputFile) {
      fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));
      console.log(`\n📄 Results saved to: ${outputFile}`);
    }

    return result;
  }

  /**
   * Build link graph
   */
  buildLinkGraph(crawl) {
    const graph = {
      nodes: {},      // url -> { title, wordCount, links, inbound, outbound }
      edges: []       // { from, to, anchorText, context }
    };

    // Initialize nodes
    crawl.pages?.forEach(page => {
      graph.nodes[page.url] = {
        url: page.url,
        title: page.title,
        wordCount: page.content?.wordCount || 0,
        headings: page.content?.headings || {},
        inboundLinks: [],
        outboundLinks: [],
        depth: this.calculateDepth(page.url)
      };
    });

    // Build edges from internal links
    crawl.pages?.forEach(page => {
      page.links?.internal?.forEach(link => {
        if (graph.nodes[link.href]) {
          const edge = {
            from: page.url,
            to: link.href,
            anchorText: link.text || '',
            context: link.context || ''
          };

          graph.edges.push(edge);
          graph.nodes[page.url].outboundLinks.push(link.href);
          graph.nodes[link.href].inboundLinks.push(page.url);
        }
      });
    });

    return graph;
  }

  /**
   * Detect orphan pages (pages with no internal links)
   */
  detectOrphanPages(crawl, linkGraph) {
    const orphans = [];

    Object.values(linkGraph.nodes).forEach(node => {
      if (node.inboundLinks.length < this.options.minInboundLinks) {
        const suggestedLinks = this.suggestLinksForOrphan(node, linkGraph);

        orphans.push({
          url: node.url,
          title: node.title,
          currentInboundLinks: node.inboundLinks.length,
          wordCount: node.wordCount,
          depth: node.depth,
          severity: this.calculateOrphanSeverity(node),
          suggestedLinks: suggestedLinks.slice(0, 5)
        });
      }
    });

    // Sort by severity (highest first)
    return orphans.sort((a, b) => b.severity - a.severity);
  }

  /**
   * Identify hub (pillar) pages
   */
  identifyHubPages(crawl, linkGraph) {
    const hubs = [];

    Object.values(linkGraph.nodes).forEach(node => {
      const isHub = this.isHubPage(node, linkGraph);

      if (isHub) {
        const cluster = this.findCluster(node, linkGraph);

        hubs.push({
          url: node.url,
          title: node.title,
          confidence: isHub.confidence,
          reasons: isHub.reasons,
          clusterSize: cluster.length,
          suggestedSpokes: this.suggestSpokes(node, linkGraph, cluster),
          metrics: {
            inboundLinks: node.inboundLinks.length,
            outboundLinks: node.outboundLinks.length,
            wordCount: node.wordCount,
            depth: node.depth
          }
        });
      }
    });

    // Sort by confidence (highest first)
    return hubs.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Analyze topic clusters
   */
  analyzeTopicClusters(crawl, linkGraph) {
    const clusters = [];
    const assigned = new Set();

    // Start with hub pages
    const hubs = this.identifyHubPages(crawl, linkGraph);

    hubs.forEach(hub => {
      const clusterPages = this.findCluster(linkGraph.nodes[hub.url], linkGraph);

      if (clusterPages.length >= this.options.minClusterSize) {
        const cluster = {
          hubUrl: hub.url,
          hubTitle: hub.title,
          topic: this.extractTopic(hub.title),
          pages: clusterPages.map(url => ({
            url,
            title: linkGraph.nodes[url].title,
            linkedToHub: linkGraph.nodes[url].outboundLinks.includes(hub.url),
            hubLinksTo: linkGraph.nodes[hub.url].outboundLinks.includes(url)
          })),
          completeness: this.calculateClusterCompleteness(hub.url, clusterPages, linkGraph),
          suggestedLinks: this.suggestClusterLinks(hub.url, clusterPages, linkGraph)
        };

        clusters.push(cluster);
        clusterPages.forEach(url => assigned.add(url));
      }
    });

    // Find unclustered pages
    const unclustered = Object.keys(linkGraph.nodes).filter(url => !assigned.has(url));

    if (unclustered.length > 0) {
      clusters.push({
        hubUrl: null,
        hubTitle: 'Unclustered Content',
        topic: 'various',
        pages: unclustered.map(url => ({
          url,
          title: linkGraph.nodes[url].title,
          linkedToHub: false,
          hubLinksTo: false
        })),
        completeness: 0,
        suggestedLinks: []
      });
    }

    return clusters;
  }

  /**
   * Generate link recommendations
   */
  generateLinkRecommendations(crawl, linkGraph, orphanPages, hubPages, clusters) {
    const recommendations = [];

    // Orphan page recommendations
    orphanPages.forEach(orphan => {
      orphan.suggestedLinks.forEach(link => {
        recommendations.push({
          type: 'orphan',
          priority: this.scoreToPriority(link.opportunity),
          fromUrl: link.fromUrl,
          fromTitle: linkGraph.nodes[link.fromUrl]?.title || '',
          toUrl: orphan.url,
          toTitle: orphan.title,
          anchorText: link.anchorText,
          reasoning: link.reasoning,
          opportunity: link.opportunity,
          effort: 'low'
        });
      });
    });

    // Hub-to-spoke recommendations
    hubPages.forEach(hub => {
      hub.suggestedSpokes?.forEach(spoke => {
        recommendations.push({
          type: 'hub-to-spoke',
          priority: this.scoreToPriority(spoke.opportunity),
          fromUrl: hub.url,
          fromTitle: hub.title,
          toUrl: spoke.url,
          toTitle: spoke.title,
          anchorText: spoke.anchorText,
          reasoning: 'Link from pillar page to cluster content',
          opportunity: spoke.opportunity,
          effort: 'low'
        });
      });
    });

    // Cluster internal linking recommendations
    clusters.forEach(cluster => {
      cluster.suggestedLinks?.forEach(link => {
        recommendations.push({
          type: link.type,
          priority: this.scoreToPriority(link.opportunity),
          fromUrl: link.fromUrl,
          fromTitle: linkGraph.nodes[link.fromUrl]?.title || '',
          toUrl: link.toUrl,
          toTitle: linkGraph.nodes[link.toUrl]?.title || '',
          anchorText: link.anchorText,
          reasoning: link.reasoning,
          opportunity: link.opportunity,
          effort: 'low'
        });
      });
    });

    // Deep link recommendations
    const deepPages = this.findDeepPages(linkGraph);
    deepPages.forEach(deep => {
      const suggestedFromPages = this.suggestLinksToDeepPage(deep, linkGraph);

      suggestedFromPages.slice(0, 3).forEach(suggestion => {
        recommendations.push({
          type: 'deep-link',
          priority: this.scoreToPriority(suggestion.opportunity),
          fromUrl: suggestion.fromUrl,
          fromTitle: linkGraph.nodes[suggestion.fromUrl]?.title || '',
          toUrl: deep.url,
          toTitle: deep.title,
          anchorText: suggestion.anchorText,
          reasoning: 'Link to deep page from higher-level content',
          opportunity: suggestion.opportunity,
          effort: 'low'
        });
      });
    });

    // Sort by opportunity (highest first)
    return recommendations.sort((a, b) => b.opportunity - a.opportunity);
  }

  /**
   * Analyze link distribution
   */
  analyzeLinkDistribution(linkGraph) {
    const nodes = Object.values(linkGraph.nodes);

    const inboundCounts = nodes.map(n => n.inboundLinks.length);
    const outboundCounts = nodes.map(n => n.outboundLinks.length);

    const avgInbound = inboundCounts.reduce((sum, c) => sum + c, 0) / nodes.length;
    const avgOutbound = outboundCounts.reduce((sum, c) => sum + c, 0) / nodes.length;

    // Find pages with most/least links
    const sorted = nodes.sort((a, b) => b.inboundLinks.length - a.inboundLinks.length);

    return {
      avgInboundLinks: Math.round(avgInbound * 10) / 10,
      avgOutboundLinks: Math.round(avgOutbound * 10) / 10,
      maxInbound: inboundCounts.length > 0 ? Math.max(...inboundCounts) : 0,
      minInbound: inboundCounts.length > 0 ? Math.min(...inboundCounts) : 0,
      maxOutbound: outboundCounts.length > 0 ? Math.max(...outboundCounts) : 0,
      minOutbound: outboundCounts.length > 0 ? Math.min(...outboundCounts) : 0,
      mostLinked: sorted.slice(0, 5).map(n => ({
        url: n.url,
        title: n.title,
        inboundLinks: n.inboundLinks.length
      })),
      leastLinked: sorted.slice(-5).map(n => ({
        url: n.url,
        title: n.title,
        inboundLinks: n.inboundLinks.length
      }))
    };
  }

  /**
   * Calculate linking health score (0-100)
   */
  calculateLinkingHealthScore(data) {
    let score = 100;

    // Orphan page penalty
    const orphanPercentage = (data.orphanPages.length / data.totalPages) * 100;
    if (orphanPercentage > 20) score -= 30;
    else if (orphanPercentage > 10) score -= 15;
    else if (orphanPercentage > 5) score -= 5;

    // Hub page bonus
    if (data.hubPages.length >= 3) score += 10;
    else if (data.hubPages.length >= 1) score += 5;

    // Link distribution penalty
    if (data.linkDistribution.avgInboundLinks < 2) score -= 20;
    else if (data.linkDistribution.avgInboundLinks < 3) score -= 10;

    return Math.max(0, Math.min(100, score));
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Suggest links for orphan page
   */
  suggestLinksForOrphan(orphan, linkGraph) {
    const suggestions = [];

    Object.values(linkGraph.nodes).forEach(node => {
      if (node.url === orphan.url) return;

      const relevance = this.calculateRelevance(node, orphan);

      if (relevance > 0.3) {
        suggestions.push({
          fromUrl: node.url,
          fromTitle: node.title,
          anchorText: this.generateAnchorText(orphan),
          opportunity: Math.round(relevance * 10),
          reasoning: this.generateReasoning(node, orphan)
        });
      }
    });

    return suggestions.sort((a, b) => b.opportunity - a.opportunity);
  }

  /**
   * Determine if page is a hub
   */
  isHubPage(node, linkGraph) {
    const reasons = [];
    let score = 0;

    // High word count
    if (node.wordCount > this.options.minWordCount) {
      reasons.push('Comprehensive content (high word count)');
      score += 2;
    }

    // High outbound links
    if (node.outboundLinks.length > 5) {
      reasons.push('Links to many related pages');
      score += 2;
    }

    // High inbound links
    if (node.inboundLinks.length > 3) {
      reasons.push('Referenced by multiple pages');
      score += 2;
    }

    // Low depth (closer to homepage)
    if (node.depth <= 2) {
      reasons.push('High in site hierarchy');
      score += 1;
    }

    // Broad topic in title
    if (this.hasBroadTopic(node.title)) {
      reasons.push('Broad topic in title');
      score += 2;
    }

    if (score >= 5) {
      return {
        isHub: true,
        confidence: Math.min(score / 9, 1),
        reasons
      };
    }

    return false;
  }

  /**
   * Find cluster pages for hub
   */
  findCluster(hubNode, linkGraph) {
    const cluster = [];
    const hubTopic = this.extractTopic(hubNode.title);

    Object.values(linkGraph.nodes).forEach(node => {
      if (node.url === hubNode.url) return;

      const nodeTopic = this.extractTopic(node.title);
      const isRelated = this.isRelatedTopic(hubTopic, nodeTopic);

      // Check if node is in hub's cluster
      if (isRelated && (
        node.inboundLinks.includes(hubNode.url) ||
        node.outboundLinks.includes(hubNode.url) ||
        this.shareCommonLinks(node, hubNode, linkGraph)
      )) {
        cluster.push(node.url);
      }
    });

    return cluster;
  }

  /**
   * Suggest spoke pages for hub
   */
  suggestSpokes(hubNode, linkGraph, existingCluster) {
    const suggestions = [];

    Object.values(linkGraph.nodes).forEach(node => {
      if (node.url === hubNode.url || existingCluster.includes(node.url)) return;

      const relevance = this.calculateRelevance(hubNode, node);

      if (relevance > 0.4) {
        suggestions.push({
          url: node.url,
          title: node.title,
          anchorText: this.generateAnchorText(node),
          opportunity: Math.round(relevance * 10),
          currentlyLinked: hubNode.outboundLinks.includes(node.url)
        });
      }
    });

    return suggestions
      .filter(s => !s.currentlyLinked)
      .sort((a, b) => b.opportunity - a.opportunity)
      .slice(0, 5);
  }

  /**
   * Calculate cluster completeness
   */
  calculateClusterCompleteness(hubUrl, clusterPages, linkGraph) {
    let totalExpectedLinks = 0;
    let actualLinks = 0;

    clusterPages.forEach(pageUrl => {
      // Spoke should link to hub
      totalExpectedLinks++;
      if (linkGraph.nodes[pageUrl].outboundLinks.includes(hubUrl)) {
        actualLinks++;
      }

      // Hub should link to spoke
      totalExpectedLinks++;
      if (linkGraph.nodes[hubUrl].outboundLinks.includes(pageUrl)) {
        actualLinks++;
      }
    });

    return totalExpectedLinks > 0
      ? Math.round((actualLinks / totalExpectedLinks) * 100)
      : 0;
  }

  /**
   * Suggest cluster internal links
   */
  suggestClusterLinks(hubUrl, clusterPages, linkGraph) {
    const suggestions = [];

    clusterPages.forEach(pageUrl => {
      const node = linkGraph.nodes[pageUrl];

      // Spoke-to-hub link if missing
      if (!node.outboundLinks.includes(hubUrl)) {
        suggestions.push({
          type: 'spoke-to-hub',
          fromUrl: pageUrl,
          toUrl: hubUrl,
          anchorText: this.generateAnchorText(linkGraph.nodes[hubUrl]),
          opportunity: 8,
          reasoning: 'Link from cluster content back to pillar page'
        });
      }

      // Hub-to-spoke link if missing
      if (!linkGraph.nodes[hubUrl].outboundLinks.includes(pageUrl)) {
        suggestions.push({
          type: 'hub-to-spoke',
          fromUrl: hubUrl,
          toUrl: pageUrl,
          anchorText: this.generateAnchorText(node),
          opportunity: 7,
          reasoning: 'Link from pillar page to cluster content'
        });
      }
    });

    return suggestions;
  }

  /**
   * Find deep pages (high depth, low inbound links)
   */
  findDeepPages(linkGraph) {
    return Object.values(linkGraph.nodes)
      .filter(node => node.depth >= 3 && node.inboundLinks.length < 2)
      .sort((a, b) => b.depth - a.depth)
      .slice(0, 10);
  }

  /**
   * Suggest links to deep page
   */
  suggestLinksToDeepPage(deepPage, linkGraph) {
    const suggestions = [];

    Object.values(linkGraph.nodes).forEach(node => {
      if (node.url === deepPage.url || node.depth >= deepPage.depth) return;

      const relevance = this.calculateRelevance(node, deepPage);

      if (relevance > 0.3) {
        suggestions.push({
          fromUrl: node.url,
          anchorText: this.generateAnchorText(deepPage),
          opportunity: Math.round(relevance * 10) + (5 - node.depth)
        });
      }
    });

    return suggestions.sort((a, b) => b.opportunity - a.opportunity);
  }

  /**
   * Calculate relevance between two nodes
   */
  calculateRelevance(node1, node2) {
    let relevance = 0;

    // Topic similarity
    const topic1 = this.extractTopic(node1.title);
    const topic2 = this.extractTopic(node2.title);

    if (this.isRelatedTopic(topic1, topic2)) {
      relevance += 0.5;
    }

    // URL similarity
    if (this.shareUrlPath(node1.url, node2.url)) {
      relevance += 0.3;
    }

    // Common outbound links
    const commonLinks = node1.outboundLinks.filter(link =>
      node2.outboundLinks.includes(link)
    ).length;

    if (commonLinks > 0) {
      relevance += Math.min(commonLinks * 0.1, 0.2);
    }

    return Math.min(relevance, 1);
  }

  /**
   * Generate anchor text
   */
  generateAnchorText(node) {
    // Use title if short enough
    if (node.title.length < 60) {
      return node.title;
    }

    // Extract topic
    const topic = this.extractTopic(node.title);
    return `Learn about ${topic}`;
  }

  /**
   * Generate reasoning for link suggestion
   */
  generateReasoning(fromNode, toNode) {
    const topic = this.extractTopic(toNode.title);
    return `Both pages cover "${topic}" topic`;
  }

  /**
   * Calculate orphan severity (0-10)
   */
  calculateOrphanSeverity(node) {
    let severity = 5;

    // No inbound links at all
    if (node.inboundLinks.length === 0) severity += 3;

    // High word count (valuable content)
    if (node.wordCount > 1000) severity += 1;

    // Deep in hierarchy
    if (node.depth > 3) severity += 1;

    return Math.min(severity, 10);
  }

  /**
   * Calculate depth (distance from homepage)
   */
  calculateDepth(url) {
    const path = new URL(url).pathname;
    return path.split('/').filter(p => p).length;
  }

  /**
   * Extract topic from title
   */
  extractTopic(title) {
    // Remove common words and extract core topic
    return title
      .toLowerCase()
      .replace(/^(how to|what is|guide to|complete guide|ultimate guide)\s+/i, '')
      .replace(/\s+(guide|tutorial|tips|best practices)$/i, '')
      .trim();
  }

  /**
   * Check if topics are related
   */
  isRelatedTopic(topic1, topic2) {
    const words1 = topic1.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const words2 = topic2.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    const common = words1.filter(w => words2.includes(w));
    return common.length >= 2;
  }

  /**
   * Check if URLs share path
   */
  shareUrlPath(url1, url2) {
    const path1 = new URL(url1).pathname.split('/').filter(p => p);
    const path2 = new URL(url2).pathname.split('/').filter(p => p);

    // Check if they share at least one path segment
    return path1.some(p => path2.includes(p));
  }

  /**
   * Check if nodes share common links
   */
  shareCommonLinks(node1, node2, linkGraph) {
    const common = node1.outboundLinks.filter(link =>
      node2.outboundLinks.includes(link)
    );
    return common.length >= 2;
  }

  /**
   * Check if title has broad topic
   */
  hasBroadTopic(title) {
    const broadKeywords = ['guide', 'complete', 'ultimate', 'comprehensive', 'introduction', 'overview'];
    const lower = title.toLowerCase();
    return broadKeywords.some(kw => lower.includes(kw));
  }

  scoreToPriority(score) {
    if (score >= 8) return 'high';
    if (score >= 5) return 'medium';
    return 'low';
  }

  /**
   * Generate summary
   */
  generateSummary(data) {
    const { healthScore, orphanPages, hubPages, clusters, recommendations } = data;

    const highPriority = recommendations.filter(r => r.priority === 'high').length;
    const mediumPriority = recommendations.filter(r => r.priority === 'medium').length;

    return {
      healthScore,
      assessment: this.assessLinkingHealth(healthScore),
      orphanCount: orphanPages.length,
      hubCount: hubPages.length,
      clusterCount: clusters.length,
      totalRecommendations: recommendations.length,
      highPriority,
      mediumPriority,
      quickWins: recommendations.filter(r =>
        r.priority === 'high' && r.effort === 'low'
      ).length
    };
  }

  assessLinkingHealth(score) {
    if (score >= 80) return 'Excellent - Strong internal linking structure';
    if (score >= 60) return 'Good - Some improvements needed';
    if (score >= 40) return 'Fair - Significant improvements needed';
    return 'Poor - Major structural issues';
  }

  /**
   * Load crawl data
   */
  loadCrawl(input) {
    if (typeof input === 'string') {
      if (input.startsWith('http')) {
        throw new Error('URL input not yet supported. Please provide crawl JSON file.');
      }
      return JSON.parse(fs.readFileSync(input, 'utf-8'));
    }
    return input;
  }
}

// ============================================================================
// CLI Interface
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    console.log(`
SEO Internal Linking Suggestor - Suggest strategic internal linking opportunities

Usage:
  node seo-internal-linking-suggestor.js <crawl-file> [options]

Options:
  --analyze-clusters       Analyze topic clusters (default: true)
  --no-clusters            Skip cluster analysis
  --output <file>          Save results to JSON file
  --min-inbound <n>        Minimum inbound links (default: 3)
  --help                   Show this help message

Examples:
  node seo-internal-linking-suggestor.js ./crawl-results.json
  node seo-internal-linking-suggestor.js ./crawl.json --output linking.json
  node seo-internal-linking-suggestor.js ./crawl.json --no-clusters

Output:
  - Orphan page detection with suggested links
  - Hub page identification
  - Topic cluster analysis
  - Link recommendations with priorities
  - Link distribution analysis
  - Overall linking health score
    `);
    process.exit(0);
  }

  const input = args[0];
  const options = {
    analyzeClusters: !args.includes('--no-clusters'),
    outputFile: null,
    minInboundLinks: 3
  };

  // Parse arguments
  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--output' && args[i + 1]) {
      options.outputFile = args[i + 1];
      i++;
    } else if (args[i] === '--min-inbound' && args[i + 1]) {
      options.minInboundLinks = parseInt(args[i + 1]);
      i++;
    }
  }

  const suggestor = new SEOInternalLinkingSuggestor({ minInboundLinks: options.minInboundLinks });

  try {
    const result = await suggestor.analyzeLinking(input, options);

    // Display summary
    console.log('\n' + '='.repeat(60));
    console.log('SEO INTERNAL LINKING ANALYSIS');
    console.log('='.repeat(60));
    console.log(`\nOverall Health Score: ${result.healthScore}/100`);
    console.log(`Assessment: ${result.summary.assessment}`);

    console.log(`\n📊 Overview:`);
    console.log(`  Total Pages: ${result.totalPages}`);
    console.log(`  Orphan Pages: ${result.summary.orphanCount}`);
    console.log(`  Hub Pages: ${result.summary.hubCount}`);
    if (options.analyzeClusters) {
      console.log(`  Topic Clusters: ${result.summary.clusterCount}`);
    }

    console.log(`\n📈 Link Distribution:`);
    console.log(`  Avg Inbound Links: ${result.linkDistribution.avgInboundLinks}`);
    console.log(`  Avg Outbound Links: ${result.linkDistribution.avgOutboundLinks}`);

    console.log(`\n💡 Recommendations: ${result.summary.totalRecommendations}`);
    console.log(`  High Priority: ${result.summary.highPriority}`);
    console.log(`  Medium Priority: ${result.summary.mediumPriority}`);
    console.log(`  Quick Wins: ${result.summary.quickWins}`);

    if (result.recommendations.length > 0) {
      console.log(`\n🔝 Top 5 Link Opportunities:`);
      result.recommendations.slice(0, 5).forEach((rec, i) => {
        console.log(`\n${i + 1}. ${rec.type.toUpperCase()} (${rec.priority} priority)`);
        console.log(`   From: ${rec.fromTitle}`);
        console.log(`   To: ${rec.toTitle}`);
        console.log(`   Anchor: "${rec.anchorText}"`);
        console.log(`   Score: ${rec.opportunity}/10`);
      });
    }

    console.log('\n' + '='.repeat(60) + '\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = SEOInternalLinkingSuggestor;
