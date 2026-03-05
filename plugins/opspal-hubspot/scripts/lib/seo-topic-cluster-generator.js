#!/usr/bin/env node

/**
 * SEO Topic Cluster Generator
 *
 * Generates pillar pages and cluster pages for topic cluster SEO strategy.
 * Creates internal linking maps and Mermaid diagrams.
 *
 * @module seo-topic-cluster-generator
 */

const fs = require('fs');
const path = require('path');

class SEOTopicClusterGenerator {
  constructor(options = {}) {
    this.clusterCount = options.clusterCount || 8;
  }

  /**
   * Generate topic cluster
   */
  async generateCluster(options) {
    const { pillarTopic, clusterCount = this.clusterCount } = options;

    console.log(`🏗️  Generating topic cluster for: "${pillarTopic}"`);

    // Step 1: Generate pillar page structure
    const pillar = this.generatePillarPage(pillarTopic);

    // Step 2: Generate cluster page topics
    const clusters = this.generateClusterPages(pillarTopic, clusterCount);

    // Step 3: Create internal linking map
    const internalLinkingMap = this.createInternalLinkingMap(pillar, clusters);

    // Step 4: Generate Mermaid diagram
    const mermaidDiagram = this.generateMermaidDiagram(pillar, clusters);

    console.log(`✅ Topic cluster generated: 1 pillar + ${clusters.length} clusters`);

    return {
      pillar,
      clusters,
      internalLinkingMap,
      mermaidDiagram
    };
  }

  /**
   * Generate pillar page structure
   */
  generatePillarPage(topic) {
    return {
      title: `Complete Guide to ${topic}`,
      slug: topic.toLowerCase().replace(/\s+/g, '-'),
      type: 'pillar',
      sections: [
        `What is ${topic}?`,
        `Why ${topic} Matters`,
        `Key Components of ${topic}`,
        `Best Practices for ${topic}`,
        `Common Challenges with ${topic}`,
        `${topic} Tools and Resources`,
        `Getting Started with ${topic}`,
        `${topic} Case Studies`
      ],
      targetKeyword: topic.toLowerCase(),
      estimatedWordCount: 3000,
      metaDescription: `Comprehensive guide to ${topic}. Learn everything you need to know about ${topic.toLowerCase()}, including best practices, tools, and real-world examples.`
    };
  }

  /**
   * Generate cluster page topics
   */
  generateClusterPages(pillarTopic, count) {
    const clusterTopics = [
      `${pillarTopic} Best Practices`,
      `How to Get Started with ${pillarTopic}`,
      `${pillarTopic} Tools and Software`,
      `${pillarTopic} Strategies for Success`,
      `Common ${pillarTopic} Mistakes to Avoid`,
      `${pillarTopic} Case Studies and Examples`,
      `${pillarTopic} ROI and Measurement`,
      `Advanced ${pillarTopic} Techniques`,
      `${pillarTopic} for Small Business`,
      `${pillarTopic} Implementation Guide`,
      `${pillarTopic} Trends and Future`,
      `${pillarTopic} vs Alternatives`
    ];

    return clusterTopics.slice(0, count).map((title, index) => ({
      title,
      slug: title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
      type: 'cluster',
      targetKeyword: title.toLowerCase(),
      estimatedWordCount: 1200,
      metaDescription: `${title}. Learn proven strategies and actionable tips for ${pillarTopic.toLowerCase()}.`,
      contentBrief: this.generateContentBrief(title, pillarTopic)
    }));
  }

  /**
   * Generate content brief for cluster page
   */
  generateContentBrief(title, pillarTopic) {
    return {
      mainPoints: [
        `Introduction to ${title}`,
        'Key concepts and definitions',
        'Step-by-step implementation guide',
        'Real-world examples',
        'Common pitfalls to avoid',
        'Expert tips and recommendations',
        `Link back to ${pillarTopic} pillar page`
      ],
      internalLinks: [
        `Link to ${pillarTopic} pillar page`,
        'Link to 2-3 related cluster pages'
      ],
      suggestedMedia: [
        'Featured image',
        '2-3 supporting diagrams or screenshots',
        'Embedded video (optional)'
      ]
    };
  }

  /**
   * Create internal linking map
   */
  createInternalLinkingMap(pillar, clusters) {
    const linkingMap = {
      pillar: {
        slug: pillar.slug,
        linksTo: clusters.map(c => c.slug)
      },
      clusters: clusters.map(cluster => ({
        slug: cluster.slug,
        linksTo: [
          pillar.slug,  // Always link back to pillar
          ...this.selectRelatedClusters(cluster, clusters, 2)  // 2 related clusters
        ]
      }))
    };

    return linkingMap;
  }

