#!/usr/bin/env node

/**
 * PPTX Generator - Offline PowerPoint Builder
 *
 * Renders a shared slide spec (or markdown) into a PPTX file using PptxGenJS.
 * Designed for deterministic, offline output with RevPal branding defaults.
 *
 * @version 1.0.0
 * @date 2025-12-30
 */

const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const pptxgen = require('pptxgenjs');
const SlideSpecGenerator = require('./slide-spec-generator');
const { embedFontsFromTemplate } = require('./pptx-font-embedder');

const BRAND = {
  fonts: {
    heading: 'Montserrat',
    body: 'Figtree',
    mono: 'Courier New'
  },
  colors: {
    grape: '5F3B8C',
    indigo: '3E4A61',
    apricot: 'E99560',
    apricotHover: 'D88450',
    sand: 'EAE4DC',
    green: '6FBF73',
    neutral100: 'FFFFFF',
    neutral90: 'F6F5F3',
    neutral80: 'EAE4DC',
    neutral60: 'C6C3BD',
    neutral20: '8A8A8A',
    neutral0: '000000'
  }
};

const TYPE = {
  h1: 36,
  h2: 28,
  h3: 20,
  h4: 18,
  body: 16,
  bodyLg: 18,
  small: 12,
  mono: 12
};

const SPACE = {
  s2: 0.02,
  s4: 0.04,
  s8: 0.08,
  s12: 0.12,
  s16: 0.17,
  s24: 0.25,
  s32: 0.33,
  s48: 0.5,
  s64: 0.67
};

const LAYOUT = {
  width: 13.333,
  height: 7.5,
  marginX: 0.9,
  marginY: 0.6,
  titleY: 0.7,
  bodyY: 1.6,
  footerY: 7.0,
  accentHeight: 0.08,
  bandWidth: 0.32,
  columnGap: 0.45
};

const CONTENT = {
  x: LAYOUT.marginX,
  y: LAYOUT.bodyY,
  w: LAYOUT.width - (LAYOUT.marginX * 2),
  h: 5.4
};

