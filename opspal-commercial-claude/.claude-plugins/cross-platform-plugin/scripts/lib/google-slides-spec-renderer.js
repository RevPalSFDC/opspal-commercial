#!/usr/bin/env node

/**
 * Google Slides Spec Renderer
 *
 * Renders a shared slide spec into a Google Slides presentation. Useful for
 * optional collaborative output when PPTX is not required.
 *
 * @version 1.0.0
 * @date 2025-12-30
 */

const fs = require('fs').promises;
const GoogleSlidesManager = require('./google-slides-manager');
const GoogleSlidesTemplateManager = require('./google-slides-template-manager');

const LAYOUT_MAP = {
  TITLE: 'TITLE',
  SECTION: 'SECTION_HEADER',
  CONTENT: 'CONTENT',
  KPI: 'KPI',
  TWO_COLUMN: 'TWO_COLUMN',
  TABLE: 'CONTENT',
  IMAGE: 'IMAGE_TITLE',
  CODE: 'CONTENT',
  CLOSING: 'CLOSING',
  APPENDIX: 'CONTENT'
};

class GoogleSlidesSpecRenderer {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.templateName = options.templateName || 'revpal-master';
    this.imageUrlMap = options.imageUrlMap || {};
    this.slidesManager = options.slidesManager || new GoogleSlidesManager({ verbose: this.verbose });
    this.templateManager = options.templateManager || new GoogleSlidesTemplateManager({ verbose: this.verbose });
  }

  async render(spec, options = {}) {
    const template = await this.templateManager.loadTemplateMetadata(this.templateName);
    const presentation = await this.slidesManager.cloneTemplate(template.templateId, options.title || spec.metadata?.title || 'Presentation');
    const presentationId = presentation.presentationId;

    await this._clearSlides(presentationId);
    const layoutMap = await this._buildLayoutMap(presentationId, template);

    for (let index = 0; index < spec.slides.length; index += 1) {
      const slideSpec = spec.slides[index];
      const layoutName = this._mapLayout(slideSpec.layout);
      const layoutObjectId = layoutMap[layoutName];

      const addResult = await this.slidesManager.addSlide(presentationId, 'BLANK', {
        layoutObjectId
      });

      const layoutMeta = template.layouts.find(layout => layout.id === layoutName || layout.name === layoutName);
      if (!layoutMeta) {
        continue;
      }

      const placeholders = this.templateManager.getPlaceholders(layoutMeta);
      for (const token of placeholders) {
        const value = this._resolveToken(token, slideSpec, spec.metadata || {}, index + 1);
        if (value === null || value === undefined) {
          continue;
        }
        await this.slidesManager.replaceTextOnSlide(presentationId, addResult.slideId, token, value.toString());
      }
    }

    if (options.exportPptxPath) {
      await this.slidesManager.exportToPPTX(presentationId, options.exportPptxPath);
    }

    return presentation;
  }

  async _clearSlides(presentationId) {
    const current = await this.slidesManager.getPresentation(presentationId);
    if (!current.slides) return;
    for (let i = current.slides.length - 1; i >= 0; i -= 1) {
      await this.slidesManager.deleteSlide(presentationId, current.slides[i].objectId);
    }
  }

  async _buildLayoutMap(presentationId, template) {
    const layouts = await this.slidesManager.getLayouts(presentationId);
    const map = {};

    for (const layout of template.layouts || []) {
      const match = layouts.find(item => item.displayName === layout.name || item.displayName === layout.id);
      if (match) {
        map[layout.id] = match.objectId;
      }
    }

    return map;
  }

  _mapLayout(layout) {
    return LAYOUT_MAP[layout] || 'CONTENT';
  }

  _resolveToken(token, slide, metadata, index) {
    const bullets = slide.bullets || [];
    const metrics = slide.metrics || [];
    const columns = slide.columns || [];

    const tokenMap = {
      '{{title}}': slide.title || metadata.title || '',
      '{{subtitle}}': slide.subtitle || metadata.subtitle || '',
      '{{date}}': metadata.date || '',
      '{{presenter}}': metadata.author || '',
      '{{slide_title}}': slide.title || '',
      '{{section_title}}': slide.title || '',
      '{{section_number}}': index.toString(),
      '{{closing_message}}': slide.title || 'Thank you',
      '{{contact_name}}': metadata.author || '',
      '{{contact_email}}': '',
      '{{contact_phone}}': '',
      '{{website}}': ''
    };

    if (tokenMap[token] !== undefined) {
      return tokenMap[token];
    }

    const bulletMatch = token.match(/\{\{bullet_(\d+)\}\}/);
    if (bulletMatch) {
      const position = parseInt(bulletMatch[1], 10) - 1;
      return bullets[position] || '';
    }

    const metricMatch = token.match(/\{\{metric_(\d+)_(label|value)\}\}/);
    if (metricMatch) {
      const position = parseInt(metricMatch[1], 10) - 1;
      const metric = metrics[position] || {};
      return metricMatch[2] === 'label' ? metric.label || '' : metric.value || '';
    }

    if (token === '{{left_header}}') {
      return columns[0]?.heading || '';
    }
    if (token === '{{left_content}}') {
      return (columns[0]?.bullets || []).join('\n');
    }
    if (token === '{{right_header}}') {
      return columns[1]?.heading || '';
    }
    if (token === '{{right_content}}') {
      return (columns[1]?.bullets || []).join('\n');
    }

    if (token === '{{image_url}}') {
      const imagePath = slide.image?.path;
      return this.imageUrlMap[imagePath] || '';
    }
    if (token === '{{caption}}') {
      return slide.image?.alt || slide.title || '';
    }

    return '';
  }
}

module.exports = GoogleSlidesSpecRenderer;

if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    const specPath = args[0];

    if (!specPath) {
      console.error('Usage: node google-slides-spec-renderer.js <spec.json> [--template <name>] [--export-pptx <path>] [--verbose]');
      process.exit(1);
    }

    const options = parseArgs(args.slice(1));
    const spec = JSON.parse(await fs.readFile(specPath, 'utf8'));

    const renderer = new GoogleSlidesSpecRenderer({
      verbose: options.verbose,
      templateName: options.template
    });

    const result = await renderer.render(spec, {
      exportPptxPath: options.exportPptx,
      title: options.title
    });

    console.log(`Presentation created: ${result.url || result.presentationId}`);
  })().catch(error => {
    console.error(`ERROR: Google Slides rendering failed: ${error.message}`);
    process.exit(1);
  });
}

function parseArgs(args) {
  const options = {
    template: 'revpal-master',
    exportPptx: '',
    title: '',
    verbose: false
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    switch (arg) {
      case '--template':
        options.template = args[i + 1];
        i += 1;
        break;
      case '--export-pptx':
        options.exportPptx = args[i + 1];
        i += 1;
        break;
      case '--title':
        options.title = args[i + 1];
        i += 1;
        break;
      case '--verbose':
        options.verbose = true;
        break;
      default:
        break;
    }
  }

  return options;
}
