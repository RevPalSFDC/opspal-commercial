#!/usr/bin/env node

/**
 * Slide Spec Generator
 *
 * Converts markdown content into a shared slide specification that can be
 * rendered to PPTX or Google Slides. Keeps layout contracts minimal and
 * deterministic.
 *
 * @version 1.0.0
 * @date 2025-12-30
 */

const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const glob = require('glob');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');
const MermaidPreRenderer = require('./mermaid-pre-renderer');
const ClaudeAPIClient = require('./claude-api-client');
const defaultRules = require('../../config/slides-generation-rules.json');

const execFileAsync = promisify(execFile);

const PROFILE_LIMITS = {
  executive: {
    maxBulletsPerSlide: 4,
    maxWordsPerBullet: 12,
    maxWordsPerTitle: 8,
    maxWordsPerSlide: 30
  },
  standard: {
    maxBulletsPerSlide: 5,
    maxWordsPerBullet: 15,
    maxWordsPerTitle: 10,
    maxWordsPerSlide: 40
  },
  detailed: {
    maxBulletsPerSlide: 6,
    maxWordsPerBullet: 18,
    maxWordsPerTitle: 12,
    maxWordsPerSlide: 50
  }
};

const DEFAULT_PROFILE = 'executive';
const CONTENT_LAYOUTS = new Set([
  'CONTENT',
  'KPI',
  'TABLE',
  'IMAGE',
  'CODE',
  'CLOSING',
  'APPENDIX',
  'TWO_COLUMN',
  'PROCESS',
  'TIMELINE',
  'QUOTE',
  'CHART',
  'CHART_TEXT'
]);
const GENERIC_TITLES = new Set([
  'overview',
  'summary',
  'analysis',
  'background',
  'introduction',
  'context',
  'details',
  'notes',
  'highlights',
  'key points',
  'findings'
]);

class SlideSpecGenerator {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.rules = options.rules || defaultRules;
    const runbook = this.rules.runbook || {};
    this.runbook = {
      punchlineLabels: (runbook.punchlineLabels || ['punchline', 'tldr', 'tl;dr']).map(label => label.toLowerCase()),
      staticHeadingMarkers: runbook.staticHeadingMarkers || ['[static]', '(static)', '[locked]', '(locked)', '[editable]', '(editable)'],
      staticTitlePatterns: runbook.staticTitlePatterns || []
    };
    this.profile = options.profile || process.env.SLIDE_PROFILE || DEFAULT_PROFILE;
    this.deckPurpose = options.deckPurpose || process.env.DECK_PURPOSE || '';
    this.persona = options.persona || process.env.DECK_PERSONA || '';
    const profileLimits = PROFILE_LIMITS[this.profile] || PROFILE_LIMITS[DEFAULT_PROFILE];
    this.limits = {
      maxSlides: 50,
      maxBulletsPerSlide: 5,
      maxWordsPerBullet: 15,
      maxWordsPerTitle: 10,
      maxWordsPerSlide: 40,
      maxElementsPerSlide: 6,
      ...this.rules.limits,
      ...profileLimits,
      ...(options.limits || {})
    };
    this.renderMermaid = options.renderMermaid !== false;
    this.tempDir = options.tempDir || path.join(__dirname, '../../.temp/pptx-generation');
    this.mermaidOptions = options.mermaidOptions || {};
    this.summarize = options.summarize !== false;
    this.allowEmptyInput = options.allowEmptyInput === true;
    this.maxSummaries = options.maxSummaries || 30;
    this.summaryCount = 0;
    this.runtimeWarnings = [];