class PptxGenerator {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.branding = options.branding || {};
    this.logoPath = options.logoPath || path.join(__dirname, '../../templates/assets/logos/revpal-logo.png');
    this.embedFonts = options.embedFonts !== false;
    const libraryTemplatePath = path.join(
      __dirname,
      '../../templates/powerpoint/solutions-proposal/solutions-proposal-template.pptx'
    );
    const legacyTemplatePath = path.join(
      __dirname,
      '../../templates/pptx-templates/revpal-master.pptx'
    );
    this.fontTemplatePath = options.fontTemplatePath || process.env.PPTX_FONT_TEMPLATE
      || (fs.existsSync(libraryTemplatePath) ? libraryTemplatePath : legacyTemplatePath);
    this.tempDir = options.tempDir || path.join(__dirname, '../../.temp/pptx-generation');
    this.shapeType = null;
  }

  async generateFromSpec(slideSpec, outputPath) {
    const pptx = this._createPresentation(slideSpec);

    for (const slideSpecItem of slideSpec.slides) {
      this._addSlide(pptx, slideSpecItem);
    }

    await pptx.writeFile({ fileName: outputPath });

    if (this.embedFonts) {
      await this._embedFonts(outputPath);
    }

    return outputPath;
  }

  async generateFromMarkdown(inputPath, outputPath, options = {}) {
    const specGenerator = new SlideSpecGenerator({
      verbose: this.verbose,
      renderMermaid: options.renderMermaid !== false,
      profile: options.profile,
      deckPurpose: options.deckPurpose,
      persona: options.persona,
      summarize: options.summarize,
      model: options.model,
      allowEmptyInput: options.allowEmptyInput
    });
    const slideSpec = inputPath.includes('*')
      ? await specGenerator.fromGlob(inputPath, options)
      : await specGenerator.fromFile(inputPath, options);

    if (this.verbose && slideSpec.warnings && slideSpec.warnings.length > 0) {
      console.log('WARN: Slide spec warnings:');
      slideSpec.warnings.forEach(warning => console.log(`   - ${warning}`));
    }

    return this.generateFromSpec(slideSpec, outputPath);
  }

  _createPresentation(slideSpec) {
    const pptx = new pptxgen();
    pptx.layout = 'LAYOUT_WIDE';
    pptx.author = slideSpec.metadata?.author || 'RevPal Engineering';
    pptx.company = slideSpec.metadata?.org || 'RevPal';
    pptx.subject = slideSpec.metadata?.title || 'RevPal Presentation';
    pptx.title = slideSpec.metadata?.title || 'RevPal Presentation';
    pptx.theme = {
      headFontFace: BRAND.fonts.heading,
      bodyFontFace: BRAND.fonts.body,
      lang: 'en-US'
    };

    this.shapeType = pptx.ShapeType;
    return pptx;
  }

  _addSlide(pptx, slideSpecItem) {
    const slide = pptx.addSlide();
    const layout = slideSpecItem.layout;

    switch (layout) {
      case 'TITLE':
        this._addTitleSlide(slide, slideSpecItem);
        break;
      case 'SECTION':
        this._addSectionSlide(slide, slideSpecItem);
        break;
      case 'CONTENT':
        this._addContentSlide(slide, slideSpecItem);
        break;
      case 'KPI':
        this._addKpiSlide(slide, slideSpecItem);
        break;
      case 'TWO_COLUMN':
        this._addTwoColumnSlide(slide, slideSpecItem);
        break;
      case 'TABLE':
        this._addTableSlide(slide, slideSpecItem);
        break;
      case 'IMAGE':
        this._addImageSlide(slide, slideSpecItem);
        break;
      case 'PROCESS':
        this._addProcessSlide(slide, slideSpecItem);
        break;
      case 'TIMELINE':
        this._addTimelineSlide(slide, slideSpecItem);
        break;
      case 'QUOTE':
        this._addQuoteSlide(slide, slideSpecItem);
        break;
      case 'CHART':
        this._addChartSlide(slide, slideSpecItem);
        break;
      case 'CHART_TEXT':
        this._addChartTextSlide(slide, slideSpecItem);
        break;
      case 'CODE':
        this._addCodeSlide(slide, slideSpecItem);
        break;
      case 'CLOSING':
        this._addClosingSlide(slide, slideSpecItem);
        break;
      case 'APPENDIX':
        this._addAppendixSlide(slide, slideSpecItem);
        break;
      default:
        this._addContentSlide(slide, slideSpecItem);
        break;
    }

    this._addNotes(slide, slideSpecItem);
  }

  _addBaseSlide(slide, options = {}) {
    slide.addShape(this.shapeType.rect, {
      x: 0,
      y: 0,
      w: LAYOUT.width,
      h: LAYOUT.height,
      fill: { color: BRAND.colors.neutral90 },
      line: { color: BRAND.colors.neutral90 }
    });

    if (options.topRule !== false) {
      slide.addShape(this.shapeType.rect, {
        x: 0,
        y: 0,
        w: LAYOUT.width,
        h: LAYOUT.accentHeight,
        fill: { color: BRAND.colors.apricot },
        line: { color: BRAND.colors.apricot }
      });
    }

    if (options.leftBand) {
      slide.addShape(this.shapeType.rect, {
        x: 0,
        y: 0,
        w: LAYOUT.bandWidth,
        h: LAYOUT.height,
        fill: { color: BRAND.colors.grape },
        line: { color: BRAND.colors.grape }
      });
    }
  }

  _addCard(slide, { x, y, w, h }, options = {}) {
    slide.addShape(this.shapeType.rect, {
      x,
      y,
      w,
      h,
      fill: { color: options.fill || BRAND.colors.sand },
      line: { color: options.line || BRAND.colors.neutral60, width: 1 }
    });
  }

  _addFooter(slide, text = 'OpsPal by RevPal') {
    slide.addText(text, {
      x: LAYOUT.marginX,
      y: LAYOUT.footerY,
      w: CONTENT.w,
      h: 0.3,
      fontSize: TYPE.small,
      color: BRAND.colors.neutral20,
      fontFace: BRAND.fonts.body
    });
  }

  _measureBullets(bullets) {
    const metrics = {
      totalWords: 0,
      maxWords: 0,
      maxChars: 0
    };

    bullets.forEach(bullet => {
      const trimmed = (bullet || '').trim();
      if (!trimmed) {
        return;
      }
      const words = trimmed.split(/\s+/).filter(Boolean);
      metrics.totalWords += words.length;
      metrics.maxWords = Math.max(metrics.maxWords, words.length);
      metrics.maxChars = Math.max(metrics.maxChars, trimmed.length);
    });

    return metrics;
  }

  _resolveBulletFontSize(metrics, baseSize, minFontSize) {
    let reduction = 0;
    if (metrics.totalWords > 140 || metrics.maxWords > 28 || metrics.maxChars > 180) {
      reduction = 6;
    } else if (metrics.totalWords > 110 || metrics.maxWords > 24 || metrics.maxChars > 150) {
      reduction = 4;
    } else if (metrics.totalWords > 80 || metrics.maxWords > 18 || metrics.maxChars > 120) {
      reduction = 2;
    }

    return Math.max(baseSize - reduction, minFontSize);
  }

  _addBulletedText(slide, bullets, box, options = {}) {
    if (!bullets || bullets.length === 0) {
      return;
    }

    const baseSize = options.fontSize || TYPE.body;
    const minFontSize = options.minFontSize || TYPE.small;
    const metrics = this._measureBullets(bullets);
    const fontSize = this._resolveBulletFontSize(metrics, baseSize, minFontSize);
    const lineSpacingMultiple = options.lineSpacingMultiple || 1.1;
    const paraSpaceAfter = options.paraSpaceAfter ?? 4;
    const sizeDelta = baseSize - fontSize;
    const adjustedLineSpacing = sizeDelta > 0 ? Math.max(lineSpacingMultiple - 0.05, 1.0) : lineSpacingMultiple;
    const bulletChar = options.bulletChar || '•';
    const bulletText = bullets.map(bullet => `${bulletChar} ${bullet}`).join('\n');

    slide.addText(bulletText, {
      x: box.x,
      y: box.y,
      w: box.w,
      h: box.h,
      fontSize,
      color: options.color || BRAND.colors.indigo,
      fontFace: options.fontFace || BRAND.fonts.body,
      lineSpacingMultiple: adjustedLineSpacing,
      paraSpaceAfter: sizeDelta > 0 ? Math.max(paraSpaceAfter - 2, 2) : paraSpaceAfter
    });
  }

  _titleFontSize(title, baseSize) {
    const length = (title || '').length;
    if (length > 110) {
      return Math.max(baseSize - 14, TYPE.h4);
    }
    if (length > 90) {
      return Math.max(baseSize - 10, TYPE.h4);
    }
    if (length > 70) {
      return Math.max(baseSize - 8, TYPE.h4);
    }
    if (length > 50) {
      return Math.max(baseSize - 4, TYPE.h3);
    }
    return baseSize;
  }

  _addContainedImage(slide, imagePath, box, options = {}) {
    const dimensions = getImageDimensions(imagePath);
    const rect = dimensions
      ? fitContainRect(box, dimensions.width / dimensions.height)
      : box;

    if (!dimensions && this.verbose) {
      console.log(`WARN: Unable to read image dimensions for ${imagePath}. Using box dimensions.`);
    }

    slide.addImage({
      path: imagePath,
      x: rect.x,
      y: rect.y,
      w: rect.w,
      h: rect.h,
      altText: options.altText || ''
    });
  }

  _addTitleSlide(slide, data) {
    this._addBaseSlide(slide, { topRule: true });
    const card = {
      x: LAYOUT.marginX,
      y: 1.9,
      w: CONTENT.w,
      h: 2.3
    };

    if (this.logoPath && fs.existsSync(this.logoPath)) {
      this._addContainedImage(slide, this.logoPath, {
        x: LAYOUT.width - 2.1,
        y: 0.25,
        w: 1.6,
        h: 0.55
      }, { altText: 'RevPal logo' });
    } else if (this.logoPath && this.verbose) {
      console.log(`WARN: Logo not found: ${this.logoPath}`);
    }

    this._addCard(slide, card, { fill: BRAND.colors.sand, line: BRAND.colors.neutral60 });
    slide.addShape(this.shapeType.rect, {
      x: card.x,
      y: card.y,
      w: SPACE.s8,
      h: card.h,
      fill: { color: BRAND.colors.apricot },
      line: { color: BRAND.colors.apricot }
    });

    const titleText = data.title || 'Presentation';
    slide.addText(titleText, {
      x: card.x + SPACE.s24,
      y: card.y + SPACE.s16,
      w: card.w - SPACE.s32,
      h: 0.9,
      fontSize: this._titleFontSize(titleText, TYPE.h1),
      bold: true,
      color: BRAND.colors.grape,
      fontFace: BRAND.fonts.heading
    });

    if (data.subtitle) {
      slide.addText(data.subtitle, {
        x: card.x + SPACE.s24,
        y: card.y + 1.1,
        w: card.w - SPACE.s32,
        h: 0.6,
        fontSize: TYPE.h3,
        color: BRAND.colors.indigo,
        fontFace: BRAND.fonts.body
      });
    }

    this._addFooter(slide);
  }

  _addSectionSlide(slide, data) {
    this._addBaseSlide(slide, { topRule: false, leftBand: true });
    const card = {
      x: LAYOUT.marginX,
      y: 2.4,
      w: CONTENT.w,
      h: 2.1
    };

    this._addCard(slide, card, { fill: BRAND.colors.sand, line: BRAND.colors.neutral60 });
    slide.addShape(this.shapeType.rect, {
      x: card.x + SPACE.s24,
      y: card.y + SPACE.s16,
      w: 1.4,
      h: SPACE.s4,
      fill: { color: BRAND.colors.apricot },
      line: { color: BRAND.colors.apricot }
    });

    const titleText = data.title || 'Section';
    slide.addText(titleText, {
      x: card.x + SPACE.s24,
      y: card.y + 0.5,
      w: card.w - SPACE.s32,
      h: 1,
      fontSize: this._titleFontSize(titleText, TYPE.h1),
      bold: true,
      color: BRAND.colors.grape,
      fontFace: BRAND.fonts.heading
    });
  }

  _addContentSlide(slide, data) {
    this._addBaseSlide(slide);
    this._addSlideTitle(slide, data.title);
    const bullets = data.bullets || [];
    const punchlineText = (data.punchline || '').trim();
    const hasPunchline = Boolean(punchlineText);
    const card = {
      x: CONTENT.x,
      y: LAYOUT.bodyY + SPACE.s16,
      w: CONTENT.w,
      h: 4.9
    };

    this._addCard(slide, card, { fill: BRAND.colors.neutral100, line: BRAND.colors.neutral60 });

    if (bullets.length === 0 && !hasPunchline) {
      slide.addText('No content available.', {
        x: card.x + SPACE.s16,
        y: card.y + SPACE.s16,
        w: card.w - SPACE.s32,
        h: 1.2,
        fontSize: TYPE.body,
        color: BRAND.colors.neutral20,
        fontFace: BRAND.fonts.body
      });
      this._addFooter(slide);
      return;
    }

    const punchlineHeight = hasPunchline ? 0.5 : 0;
    const punchlineGap = hasPunchline ? SPACE.s8 : 0;
    if (hasPunchline) {
      slide.addText(punchlineText, {
        x: card.x + SPACE.s16,
        y: card.y + SPACE.s12,
        w: card.w - SPACE.s32,
        h: punchlineHeight,
        fontSize: TYPE.body,
        bold: true,
        color: BRAND.colors.grape,
        fontFace: BRAND.fonts.body
      });
    }

    this._addBulletedText(slide, bullets, {
      x: card.x + SPACE.s16,
      y: card.y + SPACE.s16 + punchlineHeight + punchlineGap,
      w: card.w - SPACE.s32,
      h: card.h - SPACE.s32 - punchlineHeight - punchlineGap
    }, {
      fontSize: TYPE.bodyLg,
      color: BRAND.colors.indigo,
      fontFace: BRAND.fonts.body,
      indent: 18,
      lineSpacingMultiple: 1.15,
      paraSpaceAfter: 6
    });

    this._addFooter(slide);
  }

  _addKpiSlide(slide, data) {
    this._addBaseSlide(slide);
    this._addSlideTitle(slide, data.title || 'Key Metrics');
    const metrics = data.metrics || [];
    const maxMetrics = Math.min(metrics.length, 4) || 1;
    const cols = maxMetrics <= 3 ? maxMetrics : 2;
    const rows = maxMetrics <= 3 ? 1 : 2;
    const cardGap = LAYOUT.columnGap;
    const cardW = (CONTENT.w - (cardGap * (cols - 1))) / cols;
    const cardH = rows === 1 ? 2.2 : 1.8;
    const startY = LAYOUT.bodyY + SPACE.s24;

    metrics.slice(0, maxMetrics).forEach((metric, index) => {
      const row = rows === 1 ? 0 : Math.floor(index / cols);
      const col = rows === 1 ? index : index % cols;
      const x = CONTENT.x + (col * (cardW + cardGap));
      const y = startY + (row * (cardH + 0.5));

      this._addCard(slide, { x, y, w: cardW, h: cardH }, { fill: BRAND.colors.sand, line: BRAND.colors.neutral60 });
      slide.addShape(this.shapeType.rect, {
        x,
        y,
        w: cardW,
        h: SPACE.s4,
        fill: { color: BRAND.colors.apricot },
        line: { color: BRAND.colors.apricot }
      });

      slide.addText(metric.value || '-', {
        x: x + SPACE.s16,
        y: y + SPACE.s16,
        w: cardW - SPACE.s32,
        h: 0.7,
        fontSize: TYPE.h2,
        bold: true,
        color: BRAND.colors.grape,
        fontFace: BRAND.fonts.heading,
        align: 'center'
      });

      slide.addText(metric.label || '', {
        x: x + SPACE.s16,
        y: y + 0.9,
        w: cardW - SPACE.s32,
        h: 0.5,
        fontSize: TYPE.body,
        color: BRAND.colors.indigo,
        fontFace: BRAND.fonts.body,
        align: 'center'
      });

      if (metric.note) {
        slide.addText(metric.note, {
          x: x + SPACE.s16,
          y: y + 1.35,
          w: cardW - SPACE.s32,
          h: 0.4,
          fontSize: TYPE.small,
          color: BRAND.colors.neutral20,
          fontFace: BRAND.fonts.body,
          align: 'center'
        });
      }
    });

    this._addFooter(slide);
  }

  _addTwoColumnSlide(slide, data) {
    this._addBaseSlide(slide);
    this._addSlideTitle(slide, data.title);
    const columns = data.columns || [{}, {}];
    const columnWidth = (CONTENT.w - LAYOUT.columnGap) / 2;
    const cardY = LAYOUT.bodyY + SPACE.s12;
    const cardH = 4.8;

    columns.forEach((column, index) => {
      const x = CONTENT.x + (index * (columnWidth + LAYOUT.columnGap));
      this._addCard(slide, { x, y: cardY, w: columnWidth, h: cardH }, { fill: BRAND.colors.neutral100, line: BRAND.colors.neutral60 });

      slide.addText(column.heading || '', {
        x: x + SPACE.s16,
        y: cardY + SPACE.s12,
        w: columnWidth - SPACE.s32,
        h: 0.4,
        fontSize: TYPE.h4,
        bold: true,
        color: BRAND.colors.grape,
        fontFace: BRAND.fonts.heading
      });

      this._addBulletedText(slide, column.bullets || [], {
        x: x + SPACE.s16,
        y: cardY + 0.7,
        w: columnWidth - SPACE.s32,
        h: cardH - 1.0
      }, {
        fontSize: TYPE.body,
        color: BRAND.colors.indigo,
        fontFace: BRAND.fonts.body,
        indent: 16,
        lineSpacingMultiple: 1.1,
        paraSpaceAfter: 4
      });
    });

    this._addFooter(slide);
  }

  _addTableSlide(slide, data) {
    this._addBaseSlide(slide);
    this._addSlideTitle(slide, data.title);
    const table = data.table || { headers: [], rows: [] };
    const rows = [];

    if (table.headers.length > 0) {
      rows.push(table.headers.map(header => ({
        text: header,
        options: {
          bold: true,
          color: BRAND.colors.indigo,
          fill: BRAND.colors.sand
        }
      })));
    }

    table.rows.forEach(row => {
      if (Array.isArray(row)) {
        rows.push(row.map(cell => (typeof cell === 'string' ? { text: cell } : cell)));
        return;
      }
      rows.push([{ text: String(row) }]);
    });

    slide.addTable(rows, {
      x: CONTENT.x,
      y: LAYOUT.bodyY + SPACE.s16,
      w: CONTENT.w,
      h: 4.8,
      border: { type: 'solid', pt: 1, color: BRAND.colors.neutral60 },
      fontFace: BRAND.fonts.body,
      fontSize: TYPE.body,
      fill: BRAND.colors.neutral100,
      color: BRAND.colors.indigo
    });

    this._addFooter(slide);
  }

  _addImageSlide(slide, data) {
    this._addBaseSlide(slide);
    this._addSlideTitle(slide, data.title);
    if (!data.image || !data.image.path) {
      slide.addText('Image unavailable.', {
        x: CONTENT.x,
        y: LAYOUT.bodyY,
        w: CONTENT.w,
        h: 1,
        fontSize: TYPE.body,
        color: BRAND.colors.neutral20,
        fontFace: BRAND.fonts.body
      });
      this._addFooter(slide);
      return;
    }

    if (!fs.existsSync(data.image.path)) {
      slide.addText('Image file not found.', {
        x: CONTENT.x,
        y: LAYOUT.bodyY,
        w: CONTENT.w,
        h: 1,
        fontSize: TYPE.body,
        color: BRAND.colors.neutral20,
        fontFace: BRAND.fonts.body
      });
      this._addFooter(slide);
      return;
    }

    const card = {
      x: CONTENT.x,
      y: LAYOUT.bodyY + SPACE.s12,
      w: CONTENT.w,
      h: 4.6
    };
    this._addCard(slide, card, { fill: BRAND.colors.neutral100, line: BRAND.colors.neutral60 });

    this._addContainedImage(slide, data.image.path, {
      x: card.x + SPACE.s16,
      y: card.y + SPACE.s16,
      w: card.w - SPACE.s32,
      h: card.h - 0.6
    }, { altText: data.image.alt || data.title || '' });

    if (data.image.alt) {
      slide.addText(data.image.alt, {
        x: card.x + SPACE.s16,
        y: card.y + card.h - 0.4,
        w: card.w - SPACE.s32,
        h: 0.3,
        fontSize: TYPE.small,
        color: BRAND.colors.neutral20,
        fontFace: BRAND.fonts.body
      });
    }

    this._addFooter(slide);
  }

  _addProcessSlide(slide, data) {
    this._addBaseSlide(slide);
    this._addSlideTitle(slide, data.title || 'Process Overview');
    const steps = this._getStepItems(data);
    const card = {
      x: CONTENT.x,
      y: LAYOUT.bodyY + SPACE.s16,
      w: CONTENT.w,
      h: 4.8
    };

    this._addCard(slide, card, { fill: BRAND.colors.neutral100, line: BRAND.colors.neutral60 });

    if (steps.length === 0) {
      slide.addText('No steps available.', {
        x: card.x + SPACE.s16,
        y: card.y + SPACE.s16,
        w: card.w - SPACE.s32,
        h: 1.2,
        fontSize: TYPE.body,
        color: BRAND.colors.neutral20,
        fontFace: BRAND.fonts.body
      });
      this._addFooter(slide);
      return;
    }

    this._renderStepSequence(slide, steps, {
      frame: card,
      labelPosition: 'below',
      showNumbers: true,
      lineRatio: 0.45,
      labelHeight: 0.6,
      nodeSize: 0.34,
      nodeFill: BRAND.colors.grape,
      nodeTextColor: BRAND.colors.neutral100
    });

    this._addFooter(slide);
  }

  _addTimelineSlide(slide, data) {
    this._addBaseSlide(slide);
    this._addSlideTitle(slide, data.title || 'Timeline');
    const steps = this._getStepItems(data);
    const card = {
      x: CONTENT.x,
      y: LAYOUT.bodyY + SPACE.s16,
      w: CONTENT.w,
      h: 4.8
    };

    this._addCard(slide, card, { fill: BRAND.colors.neutral100, line: BRAND.colors.neutral60 });

    if (steps.length === 0) {
      slide.addText('No timeline milestones available.', {
        x: card.x + SPACE.s16,
        y: card.y + SPACE.s16,
        w: card.w - SPACE.s32,
        h: 1.2,
        fontSize: TYPE.body,
        color: BRAND.colors.neutral20,
        fontFace: BRAND.fonts.body
      });
      this._addFooter(slide);
      return;
    }

    this._renderStepSequence(slide, steps, {
      frame: card,
      labelPosition: 'above',
      showNumbers: false,
      lineRatio: 0.6,
      labelGap: 0.5,
      labelPad: 0.3,
      edgePadding: 0.4,
      spanRatio: 0.5,
      labelInset: SPACE.s12,
      nodeSize: 0.3,
      nodeFill: BRAND.colors.apricot,
      nodeTextColor: BRAND.colors.neutral0
    });

    this._addFooter(slide);
  }

  _addQuoteSlide(slide, data) {
    this._addBaseSlide(slide);
    this._addSlideTitle(slide, data.title || 'Quote');
    const quoteText = (data.quote || '').trim() || (Array.isArray(data.bullets) ? data.bullets[0] : '') || '';
    const authorText = (data.author || '').trim();
    const card = {
      x: CONTENT.x,
      y: LAYOUT.bodyY + SPACE.s16,
      w: CONTENT.w,
      h: 4.8
    };

    this._addCard(slide, card, { fill: BRAND.colors.neutral100, line: BRAND.colors.neutral60 });

    if (!quoteText) {
      slide.addText('Quote unavailable.', {
        x: card.x + SPACE.s16,
        y: card.y + SPACE.s16,
        w: card.w - SPACE.s32,
        h: 1.2,
        fontSize: TYPE.body,
        color: BRAND.colors.neutral20,
        fontFace: BRAND.fonts.body
      });
      this._addFooter(slide);
      return;
    }

    const cleanedQuote = quoteText.replace(/^["']+|["']+$/g, '');
    slide.addText(`"${cleanedQuote}"`, {
      x: card.x + SPACE.s24,
      y: card.y + SPACE.s24,
      w: card.w - SPACE.s48,
      h: card.h - 1.0,
      fontSize: TYPE.h3,
      italic: true,
      color: BRAND.colors.indigo,
      fontFace: BRAND.fonts.body,
      align: 'left',
      valign: 'top'
    });

    if (authorText) {
      slide.addText(`- ${authorText}`, {
        x: card.x + SPACE.s24,
        y: card.y + card.h - 0.7,
        w: card.w - SPACE.s48,
        h: 0.4,
        fontSize: TYPE.body,
        color: BRAND.colors.grape,
        fontFace: BRAND.fonts.body,
        align: 'right'
      });
    }

    this._addFooter(slide);
  }

  _addChartSlide(slide, data) {
    this._addBaseSlide(slide);
    this._addSlideTitle(slide, data.title || 'Chart');
    const chart = data.chart || null;
    const card = {
      x: CONTENT.x,
      y: LAYOUT.bodyY + SPACE.s16,
      w: CONTENT.w,
      h: 4.8
    };

    this._addCard(slide, card, { fill: BRAND.colors.neutral100, line: BRAND.colors.neutral60 });

    if (!chart || !Array.isArray(chart.series) || chart.series.length === 0) {
      slide.addText('Chart data unavailable.', {
        x: card.x + SPACE.s16,
        y: card.y + SPACE.s16,
        w: card.w - SPACE.s32,
        h: 1.2,
        fontSize: TYPE.body,
        color: BRAND.colors.neutral20,
        fontFace: BRAND.fonts.body
      });
      this._addFooter(slide);
      return;
    }

    this._renderChart(slide, chart, {
      x: card.x + SPACE.s16,
      y: card.y + SPACE.s16,
      w: card.w - SPACE.s32,
      h: card.h - SPACE.s32
    });

    this._addFooter(slide);
  }

  _addChartTextSlide(slide, data) {
    this._addBaseSlide(slide);
    this._addSlideTitle(slide, data.title || 'Insights');
    const chart = data.chart || null;
    const bullets = data.bullets || [];
    const card = {
      x: CONTENT.x,
      y: LAYOUT.bodyY + SPACE.s16,
      w: CONTENT.w,
      h: 4.8
    };

    this._addCard(slide, card, { fill: BRAND.colors.neutral100, line: BRAND.colors.neutral60 });

    const chartWidth = card.w * 0.6;
    const textWidth = card.w - chartWidth - LAYOUT.columnGap;
    const chartBox = {
      x: card.x + SPACE.s12,
      y: card.y + SPACE.s12,
      w: chartWidth - SPACE.s12,
      h: card.h - SPACE.s24
    };
    const textBox = {
      x: card.x + chartWidth + LAYOUT.columnGap,
      y: card.y + SPACE.s12,
      w: textWidth - SPACE.s12,
      h: card.h - SPACE.s24
    };

    if (chart && Array.isArray(chart.series) && chart.series.length > 0) {
      this._renderChart(slide, chart, chartBox, { compact: true });
    } else {
      slide.addText('Chart data unavailable.', {
        x: chartBox.x,
        y: chartBox.y,
        w: chartBox.w,
        h: 1.2,
        fontSize: TYPE.body,
        color: BRAND.colors.neutral20,
        fontFace: BRAND.fonts.body
      });
    }

    if (bullets.length > 0) {
      this._addBulletedText(slide, bullets, textBox, {
        fontSize: TYPE.body,
        color: BRAND.colors.indigo,
        fontFace: BRAND.fonts.body,
        indent: 16,
        lineSpacingMultiple: 1.1,
        paraSpaceAfter: 4
      });
    }

    this._addFooter(slide);
  }

  _addCodeSlide(slide, data) {
    this._addBaseSlide(slide);
    this._addSlideTitle(slide, data.title);
    const code = data.code?.content || '';

    const card = {
      x: CONTENT.x,
      y: LAYOUT.bodyY + SPACE.s12,
      w: CONTENT.w,
      h: 4.8
    };
    this._addCard(slide, card, { fill: BRAND.colors.neutral100, line: BRAND.colors.neutral60 });

    slide.addText(code, {
      x: card.x + SPACE.s16,
      y: card.y + SPACE.s16,
      w: card.w - SPACE.s32,
      h: card.h - SPACE.s32,
      fontSize: TYPE.mono,
      color: BRAND.colors.neutral0,
      fontFace: BRAND.fonts.mono
    });

    this._addFooter(slide);
  }

  _addClosingSlide(slide, data) {
    this._addBaseSlide(slide);
    this._addSlideTitle(slide, data.title || 'Next Steps');
    const bullets = data.bullets || [];
    const card = {
      x: CONTENT.x,
      y: LAYOUT.bodyY + SPACE.s16,
      w: CONTENT.w,
      h: 4.6
    };
    this._addCard(slide, card, { fill: BRAND.colors.sand, line: BRAND.colors.neutral60 });

    if (bullets.length > 0) {
      this._addBulletedText(slide, bullets, {
        x: card.x + SPACE.s16,
        y: card.y + SPACE.s16,
        w: card.w - SPACE.s32,
        h: card.h - SPACE.s32
      }, {
        fontSize: TYPE.bodyLg,
        color: BRAND.colors.indigo,
        fontFace: BRAND.fonts.body,
        indent: 18,
        lineSpacingMultiple: 1.15,
        paraSpaceAfter: 6
      });
    }

    this._addFooter(slide);
  }

  _addAppendixSlide(slide, data) {
    this._addBaseSlide(slide);
    this._addSlideTitle(slide, data.title || 'Appendix');
    const bullets = data.bullets || [];
    const card = {
      x: CONTENT.x,
      y: LAYOUT.bodyY + SPACE.s16,
      w: CONTENT.w,
      h: 4.8
    };
    this._addCard(slide, card, { fill: BRAND.colors.neutral100, line: BRAND.colors.neutral60 });

    this._addBulletedText(slide, bullets, {
      x: card.x + SPACE.s16,
      y: card.y + SPACE.s16,
      w: card.w - SPACE.s32,
      h: card.h - SPACE.s32
    }, {
      fontSize: TYPE.body,
      color: BRAND.colors.indigo,
      fontFace: BRAND.fonts.body,
      indent: 16,
      lineSpacingMultiple: 1.1,
      paraSpaceAfter: 4
    });

    this._addFooter(slide);
  }

  _addSlideTitle(slide, title) {
    const titleText = title || 'Overview';
    slide.addText(titleText, {
      x: LAYOUT.marginX,
      y: LAYOUT.titleY,
      w: LAYOUT.width - (LAYOUT.marginX * 2),
      h: 0.6,
      fontSize: this._titleFontSize(titleText, TYPE.h2),
      bold: true,
      color: BRAND.colors.grape,
      fontFace: BRAND.fonts.heading
    });

    slide.addShape(this.shapeType.rect, {
      x: LAYOUT.marginX,
      y: LAYOUT.titleY + 0.55,
      w: 1.5,
      h: SPACE.s4,
      fill: { color: BRAND.colors.apricot },
      line: { color: BRAND.colors.apricot }
    });
  }

  _renderStepSequence(slide, steps, options = {}) {
    const maxSteps = Math.min(steps.length, 6);
    const frame = options.frame || {
      x: CONTENT.x,
      y: LAYOUT.bodyY + SPACE.s16,
      w: CONTENT.w,
      h: 4.6
    };
    const labelPosition = options.labelPosition || 'below';
    const showNumbers = options.showNumbers === true;
    const nodeFill = options.nodeFill || BRAND.colors.grape;
    const nodeTextColor = options.nodeTextColor || BRAND.colors.neutral100;
    const edgePadding = options.edgePadding || Math.min(0.6, frame.w * 0.08);
    const spanRatio = Math.min(1, Math.max(0.2, options.spanRatio || 1));

    const trimmed = steps.slice(0, maxSteps);
    const baseStartX = frame.x + edgePadding;
    const baseEndX = frame.x + frame.w - edgePadding;
    const lineRatio = options.lineRatio || 0.5;
    const lineY = frame.y + (frame.h * lineRatio);
    const maxLineWidth = Math.max(0.01, baseEndX - baseStartX);
    const lineWidth = maxLineWidth * spanRatio;
    const startX = baseStartX + ((maxLineWidth - lineWidth) / 2);
    const endX = startX + lineWidth;
    const gap = maxSteps > 1 ? lineWidth / (maxSteps - 1) : 0;
    const nodeSize = options.nodeSize || 0.32;
    const maxLabelLength = trimmed.reduce((max, step) => Math.max(max, step.label.length), 0);
    const labelFont = maxSteps > 4 || maxLabelLength > 24 ? TYPE.small : TYPE.body;
    const labelLineHeight = labelFont === TYPE.small ? 0.34 : 0.42;
    const labelGap = options.labelGap || 0.24;
    const labelPad = options.labelPad || 0.18;
    const labelInset = options.labelInset || SPACE.s8;
    const minLabelY = frame.y + SPACE.s12;
    const baseLabelWidth = Math.min(3.0, Math.max(1.4, gap * 0.9));

    slide.addShape(this.shapeType.rect, {
      x: startX,
      y: lineY,
      w: lineWidth,
      h: SPACE.s4,
      fill: { color: BRAND.colors.neutral60 },
      line: { color: BRAND.colors.neutral60 }
    });

    trimmed.forEach((step, index) => {
      const centerX = startX + (gap * index);
      const nodeX = centerX - (nodeSize / 2);
      const nodeY = lineY - (nodeSize / 2);

      slide.addShape(this.shapeType.ellipse, {
        x: nodeX,
        y: nodeY,
        w: nodeSize,
        h: nodeSize,
        fill: { color: nodeFill },
        line: { color: nodeFill }
      });

      if (showNumbers) {
        const labelNumber = step.number || String(index + 1);
        slide.addText(labelNumber, {
          x: nodeX,
          y: nodeY + 0.02,
          w: nodeSize,
          h: nodeSize,
          fontSize: TYPE.small,
          bold: true,
          color: nodeTextColor,
          fontFace: BRAND.fonts.heading,
          align: 'center',
          valign: 'middle'
        });
      }

      const leftLimit = frame.x + labelInset;
      const rightLimit = frame.x + frame.w - labelInset;
      let labelWidth = baseLabelWidth;
      let labelX = centerX - (labelWidth / 2);
      let overflow = 0;

      if (labelX < leftLimit) {
        overflow = leftLimit - labelX;
        labelWidth = Math.max(1.0, labelWidth - (overflow * 2));
        labelX = centerX - (labelWidth / 2);
      }

      if (labelX + labelWidth > rightLimit) {
        overflow = (labelX + labelWidth) - rightLimit;
        labelWidth = Math.max(1.0, labelWidth - (overflow * 2));
        labelX = centerX - (labelWidth / 2);
      }

      labelX = Math.min(Math.max(labelX, leftLimit), rightLimit - labelWidth);

      const computedMaxChars = Math.min(28, Math.max(10, Math.floor(labelWidth * (labelFont === TYPE.small ? 10 : 9))));
      const maxLabelChars = options.maxLabelChars
        ? Math.min(options.maxLabelChars, computedMaxChars)
        : computedMaxChars;
      const labelLines = this._wrapStepLabelLines(step.label, maxLabelChars);
      const labelText = labelLines.join('\n');
      const labelHeight = options.labelHeight || Math.min(1.4, (labelLineHeight * labelLines.length) + labelPad);
      const maxLabelY = frame.y + frame.h - labelHeight - SPACE.s12;
      const rawLabelY = labelPosition === 'above'
        ? lineY - (nodeSize / 2) - labelGap - labelHeight
        : lineY + (nodeSize / 2) + labelGap;
      const labelY = Math.min(Math.max(rawLabelY, minLabelY), maxLabelY);

      slide.addText(labelText, {
        x: labelX,
        y: labelY,
        w: labelWidth,
        h: labelHeight,
        fontSize: labelFont,
        color: BRAND.colors.indigo,
        fontFace: BRAND.fonts.body,
        align: 'center',
        valign: 'top'
      });
    });
  }

  _renderChart(slide, chart, frame, options = {}) {
    if (chart.type === 'bar-horizontal') {
      this._renderHorizontalBarChart(slide, chart, frame, options);
      return;
    }
    if (chart.type === 'line') {
      this._renderLineChart(slide, chart, frame, options);
      return;
    }
    this._renderVerticalBarChart(slide, chart, frame, options);
  }

  _renderVerticalBarChart(slide, chart, frame, options = {}) {
    const series = (chart.series || []).slice(0, 6);
    if (series.length === 0) {
      return;
    }

    const paddingX = options.compact ? 0.1 : 0.2;
    const paddingY = options.compact ? 0.1 : 0.2;
    const chartBox = {
      x: frame.x + paddingX,
      y: frame.y + paddingY,
      w: frame.w - (paddingX * 2),
      h: frame.h - (paddingY * 2)
    };

    const labelHeight = options.compact ? 0.3 : 0.4;
    const valueHeight = options.compact ? 0.3 : 0.35;
    const barArea = {
      x: chartBox.x,
      y: chartBox.y + valueHeight,
      w: chartBox.w,
      h: chartBox.h - labelHeight - valueHeight
    };

    const maxValue = Math.max(...series.map(point => point.value || 0)) || 1;
    const gap = options.compact ? 0.12 : 0.18;
    const barWidth = (barArea.w - (gap * (series.length - 1))) / series.length;

    series.forEach((point, index) => {
      const value = Math.max(0, point.value || 0);
      const barHeight = barArea.h * (value / maxValue);
      const x = barArea.x + (index * (barWidth + gap));
      const y = barArea.y + (barArea.h - barHeight);
      const barColor = this._barColorForIndex(chart, index, series.length);

      slide.addShape(this.shapeType.rect, {
        x,
        y,
        w: barWidth,
        h: barHeight,
        fill: { color: barColor },
        line: { color: barColor }
      });

      const display = point.display || String(point.value || '');
      slide.addText(display, {
        x,
        y: barArea.y - valueHeight,
        w: barWidth,
        h: valueHeight,
        fontSize: TYPE.small,
        color: BRAND.colors.indigo,
        fontFace: BRAND.fonts.body,
        align: 'center',
        valign: 'bottom'
      });

      slide.addText(point.label || '', {
        x,
        y: barArea.y + barArea.h + 0.02,
        w: barWidth,
        h: labelHeight,
        fontSize: TYPE.small,
        color: BRAND.colors.indigo,
        fontFace: BRAND.fonts.body,
        align: 'center',
        valign: 'top'
      });
    });
  }

  _renderHorizontalBarChart(slide, chart, frame, options = {}) {
    const series = (chart.series || []).slice(0, 6);
    if (series.length === 0) {
      return;
    }

    const paddingX = options.compact ? 0.12 : 0.2;
    const paddingY = options.compact ? 0.12 : 0.2;
    const chartBox = {
      x: frame.x + paddingX,
      y: frame.y + paddingY,
      w: frame.w - (paddingX * 2),
      h: frame.h - (paddingY * 2)
    };

    const labelColumn = Math.max(1.4, chartBox.w * 0.28);
    const valueColumn = chartBox.w - labelColumn - 0.2;
    const barArea = {
      x: chartBox.x + labelColumn,
      y: chartBox.y,
      w: valueColumn,
      h: chartBox.h
    };

    const maxValue = Math.max(...series.map(point => point.value || 0)) || 1;
    const gap = options.compact ? 0.1 : 0.14;
    const barHeight = (barArea.h - (gap * (series.length - 1))) / series.length;

    series.forEach((point, index) => {
      const value = Math.max(0, point.value || 0);
      const barWidth = barArea.w * (value / maxValue);
      const y = barArea.y + (index * (barHeight + gap));
      const barColor = this._barColorForIndex(chart, index, series.length);

      slide.addText(point.label || '', {
        x: chartBox.x,
        y,
        w: labelColumn - 0.1,
        h: barHeight,
        fontSize: TYPE.small,
        color: BRAND.colors.indigo,
        fontFace: BRAND.fonts.body,
        align: 'left',
        valign: 'middle'
      });

      slide.addShape(this.shapeType.rect, {
        x: barArea.x,
        y,
        w: barWidth,
        h: barHeight,
        fill: { color: barColor },
        line: { color: barColor }
      });

      const display = point.display || String(point.value || '');
      slide.addText(display, {
        x: barArea.x + barWidth + 0.05,
        y,
        w: 0.6,
        h: barHeight,
        fontSize: TYPE.small,
        color: BRAND.colors.indigo,
        fontFace: BRAND.fonts.body,
        align: 'left',
        valign: 'middle'
      });
    });
  }

  _renderLineChart(slide, chart, frame, options = {}) {
    const series = (chart.series || []).slice(0, 6);
    if (series.length === 0) {
      return;
    }

    const paddingX = options.compact ? 0.2 : 0.3;
    const paddingY = options.compact ? 0.3 : 0.4;
    const chartBox = {
      x: frame.x + paddingX,
      y: frame.y + paddingY,
      w: frame.w - (paddingX * 2),
      h: frame.h - (paddingY * 2)
    };

    const maxValue = Math.max(...series.map(point => point.value || 0)) || 1;
    const minValue = Math.min(...series.map(point => point.value || 0));
    const range = Math.max(1, maxValue - minValue);
    const gap = series.length > 1 ? chartBox.w / (series.length - 1) : 0;
    const lineColor = BRAND.colors.grape;

    const points = series.map((point, index) => {
      const value = point.value || 0;
      const normalized = (value - minValue) / range;
      return {
        x: chartBox.x + (gap * index),
        y: chartBox.y + chartBox.h - (chartBox.h * normalized),
        label: point.label || '',
        display: point.display || String(point.value || '')
      };
    });

    for (let i = 0; i < points.length - 1; i += 1) {
      const start = points[i];
      const end = points[i + 1];
      slide.addShape(this.shapeType.line, {
        x: start.x,
        y: start.y,
        w: end.x - start.x,
        h: end.y - start.y,
        line: { color: lineColor, width: 2 }
      });
    }

    points.forEach(point => {
      slide.addShape(this.shapeType.ellipse, {
        x: point.x - 0.08,
        y: point.y - 0.08,
        w: 0.16,
        h: 0.16,
        fill: { color: BRAND.colors.apricot },
        line: { color: BRAND.colors.apricot }
      });

      slide.addText(point.display, {
        x: point.x - 0.25,
        y: point.y - 0.4,
        w: 0.5,
        h: 0.25,
        fontSize: TYPE.small,
        color: BRAND.colors.indigo,
        fontFace: BRAND.fonts.body,
        align: 'center',
        valign: 'bottom'
      });

      slide.addText(point.label, {
        x: point.x - 0.4,
        y: chartBox.y + chartBox.h + 0.1,
        w: 0.8,
        h: 0.3,
        fontSize: TYPE.small,
        color: BRAND.colors.indigo,
        fontFace: BRAND.fonts.body,
        align: 'center',
        valign: 'top'
      });
    });
  }

  _barColorForIndex(chart, index, total) {
    const style = (chart && chart.style) || 'default';
    if (style === 'highlight-last' && index === total - 1) {
      return BRAND.colors.grape;
    }
    if (style === 'muted') {
      return BRAND.colors.neutral60;
    }
    return BRAND.colors.apricot;
  }

  _getStepItems(data) {
    const raw = data.steps || data.bullets || [];
    return raw
      .map(step => {
        const text = String(step || '').trim();
        if (!text) {
          return null;
        }
        const match = text.match(/^(\d+)\.\s*(.+)$/);
      if (match) {
          return { label: this._truncateStepLabel(match[2].trim()), number: match[1] };
        }
        return { label: this._truncateStepLabel(text), number: null };
      })
      .filter(Boolean);
  }

  _truncateStepLabel(text) {
    if (!text) {
      return '';
    }
    const withoutParen = text.replace(/\s*\([^)]*\)\s*$/, '').trim();
    const base = withoutParen || text;
    if (base.length <= 28) {
      return base;
    }
    return `${base.slice(0, 26).trim()}...`;
  }

  _wrapStepLabelLines(text, maxChars) {
    if (!text) {
      return [];
    }
    const limit = maxChars || 18;
    if (text.length <= limit) {
      return [text];
    }
    const midpoint = Math.floor(text.length / 2);
    const before = text.lastIndexOf(' ', midpoint);
    const after = text.indexOf(' ', midpoint + 1);
    const splitAt = before > 0 ? before : (after > 0 ? after : -1);
    if (splitAt > 0) {
      const first = text.slice(0, splitAt).trim();
      const second = text.slice(splitAt + 1).trim();
      if (first && second) {
        return [first, second];
      }
    }
    return [text];
  }

  _wrapStepLabel(text, maxChars) {
    return this._wrapStepLabelLines(text, maxChars).join('\n');
  }

  _addNotes(slide, data) {
    if (!data || !data.notes) {
      return;
    }
    const notes = String(data.notes || '').trim();
    if (!notes) {
      return;
    }
    const footnote = this._extractFootnote(notes);
    if (footnote) {
      slide.addText(footnote, {
        x: LAYOUT.marginX,
        y: LAYOUT.footerY - 0.35,
        w: CONTENT.w,
        h: 0.3,
        fontSize: TYPE.small,
        color: BRAND.colors.neutral20,
        fontFace: BRAND.fonts.body,
        align: 'right'
      });
    }
    if (typeof slide.addNotes === 'function') {
      slide.addNotes(notes);
    }
  }

  _extractFootnote(notes) {
    const lines = String(notes || '').split(/\r?\n/);
    const sourceLine = lines.find(line => /^sources?:/i.test(line.trim()));
    return sourceLine ? sourceLine.trim() : '';
  }

  async _embedFonts(outputPath) {
    try {
      await fsPromises.access(this.fontTemplatePath);
    } catch {
      throw new Error(
        `Embedded font template not found at ${this.fontTemplatePath}. ` +
        'Create a PPTX template with embedded Montserrat/Figtree fonts and set PPTX_FONT_TEMPLATE.'
      );
    }

    await embedFontsFromTemplate({
      sourcePptxPath: outputPath,
      templatePptxPath: this.fontTemplatePath,
      outputPptxPath: outputPath,
      tempDir: path.join(this.tempDir, 'font-embed'),
      verbose: this.verbose
    });
  }
}

