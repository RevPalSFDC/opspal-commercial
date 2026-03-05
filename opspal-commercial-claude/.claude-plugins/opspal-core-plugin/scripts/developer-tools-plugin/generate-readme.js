#!/usr/bin/env node

/**
 * README Generator CLI
 *
 * Command-line interface for generating comprehensive README files for plugins.
 * Uses the readme-generator.js library for all functionality.
 *
 * Usage:
 *   node generate-readme.js --plugin <plugin-name>
 *   node generate-readme.js --all
 *   node generate-readme.js --plugin <plugin-name> --output /custom/path/README.md
 *
 * Examples:
 *   node generate-readme.js --plugin salesforce-plugin
 *   node generate-readme.js --all
 *   node generate-readme.js --plugin my-plugin --output /custom/path/README.md
 */

const path = require('path');
const {
  generateReadme,
  writeReadme
} = require('./lib/readme-generator.js');
const fs = require('fs');

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);

  const options = {
    all: args.includes('--all'),
    plugin: null,
    output: null,
    incremental: args.includes('--incremental')
  };

  const pluginIndex = args.indexOf('--plugin');
  if (pluginIndex !== -1 && args[pluginIndex + 1]) {
    options.plugin = args[pluginIndex + 1];
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
  console.log('Usage: node generate-readme.js --plugin <plugin-name>');
  console.log('       node generate-readme.js --all');
  console.log('\nOptions:');
  console.log('  --plugin <name>    Generate README for specific plugin');
  console.log('  --all              Generate READMEs for all plugins');
  console.log('  --output <path>    Custom output path (default: plugin/README.md)');
  console.log('  --incremental      Only update changed sections (not fully implemented)');
  console.log('\nExamples:');
  console.log('  node generate-readme.js --plugin salesforce-plugin');
  console.log('  node generate-readme.js --all');
  console.log('  node generate-readme.js --plugin my-plugin --output /tmp/README.md');
}

/**
 * Generate README for a single plugin
 */
function generateSingleReadme(pluginName, outputPath) {
  const marketplaceRoot = path.join(__dirname, '../../..');
  const pluginDir = path.join(marketplaceRoot, '.claude-plugins', pluginName);

  if (!fs.existsSync(pluginDir)) {
    throw new Error(`Plugin directory not found: ${pluginName}`);
  }

  // Generate README using library
  const readme = generateReadme(pluginDir);

  // Write to file
  let finalOutputPath;
  if (outputPath) {
    // Custom output path specified
    const fs = require('fs');
    fs.writeFileSync(outputPath, readme, 'utf8');
    finalOutputPath = outputPath;
  } else {
    // Default: write to plugin/README.md
    finalOutputPath = writeReadme(pluginDir, readme);
  }

  return {
    success: true,
    plugin: pluginName,
    path: finalOutputPath,
    size: readme.length
  };
}

/**
 * Generate READMEs for all plugins
 */
function generateAllReadmes() {
  const marketplaceRoot = path.join(__dirname, '../../..');
  const pluginsDir = path.join(marketplaceRoot, '.claude-plugins');

  if (!fs.existsSync(pluginsDir)) {
    throw new Error(`Plugins directory not found: ${pluginsDir}`);
  }

  const plugins = fs.readdirSync(pluginsDir)
    .filter(name => {
      const pluginPath = path.join(pluginsDir, name);
      return fs.statSync(pluginPath).isDirectory();
    });

  const results = [];

  for (const plugin of plugins) {
    try {
      const result = generateSingleReadme(plugin, null);
      results.push(result);
      console.log(`✅ Generated README for ${plugin}`);
    } catch (error) {
      console.error(`❌ Failed to generate README for ${plugin}: ${error.message}`);
      results.push({
        success: false,
        plugin,
        error: error.message
      });
    }
  }

  return results;
}

/**
 * Main execution
 */
async function main() {
  const options = parseArgs();

  // Show usage if no arguments
  if (!options.all && !options.plugin) {
    displayUsage();
    process.exit(1);
  }

  try {
    if (options.all) {
      // Generate for all plugins
      const results = generateAllReadmes();
      const successful = results.filter(r => r.success).length;
      console.log(`\n✅ Generated ${successful}/${results.length} READMEs`);

      // Exit with error if any failed
      if (successful < results.length) {
        process.exit(1);
      }
    } else if (options.plugin) {
      // Generate for single plugin
      const result = generateSingleReadme(options.plugin, options.output);
      console.log(`\n✅ README generated: ${result.path}`);
      console.log(`   Size: ${result.size} bytes`);
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
  generateSingleReadme,
  generateAllReadmes
};