    const hasApiKey = Boolean(process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY);
    this.llmEnabled = this.summarize && hasApiKey;
    this.llmClient = this.llmEnabled ? new ClaudeAPIClient({ verbose: this.verbose, model: options.model }) : null;
    if (this.summarize && !hasApiKey) {
      this._addWarning('LLM summarization disabled (ANTHROPIC_API_KEY not set). Falling back to heuristic bullets.');
    }
  }

  async fromFile(inputPath, options = {}) {
    const source = await this._loadSource(inputPath);
    const markdown = source.content;
    const metadata = {
      title: options.title || this._titleFromFilename(inputPath),
      subtitle: options.subtitle || '',
      org: options.org || '',
      author: options.author || 'OpsPal by RevPal',
      date: options.date || new Date().toISOString().split('T')[0],
      version: options.version || '1.0',
      deckPurpose: options.deckPurpose || this.deckPurpose || '',
      persona: options.persona || this.persona || ''
    };
    return this.fromMarkdown(markdown, {
      ...options,
      metadata,
      sourcePath: inputPath,
      sourceType: source.sourceType
    });
  }

  async fromGlob(pattern, options = {}) {
    const files = glob.sync(pattern, { nodir: true });
    if (files.length === 0) {
      throw new Error(`No markdown files found matching: ${pattern}`);
    }
    return this.fromFiles(files, options);
  }

  async fromFiles(files, options = {}) {
    const sortedFiles = this._sortFiles(files);
    const sections = [];

    for (const file of sortedFiles) {
      const source = await this._loadSource(file);
      const blocks = this._parseMarkdown(source.content);
      const firstHeading = blocks.find(block => block.type === 'heading');
      const defaultTitle = this._titleFromFilename(file);
      const sectionTitle = firstHeading && firstHeading.level === 1 ? null : defaultTitle;

      sections.push({
        title: sectionTitle,
        fallbackTitle: defaultTitle,
        sourcePath: file,
        sourceType: source.sourceType,
        blocks
      });
    }

    const metadata = {
      title: options.title || 'Presentation',
      subtitle: options.subtitle || '',
      org: options.org || '',
      author: options.author || 'OpsPal by RevPal',
      date: options.date || new Date().toISOString().split('T')[0],
      version: options.version || '1.0',
      deckPurpose: options.deckPurpose || this.deckPurpose || '',
      persona: options.persona || this.persona || ''
    };

    const slides = [];
    slides.push(this._buildTitleSlide(metadata));

    for (const section of sections) {
      if (section.title) {
        slides.push({
          layout: 'SECTION',
          title: section.title
        });
      }
      const sectionSlides = await this._blocksToSlides(section.blocks, {
        sectionTitle: section.title || section.fallbackTitle,
        sourcePath: section.sourcePath,
        sourceType: section.sourceType
      });
      slides.push(...sectionSlides);
    }

    const processedSlides = this._postProcessSlides(slides, metadata);
    return this._finalizeSpec({ metadata, slides: processedSlides });
  }

  async fromMarkdown(markdown, options = {}) {
    const metadata = options.metadata || {
      title: options.title || 'Presentation',
      subtitle: options.subtitle || '',
      org: options.org || '',
      author: options.author || 'OpsPal by RevPal',
      date: options.date || new Date().toISOString().split('T')[0],
      version: options.version || '1.0',
      deckPurpose: options.deckPurpose || this.deckPurpose || '',
      persona: options.persona || this.persona || ''
    };

    const blocks = this._parseMarkdown(markdown);
    const slides = [this._buildTitleSlide(metadata)];
    const contentSlides = await this._blocksToSlides(blocks, {
      sectionTitle: metadata.title,
      sourcePath: options.sourcePath,
      sourceType: options.sourceType
    });
    slides.push(...contentSlides);
    const processedSlides = this._postProcessSlides(slides, metadata);

    return this._finalizeSpec({ metadata, slides: processedSlides });
  }

  async _blocksToSlides(blocks, context = {}) {
    const slides = [];
    let currentTitle = context.sectionTitle || 'Overview';
    let currentSlideKind = 'editable';
    let pendingPunchline = '';
    const docType = this._detectDocType(context, blocks);

    for (let i = 0; i < blocks.length; i += 1) {
      const block = blocks[i];
      if (block.type === 'heading') {
        currentSlideKind = block.slideKind || (this._matchesStaticTitle(block.text) ? 'static' : 'editable');
        pendingPunchline = '';
        if (block.level === 1) {
          slides.push({ layout: 'SECTION', title: block.text });
          currentTitle = block.text;
          continue;
        }
        currentTitle = block.text;
        continue;
      }

      if (block.type === 'punchline') {
        pendingPunchline = block.text;
        continue;
      }

      if (block.type === 'quote') {
        const parsed = this._parseQuoteBlock(block.text);
        if (parsed.quote) {
          const slide = {
            layout: 'QUOTE',
            title: this._truncateTitle(currentTitle),
            quote: parsed.quote,
            author: parsed.author,
            slideKind: currentSlideKind
          };
          if (pendingPunchline) {
            slide.punchline = pendingPunchline;
            pendingPunchline = '';
          }
          if (parsed.sources.length > 0) {
            slide.notes = this._buildSourcesNote(parsed.sources);
          }
          slides.push(slide);
        }
        continue;
      }

      if (block.type === 'list') {
        const isOrdered = this._isOrderedSequence(block.items);
        const useProcessLayout = this._isProcessTitle(currentTitle, block.items.length) ||
          (isOrdered && this._looksLikeProcessList(block.items));
        const layout = useProcessLayout
          ? this._selectProcessLayout(currentTitle)
          : this._selectTextLayout(currentTitle, docType);
        const isStatic = currentSlideKind === 'static';
        const bullets = isStatic
          ? block.items
          : await this._summarizeList(block.items, {
              title: currentTitle,
              docType
            });
        const normalized = this._normalizeBullets(bullets, {
          splitCompound: !(isOrdered || useProcessLayout),
          preserveText: isStatic
        });
        const chunks = isStatic ? [normalized] : this._chunkBullets(normalized, currentTitle);
        const punchline = pendingPunchline;
        pendingPunchline = '';
        chunks.forEach((chunk, index) => {
          const extracted = isStatic ? { bullets: chunk, sources: [] } : this._extractSourcesFromBullets(chunk);
          slides.push({
            layout,
            title: this._truncateTitle(currentTitle),
            bullets: extracted.bullets,
            slideKind: currentSlideKind,
            punchline: index === 0 && punchline ? punchline : undefined,
            notes: !isStatic && extracted.sources.length > 0 ? this._buildSourcesNote(extracted.sources) : undefined
          });
        });
        continue;
      }

      if (block.type === 'paragraph') {
        const layout = this._selectTextLayout(currentTitle, docType);
        const isStatic = currentSlideKind === 'static';
        const bullets = isStatic
          ? [block.text]
          : await this._paragraphToBullets(block.text, {
              title: currentTitle,
              docType
            });
        const normalized = this._normalizeBullets(bullets, { preserveText: isStatic });
        const chunks = isStatic ? [normalized] : this._chunkBullets(normalized, currentTitle);
        const punchline = pendingPunchline;
        pendingPunchline = '';
        chunks.forEach((chunk, index) => {
          const extracted = isStatic ? { bullets: chunk, sources: [] } : this._extractSourcesFromBullets(chunk);
          slides.push({
            layout,
            title: this._truncateTitle(currentTitle),
            bullets: extracted.bullets,
            slideKind: currentSlideKind,
            punchline: index === 0 && punchline ? punchline : undefined,
            notes: !isStatic && extracted.sources.length > 0 ? this._buildSourcesNote(extracted.sources) : undefined
          });
        });
        continue;
      }

      if (block.type === 'table') {
        const isStatic = currentSlideKind === 'static';
        const isMetrics = this._isMetricsSection(currentTitle);
        const chartData = isStatic ? null : this._buildChartFromTable(block, currentTitle);
        const nextBlock = blocks[i + 1];
        const canCombine = Boolean(
          chartData &&
          nextBlock &&
          nextBlock.type === 'list' &&
          !this._looksLikeProcessList(nextBlock.items)
        );
        if (chartData && canCombine) {
          const bullets = await this._summarizeList(nextBlock.items, {
            title: currentTitle,
            docType
          });
          const normalized = this._normalizeBullets(bullets, { splitCompound: true });
          const chunk = this._chunkBullets(normalized, currentTitle)[0] || [];
          const extracted = this._extractSourcesFromBullets(chunk);
          slides.push({
            layout: 'CHART_TEXT',
            title: this._truncateTitle(currentTitle),
            chart: chartData,
            bullets: extracted.bullets,
            slideKind: currentSlideKind,
            punchline: pendingPunchline || undefined,
            notes: extracted.sources.length > 0 ? this._buildSourcesNote(extracted.sources) : undefined
          });
          pendingPunchline = '';
          i += 1;
          continue;
        }

        if (chartData) {
          slides.push({
            layout: 'CHART',
            title: this._truncateTitle(currentTitle),
            chart: chartData,
            slideKind: currentSlideKind,
            punchline: pendingPunchline || undefined
          });
          pendingPunchline = '';
          continue;
        }
        if (!isStatic && isMetrics && block.headers.length === 2) {
          const metrics = block.rows.slice(0, 4).map(row => ({
            label: row[0] || '',
            value: row[1] || ''
          }));
          slides.push({
            layout: 'KPI',
            title: this._truncateTitle(currentTitle),
            metrics,
            slideKind: currentSlideKind,
            punchline: pendingPunchline || undefined
          });
          pendingPunchline = '';
        } else {
          slides.push({
            layout: 'TABLE',
            title: this._truncateTitle(currentTitle),
            table: {
              headers: block.headers,
              rows: block.rows
            },
            slideKind: currentSlideKind,
            punchline: pendingPunchline || undefined
          });
          pendingPunchline = '';
        }
        continue;
      }

      if (block.type === 'code') {
        slides.push({
          layout: 'CODE',
          title: this._truncateTitle(currentTitle),
          code: {
            language: block.language,
            content: block.content
          },
          slideKind: currentSlideKind,
          punchline: pendingPunchline || undefined
        });
        pendingPunchline = '';
        continue;
      }

      if (block.type === 'mermaid') {
        const image = await this._renderMermaid(block.content, context.sourcePath);
        if (image.placeholder) {
          const steps = this._extractMermaidSteps(block.content);
          if (steps.length >= 2) {
            slides.push({
              layout: 'PROCESS',
              title: this._truncateTitle(currentTitle),
              bullets: steps,
              notes: 'Mermaid rendering unavailable; using process fallback.',
              slideKind: currentSlideKind,
              punchline: pendingPunchline || undefined
            });
            pendingPunchline = '';
            continue;
          }
          slides.push({
            layout: 'CODE',
            title: this._truncateTitle(currentTitle),
            code: {
              language: 'mermaid',
              content: block.content
            },
            slideKind: currentSlideKind,
            punchline: pendingPunchline || undefined
          });
          pendingPunchline = '';
        } else {
          slides.push({
            layout: 'IMAGE',
            title: this._truncateTitle(currentTitle),
            image: {
              path: image.path,
              alt: block.title || 'Mermaid diagram'
            },
            slideKind: currentSlideKind,
            punchline: pendingPunchline || undefined
          });
          pendingPunchline = '';
        }
      }
    }

    return slides;
  }

  _parseMarkdown(markdown) {
    const lines = markdown.split(/\r?\n/);
    const blocks = [];
    let paragraph = [];
    let list = [];
    let table = [];
    let quote = [];
    let inCode = false;
    let codeLang = '';
    let codeLines = [];

    const flushParagraph = () => {
      if (paragraph.length === 0) return;
      blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
      paragraph = [];
    };

    const flushList = () => {
      if (list.length === 0) return;
      blocks.push({ type: 'list', items: list });
      list = [];
    };

    const flushTable = () => {
      if (table.length === 0) return;
      const parsed = this._parseTable(table);
      if (parsed) {
        blocks.push(parsed);
      } else {
        paragraph.push(...table);
      }
      table = [];
    };

    const flushQuote = () => {
      if (quote.length === 0) return;
      blocks.push({ type: 'quote', text: quote.join(' ') });
      quote = [];
    };

    const flushCode = () => {
      if (!codeLines.length) return;
      if (codeLang === 'mermaid') {
        blocks.push({ type: 'mermaid', content: codeLines.join('\n') });
      } else {
        blocks.push({ type: 'code', language: codeLang || 'text', content: codeLines.join('\n') });
      }
      codeLines = [];
      codeLang = '';
    };

    for (const rawLine of lines) {
      const line = rawLine.trimEnd();
      const codeMatch = line.match(/^```(\w+)?/);

      if (codeMatch) {
        if (inCode) {
          flushCode();
          inCode = false;
        } else {
          flushParagraph();
          flushList();
          flushTable();
          flushQuote();
          inCode = true;
          codeLang = (codeMatch[1] || '').toLowerCase();
        }
        continue;
      }

      if (inCode) {
        codeLines.push(rawLine);
        continue;
      }

      if (!line.trim().startsWith('>') && quote.length > 0) {
        flushQuote();
      }

      const punchlineText = this._matchPunchline(line.trim());
      if (punchlineText) {
        flushParagraph();
        flushList();
        flushTable();
        flushQuote();
        blocks.push({ type: 'punchline', text: punchlineText });
        continue;
      }

      if (line.startsWith('#')) {
        flushParagraph();
        flushList();
        flushTable();
        flushQuote();
        const match = line.match(/^(#{1,6})\s+(.+)$/);
        if (match) {
          const parsedHeading = this._parseHeadingText(match[2].trim());
          blocks.push({
            type: 'heading',
            level: match[1].length,
            text: parsedHeading.text,
            slideKind: parsedHeading.slideKind
          });
        }
        continue;
      }

      if (line.trim().startsWith('>')) {
        flushParagraph();
        flushList();
        flushTable();
        quote.push(line.trim().replace(/^>\s?/, '').trim());
        continue;
      }

      if (this._isListItem(line)) {
        flushParagraph();
        flushTable();
        flushQuote();
        list.push(this._stripListMarker(line));
        continue;
      }

      if (this._isTableLine(line)) {
        flushParagraph();
        flushList();
        flushQuote();
        table.push(line);
        continue;
      }

      if (line.trim() === '') {
        flushParagraph();
        flushList();
        flushTable();
        flushQuote();
        continue;
      }

      paragraph.push(line.trim());
    }

    flushParagraph();
    flushList();
    flushTable();
    flushQuote();
    if (inCode) {
      flushCode();
    }

    return blocks;
  }

  _parseHeadingText(text) {
    if (!text) {
      return { text: '', slideKind: null };
    }
    let slideKind = null;
    let cleaned = text;
    const marker = (this.runbook.staticHeadingMarkers || []).find(entry =>
      cleaned.toLowerCase().includes(String(entry).toLowerCase())
    );
    if (marker) {
      slideKind = String(marker).toLowerCase().includes('editable') ? 'editable' : 'static';
      cleaned = cleaned.replace(marker, '').replace(/\s{2,}/g, ' ').trim();
    }
    if (!slideKind && this._matchesStaticTitle(cleaned)) {
      slideKind = 'static';
    }
    return { text: cleaned, slideKind };
  }

  _matchesStaticTitle(text) {
    if (!text || !Array.isArray(this.runbook.staticTitlePatterns)) {
      return false;
    }
    const normalized = text.toLowerCase();
    return this.runbook.staticTitlePatterns.some(pattern => normalized.includes(String(pattern).toLowerCase()));
  }

  _matchPunchline(text) {
    if (!text) {
      return '';
    }
    const match = text.match(/^([^:]+):\s*(.+)$/);
    if (!match) {
      return '';
    }
    const label = match[1].trim().toLowerCase();
    if (!this.runbook.punchlineLabels.includes(label)) {
      return '';
    }
    return match[2].trim();
  }

  _buildTitleSlide(metadata) {
    const notes = [];
    if (metadata.org) {
      notes.push(`Organization: ${metadata.org}`);
    }
    if (metadata.deckPurpose) {
      notes.push(`Deck Purpose: ${metadata.deckPurpose}`);
    }
    if (metadata.persona) {
      notes.push(`Persona: ${metadata.persona}`);
    }
    return {
      layout: 'TITLE',
      title: metadata.title || 'Presentation',
      subtitle: metadata.subtitle || '',
      notes: notes.join('\n')
    };
  }

  _finalizeSpec(spec) {
    const warnings = [...this.runtimeWarnings, ...this._validateSpec(spec)];
    return { ...spec, warnings };
  }

  _validateSpec(spec) {
    const warnings = [];
    const slides = spec.slides || [];

    if (slides.length > this.limits.maxSlides) {
      warnings.push(`Slide count ${slides.length} exceeds max ${this.limits.maxSlides}`);
    }

    for (const slide of slides) {
      const isStatic = slide.slideKind === 'static';
      if (!isStatic && slide.title && this._wordCount(slide.title) > this.limits.maxWordsPerTitle) {
        warnings.push(`Title too long: "${slide.title}"`);
      }
      if (!isStatic && slide.bullets) {
        slide.bullets.forEach(bullet => {
          if (this._wordCount(bullet) > this.limits.maxWordsPerBullet) {
            warnings.push(`Bullet too long: "${bullet}"`);
          }
          if (this._isCompoundBullet(bullet)) {
            warnings.push(`Bullet may contain multiple ideas: "${bullet}"`);
          }
          if (/[.!?]$/.test(bullet)) {
            warnings.push(`Bullet ends with punctuation: "${bullet}"`);
          }
        });
        if (slide.bullets.length === 1 && slide.layout === 'CONTENT') {
          warnings.push(`Single bullet on slide "${slide.title || 'Untitled'}"`);
        }
      }
      const wordCount = this._slideWordCount(slide);
      if (this.limits.maxWordsPerSlide && wordCount > this.limits.maxWordsPerSlide) {
        warnings.push(`Slide "${slide.title || 'Untitled'}" exceeds max words (${wordCount}/${this.limits.maxWordsPerSlide})`);
      }
      const elementCount = this._slideElementCount(slide);
      if (this.limits.maxElementsPerSlide && elementCount > this.limits.maxElementsPerSlide) {
        warnings.push(`Slide "${slide.title || 'Untitled'}" exceeds max elements (${elementCount}/${this.limits.maxElementsPerSlide})`);
      }
      if (slide.title && slide.title.includes('{{')) {
        warnings.push(`Unreplaced placeholder in title: "${slide.title}"`);
      }
      if (slide.bullets && slide.bullets.some(b => b.includes('{{'))) {
        warnings.push('Unreplaced placeholder found in bullets');
      }
    }

    return warnings;
  }

  async _renderMermaid(code, sourcePath) {
    if (!this.renderMermaid) {
      return { placeholder: true };
    }
    const renderer = new MermaidPreRenderer({
      verbose: this.verbose,
      cacheDir: path.join(this.tempDir, 'mermaid-cache'),
      outputFormat: 'png',
      ...this.mermaidOptions
    });

    await fsPromises.mkdir(renderer.cacheDir, { recursive: true });
    const hashSource = sourcePath ? path.basename(sourcePath) : 'inline';
    const hash = `${hashSource}-${crypto.createHash('sha1').update(code).digest('hex').slice(0, 12)}`;
    try {
      const result = await renderer._renderDiagram(code, hash);
      if (result.type === 'placeholder') {
        return { placeholder: true };
      }
      return result;
    } catch (error) {
      if (this.verbose) {
        console.log(`WARN: Mermaid render failed: ${error.message}`);
      }
      return { placeholder: true };
    }
  }

  async _loadSource(inputPath) {
    const ext = path.extname(inputPath).toLowerCase();

    if (ext === '.md' || ext === '.markdown') {
      return { content: await fsPromises.readFile(inputPath, 'utf8'), sourceType: 'markdown' };
    }

    if (ext === '.docx') {
      const content = await this._convertDocx(inputPath);
      return { content, sourceType: 'docx' };
    }

    if (ext === '.pdf') {
      const content = await this._convertPdf(inputPath);
      return { content, sourceType: 'pdf' };
    }

    if (ext === '.log' || ext === '.txt') {
      const text = await fsPromises.readFile(inputPath, 'utf8');
      return { content: this._normalizeLogText(text), sourceType: 'text' };
    }

    return { content: await fsPromises.readFile(inputPath, 'utf8'), sourceType: 'text' };
  }

  async _convertDocx(inputPath) {
    if (await this._commandExists('pandoc')) {
      const { stdout } = await execFileAsync('pandoc', ['-f', 'docx', '-t', 'markdown', inputPath]);
      if (stdout.trim()) {
        return stdout;
      }
      return this._conversionFallback(
        `DOCX conversion produced no text for ${inputPath}.`,
        'DOCX Conversion'
      );
    }

    if (await this._commandExists('docx2txt')) {
      const { stdout } = await execFileAsync('docx2txt', [inputPath, '-']);
      if (stdout.trim()) {
        return stdout;
      }
      return this._conversionFallback(
        `DOCX conversion produced no text for ${inputPath}.`,
        'DOCX Conversion'
      );
    }

    return this._conversionFallback(
      `No DOCX converter available for ${inputPath}. Install pandoc or docx2txt.`,
      'DOCX Conversion'
    );
  }

  async _convertPdf(inputPath) {
    if (await this._commandExists('pdftotext')) {
      const { stdout } = await execFileAsync('pdftotext', ['-layout', '-nopgbrk', inputPath, '-']);
      if (stdout.trim()) {
        return stdout;
      }
      return this._conversionFallback(
        `PDF conversion produced no text for ${inputPath}.`,
        'PDF Conversion'
      );
    }

    return this._conversionFallback(
      `No PDF converter available for ${inputPath}. Install pdftotext.`,
      'PDF Conversion'
    );
  }

  async _commandExists(command) {
    try {
      await execFileAsync('which', [command]);
      return true;
    } catch {
      return false;
    }
  }

  _conversionFallback(message, title) {
    if (!this.allowEmptyInput) {
      throw new Error(message);
    }
    this._addWarning(message);
    return [
      `# ${title}`,
      `- ${message}`,
      '- Provide a text/markdown export or install the required converter.'
    ].join('\n');
  }

  _normalizeLogText(text) {
    const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    if (lines.length === 0) {
      return '';
    }

    const sections = {
      errors: [],
      warnings: [],
      info: [],
      other: []
    };

    for (const line of lines) {
      if (/error|fatal|exception/i.test(line)) {
        sections.errors.push(line);
      } else if (/warn/i.test(line)) {
        sections.warnings.push(line);
      } else if (/info|debug|notice/i.test(line)) {
        sections.info.push(line);
      } else {
        sections.other.push(line);
      }
    }

    const output = [];
    if (sections.errors.length) {
      output.push('## Errors');
      output.push(...sections.errors.map(line => `- ${line}`));
    }
    if (sections.warnings.length) {
      output.push('## Warnings');
      output.push(...sections.warnings.map(line => `- ${line}`));
    }
    if (sections.info.length) {
      output.push('## Info');
      output.push(...sections.info.map(line => `- ${line}`));
    }
    if (sections.other.length) {
      output.push('## Details');
      output.push(...sections.other.map(line => `- ${line}`));
    }

    return output.join('\n');
  }

  _postProcessSlides(slides, metadata = {}) {
    let processed = this._dropRedundantSections(slides, metadata);
    processed = this._mergeConsecutiveContentSlides(processed);
    processed = this._enforceAssertionTitles(processed);
    return processed;
  }

  _dropRedundantSections(slides, metadata) {
    const result = [];
    const titleNormalized = this._normalizeTitle(metadata.title || '');

    for (let i = 0; i < slides.length; i += 1) {
      const slide = slides[i];
      if (slide.layout === 'SECTION') {
        const isTitleDuplicate = i === 1 &&
          slides[0] &&
          slides[0].layout === 'TITLE' &&
          this._normalizeTitle(slide.title) === titleNormalized;

        const nextSectionIndex = slides.findIndex((candidate, idx) => idx > i && candidate.layout === 'SECTION');
        const sliceEnd = nextSectionIndex === -1 ? slides.length : nextSectionIndex;
        const contentSlides = slides
          .slice(i + 1, sliceEnd)
          .filter(candidate => CONTENT_LAYOUTS.has(candidate.layout));

        if (isTitleDuplicate || contentSlides.length <= 1) {
          continue;
        }
      }
      result.push(slide);
    }

    return result;
  }

  _mergeConsecutiveContentSlides(slides) {
    const merged = [];

    for (const slide of slides) {
      const previous = merged[merged.length - 1];
      const locked = (slide && slide.slideKind === 'static') || (previous && previous.slideKind === 'static');
      const hasPunchline = (slide && slide.punchline) || (previous && previous.punchline);
      if (locked || hasPunchline) {
        merged.push(slide);
        continue;
      }
      if (previous && slide.layout === 'CONTENT' && previous.layout === 'CONTENT') {
        const sameTitle = this._normalizeTitle(previous.title) === this._normalizeTitle(slide.title);
        const combined = [...(previous.bullets || []), ...(slide.bullets || [])];
        if (sameTitle && combined.length <= this.limits.maxBulletsPerSlide) {
          previous.bullets = combined;
          continue;
        }
      }
      merged.push(slide);
    }

    return merged;
  }

  _enforceAssertionTitles(slides) {
    return slides.map(slide => {
      if (!slide.title || !Array.isArray(slide.bullets) || slide.bullets.length === 0) {
        return slide;
      }
      if (slide.slideKind === 'static' || slide.punchline) {
        return slide;
      }
      if (!this._isGenericTitle(slide.title)) {
        return slide;
      }
      const assertion = this._buildAssertionTitle(slide.bullets[0]);
      if (!assertion) {
        return slide;
      }
      const updated = { ...slide, title: assertion };
      if (slide.bullets.length > 1) {
        updated.bullets = slide.bullets.slice(1);
      }
      return updated;
    });
  }

  _detectDocType(context = {}, blocks = []) {
    const sourcePath = (context.sourcePath || '').toLowerCase();
    if (sourcePath.includes('retrospective') || sourcePath.includes('postmortem')) {
      return 'retrospective';
    }
    if (sourcePath.includes('incident')) {
      return 'incident';
    }
    if (sourcePath.endsWith('.log')) {
      return 'log';
    }
    if (sourcePath.endsWith('.pdf')) {
      return 'pdf';
    }

    const headingText = blocks
      .filter(block => block.type === 'heading')
      .map(block => block.text.toLowerCase())
      .join(' ');
    if (headingText.includes('retrospective') || headingText.includes('postmortem')) {
      return 'retrospective';
    }

    return 'generic';
  }

  _selectTextLayout(title, docType) {
    if (this._isClosingSection(title)) {
      return 'CLOSING';
    }
    if (this._isAppendixSection(title, docType)) {
      return 'APPENDIX';
    }
    return 'CONTENT';
  }

  async _summarizeList(items, context = {}) {
    if (!this._shouldSummarizeList(items)) {
      return items;
    }
    const text = items.map(item => `- ${item}`).join('\n');
    const summary = await this._summarizeText(text, context);
    return summary.length > 0 ? summary : items;
  }

  _normalizeBullets(items, options = {}) {
    if (options.preserveText) {
      return items
        .map(item => String(item || '').trim())
        .filter(Boolean);
    }
    const splitCompound = options.splitCompound !== false;
    const normalized = [];
    for (const item of items) {
      const cleaned = this._cleanBullet(item);
      const splits = splitCompound ? this._splitCompoundBullet(cleaned) : [cleaned];
      for (const split of splits) {
        const truncated = this._truncateBullet(split);
        if (truncated) {
          normalized.push(truncated);
        }
      }
    }
    return normalized;
  }

  _cleanBullet(text) {
    if (!text) return '';
    const trimmed = text.trim();
    if (!trimmed) return '';
    const withoutTrailing = trimmed.replace(/[.;:]+$/, '');
    return withoutTrailing.replace(/\s+/g, ' ');
  }

  _splitCompoundBullet(text) {
    if (!text) return [];
    const semicolonParts = text.split(/\s*;\s*/).map(part => part.trim()).filter(Boolean);
    if (semicolonParts.length > 1 && this._partsWithinLimit(semicolonParts)) {
      return semicolonParts;
    }

    const andParts = text.split(/\s+and\s+/i).map(part => part.trim()).filter(Boolean);
    if (andParts.length === 2 && this._partsWithinLimit(andParts)) {
      return andParts;
    }

    return [text];
  }

  _partsWithinLimit(parts) {
    return parts.every(part => {
      const wordCount = this._wordCount(part);
      return wordCount >= 2 && wordCount <= this.limits.maxWordsPerBullet;
    });
  }

  _shouldSummarizeText(text) {
    if (!this.llmEnabled || this.summaryCount >= this.maxSummaries) {
      return false;
    }
    const wordCount = this._wordCount(text);
    const threshold = this.profile === 'executive' ? 28 : 40;
    return wordCount >= threshold;
  }

  _shouldSummarizeList(items) {
    if (!this.llmEnabled || this.summaryCount >= this.maxSummaries) {
      return false;
    }
    const tooMany = items.length > this.limits.maxBulletsPerSlide;
    const tooLong = items.some(item => this._wordCount(item) > this.limits.maxWordsPerBullet);
    return tooMany || tooLong;
  }

  async _summarizeText(text, context = {}) {
    if (!this.llmEnabled) {
      return [];
    }
    if (this.summaryCount >= this.maxSummaries) {
      this._addWarning('LLM summary budget exceeded. Skipping additional summarization.');
      return [];
    }

    this.summaryCount += 1;
    const title = context.title || '';
    const maxBullets = this.limits.maxBulletsPerSlide;

    const prompt = [
      'Summarize the content into concise executive slide bullets.',
      `Slide title: "${title}"`,
      `Return ${maxBullets} or fewer bullets.`,
      `Rules:`,
      `- Max ${this.limits.maxWordsPerBullet} words per bullet.`,
      '- Lead with the bottom-line takeaway in the first bullet.',
      '- Use sentence fragments and start with a verb when possible.',
      '- One idea per bullet; avoid combining with "and" unless unavoidable.',
      '- Do not repeat the slide title or add filler.',
      '- No numbering or prefixes.',
      '- Avoid terminal punctuation.',
      '',
      'Content:',
      text
    ].join('\n');

    const schema = {
      type: 'object',
      required: ['bullets'],
      properties: {
        bullets: {
          type: 'array',
          items: { type: 'string' }
        }
      }
    };

    try {
      const result = await this.llmClient.completeWithSchema(prompt, schema, {
        maxTokens: 200,
        temperature: 0.2
      });
      const bullets = Array.isArray(result.bullets) ? result.bullets : [];
      return bullets.slice(0, maxBullets);
    } catch (error) {
      this._addWarning(`LLM summarization failed for "${title}": ${error.message}`);
      return [];
    }
  }

  _isClosingSection(title) {
    return /next steps|action items|recommendations|remediation|follow[- ]?up/i.test(title || '');
  }

  _isAppendixSection(title, docType) {
    if (docType === 'log') {
      return true;
    }
    return /appendix|reference|logs|raw data/i.test(title || '');
  }

  _isProcessTitle(title, itemCount) {
    if (!title) return false;
    if (itemCount && itemCount > this.limits.maxElementsPerSlide) {
      return false;
    }
    return /process|workflow|journey|lifecycle|steps|phases|timeline|roadmap/i.test(title);
  }

  _looksLikeProcessList(items) {
    if (!Array.isArray(items) || items.length === 0) {
      return false;
    }
    const processPattern = /(phase|step|week|month|quarter|sprint|pilot|rollout|deploy|launch|optimi[sz]e|scale|iterate|milestone|review)/i;
    return items.some(item => processPattern.test(String(item || '')));
  }

  _selectProcessLayout(title) {
    if (/timeline|roadmap|milestone|phase/i.test(title || '')) {
      return 'TIMELINE';
    }
    return 'PROCESS';
  }

  _isOrderedSequence(items) {
    if (!Array.isArray(items) || items.length === 0) {
      return false;
    }
    return items.every(item => /^\d+\.\s+/.test(String(item || '').trim()));
  }

  _isGenericTitle(title) {
    const normalized = this._normalizeTitle(title);
    if (!normalized) {
      return true;
    }
    if (GENERIC_TITLES.has(normalized)) {
      return true;
    }
    return normalized.split(/\s+/).length <= 1;
  }

  _buildAssertionTitle(bullet) {
    const cleaned = this._cleanBullet(bullet);
    if (!cleaned) {
      return '';
    }
    const capped = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    return this._truncateTitle(capped);
  }

  _parseQuoteBlock(text) {
    const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
    if (!cleaned) {
      return { quote: '', author: '', sources: [] };
    }
    let quote = cleaned;
    let author = '';
    const match = cleaned.match(/^(.+?)(?:\s*[—-]\s*([^—-].+))$/);
    if (match) {
      quote = match[1].trim();
      author = match[2].trim();
    }
    const extracted = this._extractSourcesFromText(quote);
    return { quote: extracted.text, author, sources: extracted.sources };
  }

  _buildChartFromTable(tableBlock, title) {
    if (!tableBlock || !Array.isArray(tableBlock.headers) || tableBlock.headers.length < 2) {
      return null;
    }
    const eligible = /chart|trend|comparison|performance|growth|impact/i.test(title || '');
    if (!eligible) {
      return null;
    }
    const chartType = this._chartTypeFromTitle(title);
    const chartStyle = this._chartStyleFromTitle(title);
    const series = [];
    for (const row of tableBlock.rows || []) {
      if (!Array.isArray(row) || row.length < 2) {
        continue;
      }
      const label = String(row[0] || '').trim();
      const rawValue = String(row[1] || '').trim();
      const value = this._parseChartValue(rawValue);
      if (!label || value === null) {
        continue;
      }
      series.push({
        label,
        value,
        display: rawValue
      });
    }
    if (series.length < 2) {
      return null;
    }
    return {
      type: chartType,
      style: chartStyle,
      series: series.slice(0, 6)
    };
  }

  _parseChartValue(value) {
    if (!value) {
      return null;
    }
    const cleaned = value.replace(/[%,$]/g, '').replace(/x$/i, '').trim();
    const numeric = parseFloat(cleaned);
    if (Number.isNaN(numeric)) {
      return null;
    }
    return numeric;
  }

  _chartTypeFromTitle(title) {
    const normalized = String(title || '').toLowerCase();
    if (normalized.includes('horizontal')) {
      return 'bar-horizontal';
    }
    if (normalized.includes('comparison') || normalized.includes('by segment')) {
      return 'bar-horizontal';
    }
    if (normalized.includes('line') || normalized.includes('trendline')) {
      return 'line';
    }
    return 'bar';
  }

  _chartStyleFromTitle(title) {
    const normalized = String(title || '').toLowerCase();
    if (normalized.includes('highlight') || normalized.includes('latest')) {
      return 'highlight-last';
    }
    if (normalized.includes('neutral')) {
      return 'muted';
    }
    return 'default';
  }

  _extractMermaidSteps(code) {
    const text = String(code || '');
    const matches = [...text.matchAll(/\[([^\]]+)\]/g)];
    const steps = matches.map(match => match[1].trim()).filter(Boolean);
    if (steps.length > 1) {
      return Array.from(new Set(steps));
    }
    const fallback = [];
    text.split(/\r?\n/).forEach(line => {
      const cleaned = line.trim();
      if (!cleaned || cleaned.startsWith('%%') || cleaned.startsWith('flowchart') || cleaned.startsWith('graph')) {
        return;
      }
      const parts = cleaned.split(/-->|==>|-->|\-\-\>/).map(part => part.trim()).filter(Boolean);
      parts.forEach(part => {
        const label = part.replace(/^[A-Za-z0-9_]+/, '').replace(/[\[\]()]/g, '').trim();
        if (label) {
          fallback.push(label);
        }
      });
    });
    return Array.from(new Set(fallback)).filter(Boolean);
  }

  _normalizeTitle(text) {
    return (text || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  _addWarning(message) {
    this.runtimeWarnings.push(message);
    if (this.verbose) {
      console.log(`WARN: ${message}`);
    }
  }

  _extractSourcesFromBullets(bullets) {
    const sources = new Set();
    const cleaned = [];

    (bullets || []).forEach(bullet => {
      const extracted = this._extractSourcesFromText(bullet);
      extracted.sources.forEach(source => sources.add(source));
      if (extracted.text) {
        cleaned.push(extracted.text);
      }
    });

    return { bullets: cleaned, sources: Array.from(sources) };
  }

  _extractSourcesFromText(text) {
    const trimmed = this._cleanBullet(text);
    if (!trimmed) {
      return { text: '', sources: [] };
    }

    const sources = [];
    let cleaned = trimmed;
    const bracketMatch = cleaned.match(/\s*\[([^\]]+)\]\s*$/);
    if (bracketMatch && this._looksLikeSource(bracketMatch[1])) {
      sources.push(...this._splitSources(bracketMatch[1]));
      cleaned = cleaned.replace(bracketMatch[0], '').trim();
    }

    const parenMatch = cleaned.match(/\s*\(([^)]+)\)\s*$/);
    if (parenMatch && this._looksLikeSource(parenMatch[1])) {
      sources.push(...this._splitSources(parenMatch[1]));
      cleaned = cleaned.replace(parenMatch[0], '').trim();
    }

    return { text: cleaned, sources };
  }

  _looksLikeSource(text) {
    const normalized = String(text || '').toLowerCase();
    if (normalized.includes('source')) {
      return true;
    }
    if (normalized.includes('http') || normalized.includes('www.')) {
      return true;
    }
    if (/\b(19|20)\d{2}\b/.test(normalized)) {
      return true;
    }
    return false;
  }

  _splitSources(text) {
    const cleaned = String(text || '').replace(/sources?:/i, '').trim();
    return cleaned
      .split(/[;,]+/)
      .map(item => item.trim())
      .filter(Boolean);
  }

  _buildSourcesNote(sources) {
    if (!sources || sources.length === 0) {
      return '';
    }
    const unique = Array.from(new Set(sources));
    return `Sources: ${unique.join('; ')}`;
  }

  async _paragraphToBullets(text, context = {}) {
    const trimmed = text.trim();
    if (!trimmed) {
      return [];
    }

    if (this._shouldSummarizeText(trimmed)) {
      const summary = await this._summarizeText(trimmed, context);
      if (summary.length > 0) {
        return summary;
      }
    }

    const sentences = trimmed
      .split(/(?<=[.!?])\s+/)
      .map(sentence => sentence.trim())
      .filter(Boolean);

    if (sentences.length === 0) {
      return [];
    }

    if (sentences.length === 1) {
      return this._chunkWords(sentences[0], this.limits.maxWordsPerBullet).map(chunk => chunk.join(' '));
    }

    return sentences.map(sentence => this._truncateBullet(sentence));
  }

  _parseTable(lines) {
    if (lines.length < 2) {
      return null;
    }

    const headerLine = lines[0];
    const separatorLine = lines[1];

    if (!/^\s*\|?(\s*:?-+:?\s*\|)+\s*$/.test(separatorLine)) {
      return null;
    }

    const headers = this._splitTableRow(headerLine);
    const rows = lines.slice(2).map(line => this._splitTableRow(line)).filter(row => row.length > 0);

    return {
      type: 'table',
      headers,
      rows
    };
  }

  _splitTableRow(line) {
    const trimmed = line.trim();
    const withoutPipes = trimmed.replace(/^\|/, '').replace(/\|$/, '');
    return withoutPipes.split('|').map(cell => cell.trim());
  }

  _isListItem(line) {
    return /^(\s*[-*+]\s+|\s*\d+\.\s+)/.test(line);
  }

  _stripListMarker(line) {
    const orderedMatch = line.match(/^\s*(\d+)\.\s+(.+)$/);
    if (orderedMatch) {
      return `${orderedMatch[1]}. ${orderedMatch[2].trim()}`;
    }
    return line.replace(/^(\s*[-*+]\s+)/, '').trim();
  }

  _isTableLine(line) {
    return line.includes('|');
  }

  _isMetricsSection(title) {
    return /metric|kpi|summary|scorecard/i.test(title);
  }

  _truncateTitle(text) {
    if (!text) return '';
    const words = text.split(/\s+/);
    if (words.length <= this.limits.maxWordsPerTitle) {
      return text;
    }
    return `${words.slice(0, this.limits.maxWordsPerTitle).join(' ')}...`;
  }

  _truncateBullet(text) {
    if (!text) return '';
    const words = text.split(/\s+/);
    if (words.length <= this.limits.maxWordsPerBullet) {
      return text;
    }
    return `${words.slice(0, this.limits.maxWordsPerBullet).join(' ')}...`;
  }

  _chunkWords(text, maxWords) {
    const words = text.split(/\s+/);
    return this._chunk(words, maxWords);
  }

  _chunkBullets(items, title = '') {
    const chunks = [];
    const maxBullets = this.limits.maxBulletsPerSlide;
    const maxWords = this.limits.maxWordsPerSlide || Number.MAX_SAFE_INTEGER;
    const titleWords = title ? this._wordCount(title) : 0;
    const targetWords = Math.max(1, maxWords - titleWords);
    let current = [];
    let currentWords = 0;

    for (const item of items) {
      const itemWords = this._wordCount(item);
      const exceedsBullets = current.length >= maxBullets;
      const exceedsWords = current.length > 0 && (currentWords + itemWords) > targetWords;

      if (exceedsBullets || exceedsWords) {
        chunks.push(current);
        current = [];
        currentWords = 0;
      }

      current.push(item);
      currentWords += itemWords;
    }

    if (current.length > 0) {
      chunks.push(current);
    }

    return chunks;
  }

  _chunk(items, size) {
    const chunks = [];
    for (let i = 0; i < items.length; i += size) {
      chunks.push(items.slice(i, i + size));
    }
    return chunks;
  }

  _wordCount(text) {
    const trimmed = String(text || '').trim();
    if (!trimmed) {
      return 0;
    }
    return trimmed.split(/\s+/).length;
  }

  _slideWordCount(slide) {
    if (!slide || slide.layout === 'CODE') {
      return 0;
    }
    let count = 0;
    if (slide.title) {
      count += this._wordCount(slide.title);
    }
    if (slide.subtitle) {
      count += this._wordCount(slide.subtitle);
    }
    if (slide.punchline) {
      count += this._wordCount(slide.punchline);
    }
    if (Array.isArray(slide.bullets)) {
      count += slide.bullets.reduce((sum, bullet) => sum + this._wordCount(bullet), 0);
    }
    if (Array.isArray(slide.metrics)) {
      count += slide.metrics.reduce((sum, metric) => {
        const label = metric.label || '';
        const value = metric.value || '';
        return sum + this._wordCount(`${label} ${value}`.trim());
      }, 0);
    }
    if (slide.table) {
      count += (slide.table.headers || []).reduce((sum, header) => sum + this._wordCount(header), 0);
      (slide.table.rows || []).forEach(row => {
        row.forEach(cell => {
          count += this._wordCount(cell || '');
        });
      });
    }
    if (slide.chart && Array.isArray(slide.chart.series)) {
      count += slide.chart.series.reduce((sum, point) => {
        const label = point.label || '';
        const display = point.display || point.value || '';
        return sum + this._wordCount(`${label} ${display}`.trim());
      }, 0);
    }
    return count;
  }

  _slideElementCount(slide) {
    if (!slide) {
      return 0;
    }
    let count = 0;
    if (Array.isArray(slide.bullets)) {
      count += slide.bullets.length;
    }
    if (slide.punchline) {
      count += 1;
    }
    if (Array.isArray(slide.metrics)) {
      count += slide.metrics.length;
    }
    if (slide.table) {
      count += 1;
    }
    if (slide.image) {
      count += 1;
    }
    if (slide.code) {
      count += 1;
    }
    if (Array.isArray(slide.columns)) {
      count += slide.columns.length;
    }
    if (slide.chart) {
      count += 1;
    }
    return count;
  }

  _isCompoundBullet(text) {
    if (!text) {
      return false;
    }
    return /\s+and\s+/i.test(text) || /;/.test(text);
  }

  _titleFromFilename(filePath) {
    const base = path.basename(filePath).replace(/\.[^/.]+$/, '');
    return base.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  _sortFiles(files) {
    const patterns = [
      { match: /summary|overview|executive/i, priority: 1 },
      { match: /introduction|context/i, priority: 2 },
      { match: /analysis|details/i, priority: 3 },
      { match: /recommendation|plan|roadmap/i, priority: 4 },
      { match: /implementation|execution/i, priority: 5 },
      { match: /appendix|reference/i, priority: 6 }
    ];

    return files.slice().sort((a, b) => {
      const score = file => {
        const entry = patterns.find(pattern => pattern.match.test(file));
        return entry ? entry.priority : 10;
      };
      const scoreA = score(a);
      const scoreB = score(b);
      if (scoreA !== scoreB) {
        return scoreA - scoreB;
      }
      return a.localeCompare(b);
    });
  }
}