function fitContainRect(box, ratio) {
  if (!ratio || Number.isNaN(ratio) || ratio <= 0) {
    return { ...box };
  }

  const boxRatio = box.w / box.h;
  let w = box.w;
  let h = box.h;

  if (boxRatio > ratio) {
    h = box.h;
    w = h * ratio;
  } else {
    w = box.w;
    h = w / ratio;
  }

  return {
    x: box.x + (box.w - w) / 2,
    y: box.y + (box.h - h) / 2,
    w,
    h
  };
}

function getImageDimensions(imagePath) {
  const ext = path.extname(imagePath).toLowerCase();
  try {
    if (ext === '.png') {
      return readPngDimensions(imagePath);
    }
    if (ext === '.jpg' || ext === '.jpeg') {
      return readJpegDimensions(imagePath);
    }
    if (ext === '.svg') {
      return readSvgDimensions(imagePath);
    }
  } catch {
    return null;
  }

  return null;
}

function readPngDimensions(imagePath) {
  const buffer = fs.readFileSync(imagePath);
  if (buffer.length < 24) return null;
  const signature = buffer.slice(0, 8).toString('hex');
  if (signature !== '89504e470d0a1a0a') return null;

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

function readJpegDimensions(imagePath) {
  const buffer = fs.readFileSync(imagePath);
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }

  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = buffer[offset + 1];
    if (marker === 0xd9 || marker === 0xda) {
      break;
    }

    const length = buffer.readUInt16BE(offset + 2);
    if (!length) break;

    const isStartOfFrame = (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    );

    if (isStartOfFrame && offset + 7 < buffer.length) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7)
      };
    }

    offset += 2 + length;
  }

  return null;
}

