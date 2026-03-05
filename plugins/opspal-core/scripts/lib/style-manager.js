#!/usr/bin/env node

/**
 * Style Manager for PDF Generation
 *
 * Manages CSS composition, theming, and brand customization for PDF output.
 * Supports multi-layer CSS architecture with base, components, and themes.
 *
 * Features:
 * - Layered CSS loading (base + components + theme)
 * - Full brand package support (logo, fonts, colors)
 * - Google Fonts integration
 * - Dynamic CSS variable injection
 * - Custom theme creation
 *
 * @version 1.0.0
 * @date 2025-12-25
 */

const fs = require('fs').promises;
const path = require('path');

class StyleManager {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.baseDir = options.baseDir || path.join(__dirname, '../../templates/pdf-styles');
    this.theme = options.theme || 'revpal-brand';
    this.branding = options.branding || {};
    this.cache = new Map();
    this.cacheEnabled = options.cache !== false;
  }

  /**
   * Get complete stylesheet for PDF generation
   * @param {Object} options - Styling options
   * @returns {Promise<string>} Complete CSS stylesheet
   */
  async getStylesheet(options = {}) {
    const layers = [];

    // Layer 1: Base styles
    layers.push(await this._loadFile('base.css'));

    // Layer 2: Component styles
    const components = options.components || ['tables', 'toc', 'cover'];
    for (const component of components) {
      try {
        layers.push(await this._loadFile(`components/${component}.css`));
      } catch (e) {
        if (this.verbose) {
          console.log(`  Component stylesheet not found: ${component}.css`);
        }
      }
    }

    // Layer 3: Theme styles
    const theme = options.theme || this.theme;
    if (theme) {
      try {
        // Try as theme name first, then as path
        const themePath = theme.includes('/') ? theme : `themes/${theme}.css`;
        layers.push(await this._loadFile(themePath));
      } catch (e) {
        if (this.verbose) {
          console.log(`  Theme stylesheet not found: ${theme}, using default`);
        }
        // Fallback to default theme
        if (theme !== 'default') {
          try {
            layers.push(await this._loadFile('themes/default.css'));
          } catch (e2) {
            // No default theme available
          }
        }
      }
    }

    // Layer 4: Brand overrides
    const branding = { ...this.branding, ...options.branding };
    if (Object.keys(branding).length > 0) {
      layers.push(this._generateBrandingCSS(branding));
    }

    // Layer 5: Custom CSS if provided
    if (options.customCSS) {
      layers.push(options.customCSS);
    }

    const stylesheet = layers.join('\n\n/* === Layer Separator === */\n\n');

    if (this.verbose) {
      console.log(`  Generated stylesheet: ${layers.length} layers, ${stylesheet.length} bytes`);
    }

    return stylesheet;
  }

  /**
   * Load a CSS file from the styles directory
   * @private
   */
  async _loadFile(relativePath) {
    const fullPath = path.join(this.baseDir, relativePath);
    const cacheKey = fullPath;

    if (this.cacheEnabled && this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const content = await fs.readFile(fullPath, 'utf8');

    if (this.cacheEnabled) {
      this.cache.set(cacheKey, content);
    }

    return content;
  }

  /**
   * Generate CSS from branding configuration
   * @private
   */
  _generateBrandingCSS(branding) {
    const rules = [];

    rules.push('/* Brand Customization */');
    rules.push(':root {');

    // Colors
    if (branding.colors) {
      const colorMap = {
        primary: '--color-primary',
        secondary: '--color-secondary',
        accent: '--color-accent',
        danger: '--color-danger',
        warning: '--color-warning',
        success: '--color-success',
        info: '--color-info',
        background: '--color-background',
        surface: '--color-surface',
        text: '--color-text',
        textSecondary: '--color-text-secondary',
        textMuted: '--color-text-muted',
        border: '--color-border'
      };

      for (const [key, value] of Object.entries(branding.colors)) {
        const cssVar = colorMap[key] || `--color-${key}`;
        rules.push(`  ${cssVar}: ${value};`);
      }
    }

    // Fonts
    if (branding.fonts) {
      if (branding.fonts.primary) {
        rules.push(`  --font-primary: '${branding.fonts.primary}', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;`);
      }
      if (branding.fonts.secondary) {
        rules.push(`  --font-secondary: '${branding.fonts.secondary}', Georgia, 'Times New Roman', serif;`);
      }
      if (branding.fonts.mono) {
        rules.push(`  --font-mono: '${branding.fonts.mono}', 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;`);
      }
    }

    rules.push('}');

    // Font imports
    if (branding.fonts?.loadFrom === 'google') {
      const fontImport = this._generateGoogleFontImport(branding.fonts);
      if (fontImport) {
        rules.unshift(fontImport);
      }
    } else if (branding.fonts?.loadFrom === 'local' && branding.fonts.files) {
      const fontFaces = this._generateLocalFontFaces(branding.fonts);
      rules.unshift(fontFaces);
    }

    // Logo positioning
    if (branding.logo) {
      rules.push('');
      rules.push('/* Logo Customization */');

      if (branding.logo.width) {
        rules.push(`.cover-logo img { max-width: ${branding.logo.width}; }`);
      }

      if (branding.logo.position === 'header') {
        rules.push('.cover-logo { display: none; }');
        rules.push('.header-logo { display: block; }');
      } else if (branding.logo.position === 'footer') {
        rules.push('.cover-logo { display: none; }');
        rules.push('.footer-logo { display: block; }');
      } else if (branding.logo.position === 'both') {
        rules.push('.header-logo, .footer-logo { display: block; }');
      }
    }

    // Custom text
    if (branding.text) {
      rules.push('');
      rules.push('/* Custom Text Styling */');

      if (branding.text.footerColor) {
        rules.push(`.cover-footer { color: ${branding.text.footerColor}; }`);
      }
    }

    return rules.join('\n');
  }

  /**
   * Generate Google Fonts import statement
   * @private
   */
  _generateGoogleFontImport(fonts) {
    const families = [];

    if (fonts.primary) {
      const weights = fonts.primaryWeights || '400;500;600;700';
      families.push(`family=${encodeURIComponent(fonts.primary)}:wght@${weights}`);
    }

    if (fonts.secondary && fonts.secondary !== fonts.primary) {
      const weights = fonts.secondaryWeights || '400;500;600;700';
      families.push(`family=${encodeURIComponent(fonts.secondary)}:wght@${weights}`);
    }

    if (fonts.mono) {
      const weights = fonts.monoWeights || '400;500';
      families.push(`family=${encodeURIComponent(fonts.mono)}:wght@${weights}`);
    }

    if (families.length === 0) return '';

    const display = fonts.display || 'swap';
    return `@import url('https://fonts.googleapis.com/css2?${families.join('&')}&display=${display}');`;
  }

  /**
   * Generate @font-face rules for local fonts
   * @private
   */
  _generateLocalFontFaces(fonts) {
    const rules = [];

    for (const file of fonts.files || []) {
      const format = this._getFontFormat(file.path);
      rules.push(`@font-face {
  font-family: '${file.family}';
  src: url('${file.path}') format('${format}');
  font-weight: ${file.weight || 'normal'};
  font-style: ${file.style || 'normal'};
  font-display: swap;
}`);
    }

    return rules.join('\n\n');
  }

  /**
   * Determine font format from file extension
   * @private
   */
  _getFontFormat(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const formats = {
      '.woff2': 'woff2',
      '.woff': 'woff',
      '.ttf': 'truetype',
      '.otf': 'opentype',
      '.eot': 'embedded-opentype'
    };
    return formats[ext] || 'truetype';
  }

  /**
   * Get header/footer templates with branding
   * @param {Object} options - Template options
   * @returns {Object} { headerTemplate, footerTemplate }
   */
  getHeaderFooterTemplates(options = {}) {
    const branding = { ...this.branding, ...options.branding };
    const metadata = options.metadata || {};
    const hideHeader = options.hideHeader === true;

    const headerTemplate = hideHeader ? '<div></div>' : this._buildHeaderTemplate(branding, metadata);
    const footerTemplate = this._buildFooterTemplate(branding, metadata);

    return { headerTemplate, footerTemplate };
  }

  /**
   * Build header template HTML with RevPal branding
   * @private
   */
  _buildHeaderTemplate(branding, metadata) {
    const title = metadata.title || '';
    const showLogo = branding.logo?.position === 'header' || branding.logo?.position === 'both';
    const colors = branding.colors || StyleManager.getDefaultBranding().colors;

    // Modern header with refined styling
    let html = `<div style="
      font-family: 'Figtree', -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 9px;
      width: 100%;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 20mm;
      color: ${colors.textMuted || '#8A8A8A'};
      border-bottom: 1px solid rgba(62, 74, 97, 0.1);
    ">`;

    // Left side: Logo or empty
    if (showLogo && branding.logo?.path) {
      html += `<img src="${branding.logo.path}" style="height:20px; width:auto;" />`;
    } else {
      html += '<span></span>';
    }

    // Center: Title with brand color
    if (title) {
      html += `<span style="
        flex: 1;
        text-align: center;
        font-weight: 500;
        color: ${colors.secondary || '#3E4A61'};
        letter-spacing: 0.02em;
      ">${title}</span>`;
    } else {
      html += '<span></span>';
    }

    // Right side: Date
    if (metadata.date) {
      html += `<span style="font-variant-numeric: tabular-nums;">${metadata.date}</span>`;
    } else {
      html += '<span></span>';
    }

    html += '</div>';

    return html;
  }

  /**
   * Build footer template HTML with RevPal branding
   * @private
   */
  _buildFooterTemplate(branding, metadata) {
    const footerText = branding.text?.footer || 'OpsPal by RevPal';
    const showLogo = branding.logo?.position === 'footer' || branding.logo?.position === 'both';
    const colors = branding.colors || StyleManager.getDefaultBranding().colors;
    const generatedDate = metadata.date || new Date().toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric'
    });

    // Modern footer with refined styling - no extra whitespace
    let html = `<div style="font-family: 'Figtree', -apple-system, BlinkMacSystemFont, sans-serif; font-size: 9px; width: 100%; display: flex; justify-content: space-between; align-items: center; padding: 8px 20mm; color: ${colors.textMuted || '#8A8A8A'}; border-top: 1px solid rgba(62, 74, 97, 0.1);">`;

    // Left side: Brand text or logo (wrapped in single span)
    if (showLogo && branding.logo?.path) {
      html += `<span><img src="${branding.logo.path}" style="height:16px; width:auto;" /></span>`;
    } else {
      // "OpsPal by RevPal" with highlighted product name - all in one span
      const [product, ...byBrand] = footerText.split(' by ');
      if (byBrand.length > 0) {
        html += `<span><span style="font-weight: 500; color: ${colors.primary || '#5F3B8C'};">${product}</span> by ${byBrand.join(' by ')}</span>`;
      } else {
        html += `<span>${footerText}</span>`;
      }
    }

    // Center: Date generated
    html += `<span style="color: ${colors.textMuted || '#8A8A8A'};">Generated ${generatedDate}</span>`;

    // Right side: Page X of Y
    html += `<span style="font-variant-numeric: tabular-nums;">Page <span class="pageNumber" style="font-weight: 600; color: ${colors.secondary || '#3E4A61'};"></span> of <span class="totalPages"></span></span>`;

    html += '</div>';

    return html;
  }

  /**
   * Create a custom theme file
   * @param {string} themeName - Name for the theme
   * @param {Object} themeConfig - Theme configuration
   * @returns {Promise<string>} Path to created theme file
   */
  async createTheme(themeName, themeConfig) {
    const css = this._generateBrandingCSS(themeConfig);
    const themePath = path.join(this.baseDir, 'themes', `${themeName}.css`);

    // Add header comment
    const header = `/**
 * ${themeName} Theme
 * Auto-generated by StyleManager
 * @date ${new Date().toISOString().split('T')[0]}
 */

`;

    await fs.writeFile(themePath, header + css, 'utf8');

    if (this.verbose) {
      console.log(`  Created theme: ${themePath}`);
    }

    return themePath;
  }

  /**
   * List available themes
   * @returns {Promise<string[]>} Array of theme names
   */
  async listThemes() {
    const themesDir = path.join(this.baseDir, 'themes');
    try {
      const files = await fs.readdir(themesDir);
      return files
        .filter(f => f.endsWith('.css'))
        .map(f => f.replace('.css', ''));
    } catch (e) {
      return [];
    }
  }

  /**
   * Clear the stylesheet cache
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Get logo paths for RevPal branding
   * @returns {Object} Object with paths to different logo variants
   */
  static getLogoPaths() {
    const assetsDir = path.join(__dirname, '../../templates/branding-gallery/assets');
    return {
      main: path.join(assetsDir, 'revpal-logo-primary.png'),      // Full logo
      icon: path.join(assetsDir, 'revpal-brand-mark.png'),        // Icon mark
      favicon: path.join(assetsDir, 'revpal-logo-favicon.png'),   // Favicon
      export: path.join(assetsDir, 'revpal-logo-export.png')      // Export/logo mark
    };
  }

  /**
   * Get default branding configuration (RevPal Brand Guide)
   *
   * Brand Context:
   * - Company: RevPal
   * - Industry: B2B SaaS / Revenue Operations Consulting
   * - Visual style: Modern, structured, calm, professional, slightly warm
   */
  static getDefaultBranding() {
    const logos = StyleManager.getLogoPaths();
    return {
      logo: {
        path: logos.main,
        iconPath: logos.icon,
        faviconPath: logos.favicon,
        width: '150px',
        position: 'cover'  // 'cover' | 'header' | 'footer' | 'both'
      },
      fonts: {
        // Montserrat for headings, Figtree for body
        primary: 'Figtree',        // Body text
        heading: 'Montserrat',      // Headings
        secondary: 'Montserrat',    // Legacy alias
        mono: 'JetBrains Mono',
        loadFrom: 'google',
        primaryWeights: '400;500;600',
        secondaryWeights: '500;600;700;800'
      },
      colors: {
        // RevPal Brand Colors
        primary: '#5F3B8C',         // Grape
        secondary: '#3E4A61',       // Indigo
        accent: '#E99560',          // Apricot
        accentHover: '#D88450',     // Apricot hover
        success: '#6FBF73',         // Green
        danger: '#D35649',
        warning: '#E99560',         // Apricot
        info: '#3E4A61',            // Indigo
        background: '#FFFFFF',      // Neutral-100
        surface: '#F6F5F3',         // Neutral-90
        surfaceDark: '#EAE4DC',     // Sand
        text: '#000000',            // Neutral-0
        textSecondary: '#3E4A61',   // Indigo
        textMuted: '#8A8A8A',       // Neutral-20
        border: 'rgba(62, 74, 97, 0.2)'
      },
      text: {
        footer: 'OpsPal by RevPal',
        disclaimer: 'This report includes analysis and insights generated with the assistance of OpsPal, by RevPal. While every effort has been made to ensure accuracy, results may include inaccuracies or omissions. Please validate findings before relying on them for business decisions.'
      }
    };
  }

  /**
   * Get RevPal spacing system
   */
  static getSpacingSystem() {
    return {
      2: '2px',
      4: '4px',
      8: '8px',
      12: '12px',
      16: '16px',
      24: '24px',
      32: '32px',
      48: '48px',
      64: '64px'
    };
  }

  /**
   * Get RevPal color palette
   */
  static getColorPalette() {
    return {
      // Brand Colors
      grape: '#5F3B8C',
      indigo: '#3E4A61',
      apricot: '#E99560',
      apricotHover: '#D88450',
      sand: '#EAE4DC',
      green: '#6FBF73',

      // Neutrals
      neutral100: '#FFFFFF',
      neutral90: '#F6F5F3',
      neutral80: '#EAE4DC',
      neutral60: '#C6C3BD',
      neutral20: '#8A8A8A',
      neutral0: '#000000'
    };
  }
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log('Usage: style-manager.js <command> [options]');
    console.log('\nCommands:');
    console.log('  generate [--theme <name>] [--output <file>]  Generate stylesheet');
    console.log('  list-themes                                   List available themes');
    console.log('  create-theme <name> [--config <json-file>]   Create custom theme');
    console.log('\nExamples:');
    console.log('  style-manager.js generate --theme revpal-brand --output styles.css');
    console.log('  style-manager.js list-themes');
    console.log('  style-manager.js create-theme client-x --config brand.json');
    process.exit(1);
  }

  const command = args[0];
  const manager = new StyleManager({ verbose: true });

  (async () => {
    try {
      switch (command) {
        case 'generate': {
          const themeIndex = args.indexOf('--theme');
          const outputIndex = args.indexOf('--output');
          const theme = themeIndex >= 0 ? args[themeIndex + 1] : 'default';
          const output = outputIndex >= 0 ? args[outputIndex + 1] : null;

          const stylesheet = await manager.getStylesheet({ theme });

          if (output) {
            await fs.writeFile(output, stylesheet, 'utf8');
            console.log(`Stylesheet written to: ${output}`);
          } else {
            console.log(stylesheet);
          }
          break;
        }

        case 'list-themes': {
          const themes = await manager.listThemes();
          console.log('Available themes:');
          themes.forEach(t => console.log(`  - ${t}`));
          break;
        }

        case 'create-theme': {
          const themeName = args[1];
          if (!themeName) {
            console.error('Theme name required');
            process.exit(1);
          }

          const configIndex = args.indexOf('--config');
          let config = StyleManager.getDefaultBranding();

          if (configIndex >= 0 && args[configIndex + 1]) {
            const configContent = await fs.readFile(args[configIndex + 1], 'utf8');
            config = JSON.parse(configContent);
          }

          const themePath = await manager.createTheme(themeName, config);
          console.log(`Theme created: ${themePath}`);
          break;
        }

        default:
          console.error(`Unknown command: ${command}`);
          process.exit(1);
      }

      process.exit(0);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  })();
}

module.exports = StyleManager;