module.exports = SlideSpecGenerator;

if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2);
    const input = args[0];
    const output = args[1];
    const options = parseArgs(args.slice(2));

    if (!input || !output) {
      console.error('Usage: node slide-spec-generator.js <input.md|glob> <output.json> [--profile <executive|standard|detailed>] [--deck-purpose <text>] [--persona <text>] [--no-llm] [--allow-empty] [--verbose]');
      process.exit(1);
    }

    const generator = new SlideSpecGenerator({
      verbose: options.verbose,
      profile: options.profile,
      deckPurpose: options.deckPurpose,
      persona: options.persona,
      summarize: options.summarize,
      allowEmptyInput: options.allowEmptyInput
    });
    const spec = input.includes('*')
      ? await generator.fromGlob(input, { title: 'Presentation', deckPurpose: options.deckPurpose, persona: options.persona })
      : await generator.fromFile(input, { title: 'Presentation', sourcePath: input, deckPurpose: options.deckPurpose, persona: options.persona });

    await fsPromises.writeFile(output, JSON.stringify(spec, null, 2));
    console.log(`OK: Slide spec written: ${output}`);
  })().catch(error => {
    console.error(`ERROR: Slide spec generation failed: ${error.message}`);
    process.exit(1);
  });
}

function parseArgs(args) {
  const options = {
    profile: DEFAULT_PROFILE,
    summarize: true,
    allowEmptyInput: false,
    verbose: false,
    deckPurpose: '',
    persona: ''
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    switch (arg) {
      case '--profile':
        options.profile = args[i + 1] || DEFAULT_PROFILE;
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
      case '--verbose':
        options.verbose = true;
        break;
      default:
        break;
    }
  }

  return options;
}