function readSvgDimensions(imagePath) {
  const content = fs.readFileSync(imagePath, 'utf8');
  const widthMatch = content.match(/width="([^"]+)"/i);
  const heightMatch = content.match(/height="([^"]+)"/i);

  if (widthMatch && heightMatch) {
    const width = parseSvgLength(widthMatch[1]);
    const height = parseSvgLength(heightMatch[1]);
    if (width && height) {
      return { width, height };
    }
  }

  const viewBoxMatch = content.match(/viewBox="([^"]+)"/i);
  if (viewBoxMatch) {
    const parts = viewBoxMatch[1].trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      return { width: parts[2], height: parts[3] };
    }
  }

  return null;
}

function parseSvgLength(value) {
  if (!value) return null;
  const numeric = parseFloat(value.replace(/[^0-9.]/g, ''));
  if (Number.isNaN(numeric) || numeric <= 0) return null;
  return numeric;
}

module.exports = PptxGenerator;

if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    const input = args[0];
    const output = args[1];

    if (!input || !output) {
      console.error('Usage: node pptx-generator.js <input> <output.pptx> [--profile <executive|standard|detailed>] [--deck-purpose <text>] [--persona <text>] [--no-llm] [--allow-empty] [--no-mermaid] [--no-embed-fonts] [--font-template <path>] [--verbose]');
      process.exit(1);
    }

    const options = parseArgs(args.slice(2));
    const generator = new PptxGenerator({
      verbose: options.verbose,
      embedFonts: options.embedFonts,
      fontTemplatePath: options.fontTemplatePath
    });

    if (input.endsWith('.json')) {
      const spec = JSON.parse(await fsPromises.readFile(input, 'utf8'));
      await generator.generateFromSpec(spec, output);
    } else {
      await generator.generateFromMarkdown(input, output, options);
    }

    console.log(`PPTX generated: ${output}`);
  })().catch(error => {
    console.error(`ERROR: PPTX generation failed: ${error.message}`);
    process.exit(1);
  });
}