  /**
   * Select related cluster pages
   */
  selectRelatedClusters(currentCluster, allClusters, count) {
    return allClusters
      .filter(c => c.slug !== currentCluster.slug)
      .slice(0, count)
      .map(c => c.slug);
  }

  /**
   * Generate Mermaid diagram
   */
  generateMermaidDiagram(pillar, clusters) {
    let diagram = 'graph TB\n';
    diagram += `  Pillar["${pillar.title}"]\n`;

    clusters.forEach((cluster, index) => {
      const nodeId = `Cluster${index + 1}`;
      diagram += `  ${nodeId}["${cluster.title}"]\n`;
      diagram += `  Pillar --> ${nodeId}\n`;
      diagram += `  ${nodeId} --> Pillar\n`;
    });

    return diagram;
  }

  /**
   * Export cluster to files
   */
  exportCluster(cluster, outputDir) {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Export pillar page outline
    const pillarFile = path.join(outputDir, `${cluster.pillar.slug}-pillar.md`);
    fs.writeFileSync(pillarFile, this.generatePillarMarkdown(cluster.pillar));

    // Export cluster page outlines
    cluster.clusters.forEach(clusterPage => {
      const clusterFile = path.join(outputDir, `${clusterPage.slug}.md`);
      fs.writeFileSync(clusterFile, this.generateClusterMarkdown(clusterPage));
    });

    // Export Mermaid diagram
    const diagramFile = path.join(outputDir, 'topic-cluster-diagram.mmd');
    fs.writeFileSync(diagramFile, cluster.mermaidDiagram);

    // Export linking map
    const linkingMapFile = path.join(outputDir, 'internal-linking-map.json');
    fs.writeFileSync(linkingMapFile, JSON.stringify(cluster.internalLinkingMap, null, 2));

    console.log(`📁 Cluster exported to: ${outputDir}`);
  }

  /**
   * Generate pillar page markdown
   */
  generatePillarMarkdown(pillar) {
    let md = `# ${pillar.title}\n\n`;
    md += `**Target Keyword**: ${pillar.targetKeyword}\n`;
    md += `**Estimated Word Count**: ${pillar.estimatedWordCount}\n`;
    md += `**Meta Description**: ${pillar.metaDescription}\n\n`;
    md += `## Sections\n\n`;
    pillar.sections.forEach(section => {
      md += `### ${section}\n\n`;
      md += `[Content for ${section}]\n\n`;
    });
    return md;
  }

  /**
   * Generate cluster page markdown
   */
  generateClusterMarkdown(cluster) {
    let md = `# ${cluster.title}\n\n`;
    md += `**Target Keyword**: ${cluster.targetKeyword}\n`;
    md += `**Estimated Word Count**: ${cluster.estimatedWordCount}\n`;
    md += `**Meta Description**: ${cluster.metaDescription}\n\n`;
    md += `## Content Brief\n\n`;
    md += `### Main Points\n\n`;
    cluster.contentBrief.mainPoints.forEach(point => {
      md += `- ${point}\n`;
    });
    md += `\n### Internal Links\n\n`;
    cluster.contentBrief.internalLinks.forEach(link => {
      md += `- ${link}\n`;
    });
    md += `\n### Suggested Media\n\n`;
    cluster.contentBrief.suggestedMedia.forEach(media => {
      md += `- ${media}\n`;
    });
    return md;
  }
}

// CLI Usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(`
Usage: node seo-topic-cluster-generator.js <pillar-topic> [--count N] [--export-dir DIR]

Examples:
  node seo-topic-cluster-generator.js "Marketing Automation"
  node seo-topic-cluster-generator.js "Email Marketing" --count 10 --export-dir ./clusters

Options:
  --count <n>         Number of cluster pages (default: 8)
  --export-dir <dir>  Export cluster files to directory
    `);
    process.exit(0);
  }

  const pillarTopic = args[0];
  const options = {
    pillarTopic,
    clusterCount: 8
  };

  let exportDir = null;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--count' && args[i + 1]) {
      options.clusterCount = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--export-dir' && args[i + 1]) {
      exportDir = args[i + 1];
      i++;
    }
  }

  (async () => {
    try {
      const generator = new SEOTopicClusterGenerator();
      const cluster = await generator.generateCluster(options);

      console.log('\n📊 Topic Cluster Generated:\n');
      console.log(`Pillar Page: ${cluster.pillar.title}`);
      console.log(`Cluster Pages: ${cluster.clusters.length}`);
      console.log('\nCluster Topics:');
      cluster.clusters.forEach((c, i) => {
        console.log(`  ${i + 1}. ${c.title}`);
      });

      if (exportDir) {
        generator.exportCluster(cluster, exportDir);
      }

      console.log('\n✅ Topic cluster generation complete');
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
      process.exit(1);
    }
  })();
}

module.exports = SEOTopicClusterGenerator;
