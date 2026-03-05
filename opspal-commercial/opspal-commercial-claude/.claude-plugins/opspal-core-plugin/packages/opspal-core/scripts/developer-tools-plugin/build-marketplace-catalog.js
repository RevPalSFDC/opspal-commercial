#!/usr/bin/env node

/**
 * Marketplace Catalog Builder CLI
 *
 * Command-line interface for generating marketplace catalogs.
 * Uses the catalog-builder.js library for all functionality.
 *
 * Usage:
 *   node build-marketplace-catalog.js --all
 *   node build-marketplace-catalog.js --plugin <name>
 *   node build-marketplace-catalog.js --search <keyword>
 *   node build-marketplace-catalog.js --domain <domain>
 *
 * Examples:
 *   node build-marketplace-catalog.js --all --json > catalog.json
 *   node build-marketplace-catalog.js --all --markdown > CATALOG.md
 *   node build-marketplace-catalog.js --all --csv > catalog.csv
 *   node build-marketplace-catalog.js --search "metadata"
 *   node build-marketplace-catalog.js --domain salesforce
 */

const path = require('path');
const {
  buildCatalog,
  searchCatalog,
  filterByDomain,
  generateStatistics,
  generateMarkdown,
  generateCSV,
  writeCatalog
} = require('./lib/catalog-builder.js');

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);

  const options = {
    all: args.includes('--all'),
    plugin: null,
    search: null,
    domain: null,
    json: args.includes('--json'),
    markdown: args.includes('--markdown'),
    csv: args.includes('--csv'),
    output: null,
    stats: args.includes('--stats')
  };

  const pluginIndex = args.indexOf('--plugin');
  if (pluginIndex !== -1 && args[pluginIndex + 1]) {
    options.plugin = args[pluginIndex + 1];
  }

  const searchIndex = args.indexOf('--search');
  if (searchIndex !== -1 && args[searchIndex + 1]) {
    options.search = args[searchIndex + 1];
  }

  const domainIndex = args.indexOf('--domain');
  if (domainIndex !== -1 && args[domainIndex + 1]) {
    options.domain = args[domainIndex + 1];
  }

  const outputIndex = args.indexOf('--output');
  if (outputIndex !== -1 && args[outputIndex + 1]) {
    options.output = args[outputIndex + 1];
  }

  return options;
}

/**
 * Display usage information
 */
function displayUsage() {
  console.log('Usage: node build-marketplace-catalog.js [options]');
  console.log('\nOptions:');
  console.log('  --all                 Build complete marketplace catalog');
  console.log('  --plugin <name>       Show catalog for specific plugin');
  console.log('  --search <keyword>    Search catalog by keyword');
  console.log('  --domain <domain>     Filter by domain (salesforce, hubspot, developer, gtm, cross-platform)');
  console.log('  --json                Output as JSON');
  console.log('  --markdown            Output as Markdown');
  console.log('  --csv                 Output as CSV');
  console.log('  --stats               Show statistics only');
  console.log('  --output <path>       Write to file instead of stdout');
  console.log('\nExamples:');
  console.log('  node build-marketplace-catalog.js --all --json > catalog.json');
  console.log('  node build-marketplace-catalog.js --all --markdown > CATALOG.md');
  console.log('  node build-marketplace-catalog.js --search "metadata"');
  console.log('  node build-marketplace-catalog.js --domain salesforce --stats');
}

/**
 * Format catalog output based on options
 */
function formatOutput(catalog, options) {
  if (options.json) {
    return JSON.stringify(catalog, null, 2);
  } else if (options.markdown) {
    return generateMarkdown(catalog);
  } else if (options.csv) {
    return generateCSV(catalog);
  } else if (options.stats) {
    const stats = generateStatistics(catalog);
    return JSON.stringify(stats, null, 2);
  } else {
    // Default: JSON
    return JSON.stringify(catalog, null, 2);
  }
}

/**
 * Output results
 */
function output(content, outputPath) {
  if (outputPath) {
    const fs = require('fs');
    fs.writeFileSync(outputPath, content, 'utf8');
    console.log(`✅ Catalog written to: ${outputPath}`);
  } else {
    console.log(content);
  }
}

/**
 * Main execution
 */
async function main() {
  const options = parseArgs();

  // Show usage if no valid options
  if (!options.all && !options.plugin && !options.search && !options.domain) {
    displayUsage();
    process.exit(1);
  }

  try {
    const marketplaceRoot = path.join(__dirname, '../../..');

    // Build catalog
    let catalog = buildCatalog(marketplaceRoot);

    // Apply filters
    if (options.domain) {
      catalog = filterByDomain(catalog, options.domain);
      console.error(`✅ Filtered to domain: ${options.domain}`);
    }

    if (options.search) {
      const results = searchCatalog(catalog, options.search);
      console.error(`✅ Found ${results.count} results for "${options.search}"`);

      // Output search results
      if (options.json) {
        output(JSON.stringify(results, null, 2), options.output);
      } else {
        // Formatted search results
        results.results.forEach((result, i) => {
          console.log(`${i + 1}. [${result.type}] ${result.name} (${result.plugin})`);
          if (result.description) console.log(`   ${result.description}`);
          if (result.purpose) console.log(`   ${result.purpose}`);
        });
      }
      return;
    }

    // Generate output
    const formattedOutput = formatOutput(catalog, options);

    // Write output
    output(formattedOutput, options.output);

    // Log summary to stderr
    if (!options.search) {
      console.error(`\n✅ Catalog generated`);
      console.error(`   Plugins: ${catalog.summary.totalPlugins}`);
      console.error(`   Agents: ${catalog.summary.totalAgents}`);
      console.error(`   Scripts: ${catalog.summary.totalScripts}`);
      console.error(`   Commands: ${catalog.summary.totalCommands}`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  formatOutput
};