function parseArgs(args) {
    const options = {
      title: '',
      subtitle: '',
      org: '',
      author: '',
      date: '',
      version: '',
      renderMermaid: true,
      embedFonts: true,
      fontTemplatePath: '',
      profile: 'executive',
      deckPurpose: '',
      persona: '',
      summarize: true,
      model: '',
      allowEmptyInput: false,
      verbose: false
    };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    switch (arg) {
      case '--title':
        options.title = args[i + 1];
        i += 1;
        break;
      case '--subtitle':
        options.subtitle = args[i + 1];
        i += 1;
        break;
      case '--org':
        options.org = args[i + 1];
        i += 1;
        break;
      case '--author':
        options.author = args[i + 1];
        i += 1;
        break;
      case '--date':
        options.date = args[i + 1];
        i += 1;
        break;
      case '--version':
        options.version = args[i + 1];
        i += 1;
        break;
      case '--no-mermaid':
        options.renderMermaid = false;
        break;
      case '--no-embed-fonts':
        options.embedFonts = false;
        break;
      case '--profile':
        options.profile = args[i + 1] || 'executive';
        i += 1;
        break;
      case '--deck-purpose':
        options.deckPurpose = args[i + 1] || '';
        i += 1;
        break;
      case '--persona':
        options.persona = args[i + 1] || '';
        i += 1;
        break;
      case '--no-llm':
        options.summarize = false;
        break;
      case '--allow-empty':
        options.allowEmptyInput = true;
        break;
      case '--model':
        options.model = args[i + 1] || '';
        i += 1;
        break;
      case '--font-template':
        options.fontTemplatePath = args[i + 1];
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
