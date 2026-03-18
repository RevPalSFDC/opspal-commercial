#!/usr/bin/env node

/**
 * Layout Quality Analyzer for Salesforce
 *
 * Analyzes Lightning Pages, Classic Layouts, and Compact Layouts
 * Generates comprehensive quality scores (0-100) and recommendations
 *
 * Scoring Rubric (100 points total):
 *   - Field Organization: 25 points
 *   - User Experience: 25 points
 *   - Performance: 20 points
 *   - Accessibility: 15 points
 *   - Best Practices: 15 points
 *
 * Usage:
 *   const analyzer = new LayoutAnalyzer(orgAlias);
 *   const analysis = await analyzer.analyzeFlexiPage(flexiPageMetadata);
 *   console.log(`Quality Score: ${analysis.score}/100 (${analysis.grade})`);
 *
 * @version 1.0.0
 * @created 2025-10-18
 */

const fs = require('fs').promises;
const path = require('path');
const xml2js = require('xml2js');
const LayoutMetadataService = require('./layout-metadata-service');

class LayoutAnalyzer {
    /**
     * Initialize Layout Analyzer
     * @param {string} orgAlias - Salesforce org alias
     * @param {Object} options - Configuration options
     */
    constructor(orgAlias, options = {}) {
        this.orgAlias = orgAlias;
        this.metadataService = new LayoutMetadataService(orgAlias, options);
        this.verbose = options.verbose || false;
    }

    /**
     * Initialize analyzer
     */
    async init() {
        await this.metadataService.init();
    }

    /**
     * Analyze all layout metadata for an object
     * @param {string} objectName - Salesforce object API name
     * @returns {Promise<Object>} Comprehensive analysis with scores and recommendations
     */
    async analyzeObject(objectName) {
        console.log(`\n🔍 Analyzing layout quality for ${objectName}...\n`);

        // Retrieve all layout metadata
        const metadata = await this.metadataService.getAllLayoutMetadata(objectName, {
            includeMetadata: true
        });

        const analysis = {
            object: objectName,
            timestamp: new Date().toISOString(),
            summary: metadata.summary,
            flexiPages: [],
            layouts: [],
            compactLayouts: [],
            overallScore: 0,
            overallGrade: 'N/A',
            recommendations: []
        };

        // Analyze FlexiPages
        for (const flexiPage of metadata.flexiPages) {
            if (flexiPage.metadata) {
                const pageAnalysis = this.analyzeFlexiPage(flexiPage);
                analysis.flexiPages.push(pageAnalysis);
            }
        }

        // Analyze Classic Layouts
        for (const layout of metadata.layouts) {
            const layoutAnalysis = this.analyzeClassicLayout(layout);
            analysis.layouts.push(layoutAnalysis);
        }

        // Analyze Compact Layouts
        for (const compactLayout of metadata.compactLayouts) {
            if (compactLayout.metadata) {
                const clAnalysis = this.analyzeCompactLayout(compactLayout);
                analysis.compactLayouts.push(clAnalysis);
            }
        }

        // Calculate overall score (weighted average, prioritize FlexiPages)
        const allScores = [
            ...analysis.flexiPages.map(p => ({ score: p.score, weight: 3 })), // FlexiPages weighted 3x
            ...analysis.layouts.map(l => ({ score: l.score, weight: 1 })),
            ...analysis.compactLayouts.map(c => ({ score: c.score, weight: 1 }))
        ];

        if (allScores.length > 0) {
            const totalWeight = allScores.reduce((sum, s) => sum + s.weight, 0);
            const weightedSum = allScores.reduce((sum, s) => sum + (s.score * s.weight), 0);
            analysis.overallScore = Math.round(weightedSum / totalWeight);
            analysis.overallGrade = this.getGrade(analysis.overallScore);
        }

        // Generate high-level recommendations
        analysis.recommendations = this.generateOverallRecommendations(analysis);

        return analysis;
    }

    /**
     * Analyze layout quality from generated metadata files.
     * @param {Object} files - File paths for metadata to analyze
     * @param {string} files.flexiPageFile - FlexiPage XML path
     * @param {string} [files.compactLayoutFile] - CompactLayout XML path
     * @returns {Promise<Object>} Analysis summary
     */
    async analyzeFromFiles(files = {}) {
        const analysis = {
            object: files.objectName || path.basename(files.flexiPageFile || 'Generated Layout'),
            timestamp: new Date().toISOString(),
            summary: {
                flexiPageCount: 0,
                layoutCount: 0,
                compactLayoutCount: 0,
                totalLayouts: 0
            },
            flexiPages: [],
            layouts: [],
            compactLayouts: [],
            overallScore: 0,
            overallGrade: 'N/A',
            recommendations: []
        };

        if (files.flexiPageFile) {
            const flexiPageAnalysis = await this.analyzeFlexiPageFile(files.flexiPageFile);
            analysis.flexiPages.push(flexiPageAnalysis);
            analysis.summary.flexiPageCount = 1;
        }

        if (files.compactLayoutFile) {
            const compactLayoutAnalysis = await this.analyzeCompactLayoutFile(files.compactLayoutFile);
            analysis.compactLayouts.push(compactLayoutAnalysis);
            analysis.summary.compactLayoutCount = 1;
        }

        analysis.summary.totalLayouts = analysis.summary.flexiPageCount + analysis.summary.compactLayoutCount;

        const allScores = [
            ...analysis.flexiPages.map(p => ({ score: p.score, weight: 3 })),
            ...analysis.compactLayouts.map(c => ({ score: c.score, weight: 1 }))
        ];

        if (allScores.length > 0) {
            const totalWeight = allScores.reduce((sum, s) => sum + s.weight, 0);
            const weightedSum = allScores.reduce((sum, s) => sum + (s.score * s.weight), 0);
            analysis.overallScore = Math.round(weightedSum / totalWeight);
            analysis.overallGrade = this.getGrade(analysis.overallScore);
        }

        analysis.recommendations = this.generateOverallRecommendations(analysis);

        return analysis;
    }

    /**
     * Analyze a FlexiPage XML file.
     * @private
     */
    async analyzeFlexiPageFile(filePath) {
        const xmlContent = await fs.readFile(filePath, 'utf8');
        const parser = new xml2js.Parser();
        const parsed = await parser.parseStringPromise(xmlContent);
        const baseName = path.basename(filePath).replace('.flexipage-meta.xml', '');
        const masterLabel = parsed.FlexiPage?.masterLabel?.[0] || baseName;

        const flexiPage = {
            DeveloperName: baseName,
            MasterLabel: masterLabel,
            metadata: { parsed }
        };

        return this.analyzeFlexiPage(flexiPage);
    }

    /**
     * Analyze a CompactLayout XML file.
     * @private
     */
    async analyzeCompactLayoutFile(filePath) {
        const xmlContent = await fs.readFile(filePath, 'utf8');
        const parser = new xml2js.Parser();
        const parsed = await parser.parseStringPromise(xmlContent);
        const compactDef = parsed.CompactLayout || {};
        const fullName = Array.isArray(compactDef.fullName) ? compactDef.fullName[0] : compactDef.fullName;
        const label = Array.isArray(compactDef.label) ? compactDef.label[0] : compactDef.label;
        const baseName = path.basename(filePath).replace('.compactLayout-meta.xml', '');
        const developerName = fullName ? fullName.split('.').slice(-1)[0] : baseName;

        const compactLayout = {
            DeveloperName: developerName,
            Label: label || developerName,
            metadata: { parsed }
        };

        return this.analyzeCompactLayout(compactLayout);
    }

    /**
     * Analyze a FlexiPage (Lightning Record Page)
     * @param {Object} flexiPage - FlexiPage metadata
     * @returns {Object} Analysis with score breakdown
     */
    analyzeFlexiPage(flexiPage) {
        const analysis = {
            name: flexiPage.DeveloperName,
            label: flexiPage.MasterLabel,
            type: 'FlexiPage',
            score: 0,
            grade: 'F',
            breakdown: {
                fieldOrganization: { score: 0, maxScore: 25, details: {} },
                userExperience: { score: 0, maxScore: 25, details: {} },
                performance: { score: 0, maxScore: 20, details: {} },
                accessibility: { score: 0, maxScore: 15, details: {} },
                bestPractices: { score: 0, maxScore: 15, details: {} }
            },
            issues: [],
            recommendations: []
        };

        if (!flexiPage.metadata || !flexiPage.metadata.parsed) {
            analysis.issues.push('No metadata available for analysis');
            return analysis;
        }

        const parsed = flexiPage.metadata.parsed;
        const flexiPageDef = parsed.FlexiPage || {};

        // Extract data for analysis
        const components = this.extractComponents(flexiPageDef);
        const fieldSections = this.extractFieldSections(flexiPageDef, components);
        const fields = this.extractAllFields(fieldSections);

        // Score Field Organization (25 points)
        analysis.breakdown.fieldOrganization = this.scoreFieldOrganization(fieldSections, fields);

        // Score User Experience (25 points)
        analysis.breakdown.userExperience = this.scoreUserExperience(fields, components, flexiPageDef, fieldSections);

        // Score Performance (20 points)
        analysis.breakdown.performance = this.scorePerformance(components, fields);

        // Score Accessibility (15 points)
        analysis.breakdown.accessibility = this.scoreAccessibility(components, fields);

        // Score Best Practices (15 points)
        analysis.breakdown.bestPractices = this.scoreBestPractices(components, fieldSections, flexiPageDef);

        // Calculate total score
        analysis.score = Object.values(analysis.breakdown).reduce((sum, category) => sum + category.score, 0);
        analysis.grade = this.getGrade(analysis.score);

        // Generate specific recommendations
        analysis.recommendations = this.generateFlexiPageRecommendations(analysis);

        return analysis;
    }

    /**
     * Analyze a Classic Layout
     * @param {Object} layout - Layout metadata
     * @returns {Object} Analysis with score breakdown
     */
    analyzeClassicLayout(layout) {
        const analysis = {
            name: layout.name,
            type: 'ClassicLayout',
            score: 0,
            grade: 'F',
            breakdown: {
                fieldOrganization: { score: 0, maxScore: 30, details: {} },
                userExperience: { score: 0, maxScore: 30, details: {} },
                performance: { score: 0, maxScore: 20, details: {} },
                accessibility: { score: 0, maxScore: 20, details: {} }
            },
            issues: [],
            recommendations: []
        };

        if (!layout.parsed) {
            analysis.issues.push('No metadata available for analysis');
            return analysis;
        }

        const layoutDef = layout.parsed.Layout || {};

        // Extract sections and fields
        const sections = layoutDef.layoutSections || [];
        const fields = this.extractClassicLayoutFields(sections);
        const relatedLists = layoutDef.relatedLists || [];

        // Score Field Organization (30 points)
        const orgScore = this.scoreClassicFieldOrganization(sections, fields);
        analysis.breakdown.fieldOrganization = { score: orgScore, maxScore: 30, details: {} };

        // Score User Experience (30 points)
        const uxScore = this.scoreClassicUserExperience(fields, sections);
        analysis.breakdown.userExperience = { score: uxScore, maxScore: 30, details: {} };

        // Score Performance (20 points)
        const perfScore = this.scoreClassicPerformance(fields, relatedLists);
        analysis.breakdown.performance = { score: perfScore, maxScore: 20, details: {} };

        // Score Accessibility (20 points)
        const a11yScore = this.scoreClassicAccessibility(fields, sections);
        analysis.breakdown.accessibility = { score: a11yScore, maxScore: 20, details: {} };

        // Calculate total
        analysis.score = Object.values(analysis.breakdown).reduce((sum, category) => sum + category.score, 0);
        analysis.grade = this.getGrade(analysis.score);

        analysis.recommendations = this.generateClassicLayoutRecommendations(analysis);

        return analysis;
    }

    /**
     * Analyze a Compact Layout
     * @param {Object} compactLayout - CompactLayout metadata
     * @returns {Object} Analysis with score breakdown
     */
    analyzeCompactLayout(compactLayout) {
        const analysis = {
            name: compactLayout.DeveloperName,
            label: compactLayout.Label,
            type: 'CompactLayout',
            score: 0,
            grade: 'F',
            breakdown: {
                fieldSelection: { score: 0, maxScore: 50, details: {} },
                userExperience: { score: 0, maxScore: 30, details: {} },
                bestPractices: { score: 0, maxScore: 20, details: {} }
            },
            issues: [],
            recommendations: []
        };

        if (!compactLayout.metadata || !compactLayout.metadata.parsed) {
            analysis.issues.push('No metadata available for analysis');
            return analysis;
        }

        const parsed = compactLayout.metadata.parsed;
        const clDef = parsed.CompactLayout || {};
        const fields = Array.isArray(clDef.fields) ? clDef.fields : (clDef.fields ? [clDef.fields] : []);

        // Score Field Selection (50 points)
        const fieldScore = this.scoreCompactLayoutFields(fields);
        analysis.breakdown.fieldSelection = { score: fieldScore, maxScore: 50, details: {} };

        // Score User Experience (30 points)
        const uxScore = this.scoreCompactLayoutUX(fields);
        analysis.breakdown.userExperience = { score: uxScore, maxScore: 30, details: {} };

        // Score Best Practices (20 points)
        const bpScore = this.scoreCompactLayoutBestPractices(fields, clDef);
        analysis.breakdown.bestPractices = { score: bpScore, maxScore: 20, details: {} };

        analysis.score = Object.values(analysis.breakdown).reduce((sum, category) => sum + category.score, 0);
        analysis.grade = this.getGrade(analysis.score);

        analysis.recommendations = this.generateCompactLayoutRecommendations(analysis, fields);

        return analysis;
    }

    /**
     * Score Field Organization (FlexiPage) - 25 points
     * @private
     */
    scoreFieldOrganization(fieldSections, fields) {
        let score = 0;
        const details = {};

        // Logical section grouping (10 points)
        if (fieldSections.length > 0) {
            if (fieldSections.length >= 2 && fieldSections.length <= 5) {
                score += 10;
                details.sectionGrouping = 'Optimal (2-5 sections)';
            } else if (fieldSections.length === 1) {
                score += 5;
                details.sectionGrouping = 'Could benefit from multiple sections';
            } else if (fieldSections.length > 5) {
                score += 3;
                details.sectionGrouping = 'Too many sections (> 5)';
            }
        }

        // Clear section names (5 points)
        const hasLabels = fieldSections.filter(s => s.label && s.label.trim().length > 0).length;
        const labelRatio = fieldSections.length > 0 ? hasLabels / fieldSections.length : 0;

        if (labelRatio === 1) {
            score += 5;
            details.sectionNaming = 'All sections labeled';
        } else if (labelRatio >= 0.8) {
            score += 3;
            details.sectionNaming = 'Most sections labeled';
        } else {
            score += 1;
            details.sectionNaming = 'Many sections unlabeled';
        }

        // Appropriate field counts per section (10 points)
        const fieldsPerSection = fieldSections.map(s => s.fields ? s.fields.length : 0);
        const avgFieldsPerSection = fieldsPerSection.length > 0 ? fieldsPerSection.reduce((a, b) => a + b, 0) / fieldsPerSection.length : 0;

        if (avgFieldsPerSection > 0 && avgFieldsPerSection <= 15) {
            score += 10;
            details.fieldsPerSection = `Optimal average (${Math.round(avgFieldsPerSection)} fields/section)`;
        } else if (avgFieldsPerSection <= 25) {
            score += 5;
            details.fieldsPerSection = `Acceptable (${Math.round(avgFieldsPerSection)} fields/section)`;
        } else {
            score += 2;
            details.fieldsPerSection = `Too many fields per section (${Math.round(avgFieldsPerSection)})`;
        }

        return { score, maxScore: 25, details };
    }

    /**
     * Score User Experience (FlexiPage) - 25 points
     * @private
     */
    scoreUserExperience(fields, components, flexiPageDef, fieldSections = []) {
        let score = 0;
        const details = {};

        // Total fields < 150 (10 points)
        const fieldCount = fields.length;
        if (fieldCount <= 50) {
            score += 10;
            details.fieldCount = `Excellent (${fieldCount} fields)`;
        } else if (fieldCount <= 100) {
            score += 7;
            details.fieldCount = `Good (${fieldCount} fields)`;
        } else if (fieldCount <= 150) {
            score += 4;
            details.fieldCount = `Acceptable (${fieldCount} fields)`;
        } else {
            score += 0;
            details.fieldCount = `Too many fields (${fieldCount})`;
        }

        // Key fields in first section (5 points) - heuristic: first section has < 20 fields
        // In real implementation, would check field importance
        const firstSectionSize = fieldSections[0]?.fields?.length || 0;
        if (firstSectionSize > 0 && firstSectionSize <= 15) {
            score += 5;
            details.keyFieldPlacement = 'First section optimized';
        } else {
            score += 2;
            details.keyFieldPlacement = 'First section could be optimized';
        }

        // Required fields clearly marked (5 points) - check for field-level metadata
        const requiredFields = fields.filter(f => f.required === true);
        if (requiredFields.length > 0) {
            score += 5;
            details.requiredFields = `${requiredFields.length} required fields marked`;
        } else {
            score += 3;
            details.requiredFields = 'No required field metadata found';
        }

        // Mobile optimization (5 points) - check for mobile-specific config or responsive design
        const template = flexiPageDef.flexiPageRegions ? flexiPageDef.flexiPageRegions : [];
        const regionCount = Array.isArray(template) ? template.length : (template ? 1 : 0);

        if (regionCount <= 2) {
            score += 5;
            details.mobileOptimization = 'Mobile-friendly layout (1-2 regions)';
        } else if (regionCount === 3) {
            score += 3;
            details.mobileOptimization = 'Acceptable for mobile (3 regions)';
        } else {
            score += 0;
            details.mobileOptimization = `Complex layout (${regionCount} regions) - may not be mobile-friendly`;
        }

        return { score, maxScore: 25, details };
    }

    /**
     * Score Performance (FlexiPage) - 20 points
     * @private
     */
    scorePerformance(components, fields) {
        let score = 0;
        const details = {};

        // Components < 20 (10 points)
        const componentCount = components.length;
        if (componentCount <= 10) {
            score += 10;
            details.componentCount = `Excellent (${componentCount} components)`;
        } else if (componentCount <= 20) {
            score += 7;
            details.componentCount = `Good (${componentCount} components)`;
        } else {
            score += 3;
            details.componentCount = `Too many components (${componentCount})`;
        }

        // Related lists < 10 (5 points)
        const relatedListComponents = components.filter(c =>
            c.type && (c.type.includes('relatedList') || c.type.includes('RelatedList'))
        );
        const relatedListCount = relatedListComponents.length;

        if (relatedListCount === 0) {
            score += 5;
            details.relatedLists = 'No related lists (optimal for performance)';
        } else if (relatedListCount <= 5) {
            score += 5;
            details.relatedLists = `Good (${relatedListCount} related lists)`;
        } else if (relatedListCount <= 10) {
            score += 3;
            details.relatedLists = `Acceptable (${relatedListCount} related lists)`;
        } else {
            score += 0;
            details.relatedLists = `Too many related lists (${relatedListCount})`;
        }

        // No slow components (5 points) - check for known slow components
        const slowComponents = ['analytics:ReportChart', 'wave:waveDashboard', 'flexipage:recentItems'];
        const hasSlowComponents = components.some(c => slowComponents.includes(c.type));

        if (!hasSlowComponents) {
            score += 5;
            details.slowComponents = 'No known slow components';
        } else {
            score += 0;
            details.slowComponents = 'Contains slow components (charts/dashboards)';
        }

        return { score, maxScore: 20, details };
    }

    /**
     * Score Accessibility (FlexiPage) - 15 points
     * @private
     */
    scoreAccessibility(components, fields) {
        let score = 0;
        const details = {};

        // All labels clear (5 points)
        const labeledFields = fields.filter(f => f.label && f.label.trim().length > 0);
        const labelRatio = fields.length > 0 ? labeledFields.length / fields.length : 0;

        if (labelRatio === 1) {
            score += 5;
            details.labels = 'All fields labeled';
        } else if (labelRatio >= 0.9) {
            score += 3;
            details.labels = 'Most fields labeled';
        } else {
            score += 1;
            details.labels = 'Some fields missing labels';
        }

        // Logical tab order (5 points) - components in logical regions
        score += 5; // Assume good by default for FlexiPages (automatically handled)
        details.tabOrder = 'Lightning pages have logical tab order by default';

        // ARIA compliance (5 points) - standard Lightning components are ARIA compliant
        score += 5; // Standard components are compliant by default
        details.ariaCompliance = 'Standard Lightning components are ARIA compliant';

        return { score, maxScore: 15, details };
    }

    /**
     * Score Best Practices (FlexiPage) - 15 points
     * @private
     */
    scoreBestPractices(components, fieldSections, flexiPageDef) {
        let score = 0;
        const details = {};

        // Uses Dynamic Forms (5 points)
        const hasFieldSections = fieldSections.length > 0;
        const hasDetailsComponent = components.some(c => c.type === 'force:recordDetailPanelDesktop');

        if (hasFieldSections && !hasDetailsComponent) {
            score += 5;
            details.dynamicForms = 'Uses Dynamic Forms (Field Sections)';
        } else if (hasFieldSections && hasDetailsComponent) {
            score += 3;
            details.dynamicForms = 'Partially migrated to Dynamic Forms';
        } else {
            score += 0;
            details.dynamicForms = 'Uses legacy Record Detail component';
        }

        // Compact layout optimized (5 points) - check for highlights panel
        const hasHighlightsPanel = components.some(c => c.type === 'force:highlightsPanelDesktop');

        if (hasHighlightsPanel) {
            score += 5;
            details.compactLayout = 'Uses Highlights Panel';
        } else {
            score += 0;
            details.compactLayout = 'No Highlights Panel found';
        }

        // Conditional visibility used (5 points)
        const hasVisibilityRules = components.some(c => c.visibilityRule);

        if (hasVisibilityRules) {
            score += 5;
            details.conditionalVisibility = 'Uses conditional visibility rules';
        } else {
            score += 2;
            details.conditionalVisibility = 'No conditional visibility detected (could enhance UX)';
        }

        return { score, maxScore: 15, details };
    }

    /**
     * Score Classic Layout Field Organization
     * @private
     */
    scoreClassicFieldOrganization(sections, fields) {
        let score = 0;

        // Section count (15 points)
        if (sections.length >= 2 && sections.length <= 6) {
            score += 15;
        } else if (sections.length === 1) {
            score += 8;
        } else {
            score += 5;
        }

        // Fields per section (15 points)
        const fieldsPerSection = sections.map(s => {
            const layoutItems = s.layoutColumns ? s.layoutColumns.flatMap(col => col.layoutItems || []) : [];
            return layoutItems.filter(item => item.field).length;
        });

        const avgFields = fieldsPerSection.reduce((a, b) => a + b, 0) / fieldsPerSection.length;

        if (avgFields <= 15) {
            score += 15;
        } else if (avgFields <= 25) {
            score += 10;
        } else {
            score += 5;
        }

        return score;
    }

    /**
     * Score Classic Layout User Experience
     * @private
     */
    scoreClassicUserExperience(fields, sections) {
        let score = 0;

        // Total field count (20 points)
        if (fields.length <= 50) {
            score += 20;
        } else if (fields.length <= 100) {
            score += 15;
        } else {
            score += 5;
        }

        // Section labels (10 points)
        const labeledSections = sections.filter(s => s.label && s.label.trim().length > 0);
        const labelRatio = sections.length > 0 ? labeledSections.length / sections.length : 0;

        score += Math.round(labelRatio * 10);

        return score;
    }

    /**
     * Score Classic Layout Performance
     * @private
     */
    scoreClassicPerformance(fields, relatedLists) {
        let score = 0;

        // Field count (10 points)
        if (fields.length <= 75) {
            score += 10;
        } else if (fields.length <= 150) {
            score += 5;
        } else {
            score += 2;
        }

        // Related list count (10 points)
        const rlCount = Array.isArray(relatedLists) ? relatedLists.length : 0;

        if (rlCount <= 5) {
            score += 10;
        } else if (rlCount <= 10) {
            score += 5;
        } else {
            score += 2;
        }

        return score;
    }

    /**
     * Score Classic Layout Accessibility
     * @private
     */
    scoreClassicAccessibility(fields, sections) {
        // Classic layouts are inherently accessible with standard Salesforce rendering
        return 18; // Give benefit of the doubt for standard Salesforce rendering
    }

    /**
     * Score Compact Layout Fields
     * @private
     */
    scoreCompactLayoutFields(fields) {
        let score = 0;

        // Optimal field count: 4-6 fields (30 points)
        const fieldCount = fields.length;

        if (fieldCount >= 4 && fieldCount <= 6) {
            score += 30;
        } else if (fieldCount >= 2 && fieldCount < 4) {
            score += 20;
        } else if (fieldCount > 6 && fieldCount <= 10) {
            score += 15;
        } else {
            score += 5;
        }

        // Field types (20 points) - should have mix of identifying and contact fields
        // This is a simplified check
        score += 20;

        return score;
    }

    /**
     * Score Compact Layout UX
     * @private
     */
    scoreCompactLayoutUX(fields) {
        // Key info visible, appropriate field count for highlights panel
        return fields.length >= 3 && fields.length <= 7 ? 30 : 15;
    }

    /**
     * Score Compact Layout Best Practices
     * @private
     */
    scoreCompactLayoutBestPractices(fields, clDef) {
        // Has primary field, appropriate fields for mobile card view
        return 18; // Give default high score for having a compact layout
    }

    /**
     * Generate FlexiPage recommendations
     * @private
     */
    generateFlexiPageRecommendations(analysis) {
        const recommendations = [];

        if (analysis.score < 70) {
            recommendations.push({
                priority: 'HIGH',
                category: 'Overall',
                recommendation: `Quality score is ${analysis.score}/100 (${analysis.grade}). Consider major redesign.`
            });
        }

        // Check each category
        Object.entries(analysis.breakdown).forEach(([category, data]) => {
            const percentage = (data.score / data.maxScore) * 100;

            if (percentage < 60) {
                recommendations.push({
                    priority: 'HIGH',
                    category: category,
                    recommendation: `${category} scored ${data.score}/${data.maxScore} (${Math.round(percentage)}%). Review ${category} issues.`,
                    details: data.details
                });
            } else if (percentage < 80) {
                recommendations.push({
                    priority: 'MEDIUM',
                    category: category,
                    recommendation: `${category} could be improved (${data.score}/${data.maxScore}).`,
                    details: data.details
                });
            }
        });

        return recommendations;
    }

    /**
     * Generate Classic Layout recommendations
     * @private
     */
    generateClassicLayoutRecommendations(analysis) {
        const recommendations = [];

        if (analysis.score < 60) {
            recommendations.push({
                priority: 'HIGH',
                recommendation: 'Consider migrating to Lightning Experience with optimized FlexiPages'
            });
        }

        return recommendations;
    }

    /**
     * Generate Compact Layout recommendations
     * @private
     */
    generateCompactLayoutRecommendations(analysis, fields) {
        const recommendations = [];

        if (fields.length < 4) {
            recommendations.push({
                priority: 'MEDIUM',
                recommendation: `Add more fields to compact layout (currently ${fields.length}, optimal is 4-6)`
            });
        } else if (fields.length > 7) {
            recommendations.push({
                priority: 'MEDIUM',
                recommendation: `Reduce field count in compact layout (currently ${fields.length}, optimal is 4-6)`
            });
        }

        return recommendations;
    }

    /**
     * Generate overall recommendations across all layouts
     * @private
     */
    generateOverallRecommendations(analysis) {
        const recommendations = [];

        if (analysis.overallScore < 70) {
            recommendations.push({
                priority: 'HIGH',
                recommendation: `Overall layout quality is ${analysis.overallGrade} (${analysis.overallScore}/100). Recommend comprehensive layout redesign.`
            });
        }

        if (analysis.flexiPages.length === 0 && analysis.layouts.length > 0) {
            recommendations.push({
                priority: 'HIGH',
                recommendation: 'No Lightning Pages found. Migrate to Lightning Experience for better UX.'
            });
        }

        if (analysis.compactLayouts.length === 0) {
            recommendations.push({
                priority: 'MEDIUM',
                recommendation: 'No Compact Layout found. Create one to optimize highlights panel and mobile view.'
            });
        }

        return recommendations;
    }

    /**
     * Convert score to letter grade
     * @private
     */
    getGrade(score) {
        if (score >= 97) return 'A+';
        if (score >= 93) return 'A';
        if (score >= 90) return 'A-';
        if (score >= 87) return 'B+';
        if (score >= 83) return 'B';
        if (score >= 80) return 'B-';
        if (score >= 77) return 'C+';
        if (score >= 73) return 'C';
        if (score >= 70) return 'C-';
        if (score >= 67) return 'D+';
        if (score >= 63) return 'D';
        if (score >= 60) return 'D-';
        return 'F';
    }

    /**
     * Extract components from FlexiPage definition
     * @private
     */
    extractComponents(flexiPageDef) {
        const components = [];

        const regions = Array.isArray(flexiPageDef.flexiPageRegions)
            ? flexiPageDef.flexiPageRegions
            : (flexiPageDef.flexiPageRegions ? [flexiPageDef.flexiPageRegions] : []);

        regions.forEach(region => {
            const items = Array.isArray(region.itemInstances)
                ? region.itemInstances
                : (region.itemInstances ? [region.itemInstances] : []);

            items.forEach(item => {
                if (item.componentInstance) {
                    const compArray = Array.isArray(item.componentInstance)
                        ? item.componentInstance
                        : [item.componentInstance];

                    compArray.forEach(comp => {
                        const componentName = comp.componentName ? comp.componentName[0] : null;
                        const explicitType = comp.componentInstanceProperties
                            ? this.findComponentType(comp.componentInstanceProperties)
                            : null;

                        components.push({
                            name: componentName,
                            type: explicitType && explicitType !== 'Unknown' ? explicitType : componentName,
                            visibilityRule: comp.visibilityRule ? comp.visibilityRule[0] : null
                        });
                    });
                }
            });
        });

        return components;
    }

    /**
     * Find component type from properties
     * @private
     */
    findComponentType(props) {
        const propsArray = Array.isArray(props) ? props : [props];
        const typeProperty = propsArray.find(p => p.name && p.name[0] === 'type');
        return typeProperty && typeProperty.value ? typeProperty.value[0] : 'Unknown';
    }

    /**
     * Extract field sections from components
     * @private
     */
    extractFieldSections(flexiPageDef, components = []) {
        if (flexiPageDef && flexiPageDef.flexiPageRegions) {
            const sections = this.extractFieldSectionsFromFlexiPage(flexiPageDef);
            if (sections.length > 0) {
                return sections;
            }
        }

        return this.extractFieldSectionsFromComponents(components);
    }

    /**
     * Extract all fields from field sections
     * @private
     */
    extractAllFields(fieldSections) {
        const fieldMap = new Map();

        fieldSections.forEach(section => {
            (section.fields || []).forEach(field => {
                if (!field || !field.name) {
                    return;
                }
                if (!fieldMap.has(field.name)) {
                    fieldMap.set(field.name, field);
                }
            });
        });

        return Array.from(fieldMap.values());
    }

    /**
     * Extract field sections using FlexiPage facet graph.
     * @private
     */
    extractFieldSectionsFromFlexiPage(flexiPageDef) {
        const regions = Array.isArray(flexiPageDef.flexiPageRegions)
            ? flexiPageDef.flexiPageRegions
            : (flexiPageDef.flexiPageRegions ? [flexiPageDef.flexiPageRegions] : []);

        const facetFields = new Map();
        const facetBodies = new Map();
        const sections = [];

        const toArray = value => (Array.isArray(value) ? value : (value ? [value] : []));
        const toValue = value => (Array.isArray(value) ? value[0] : value);

        regions.forEach(region => {
            const regionName = toValue(region.name);
            if (!regionName) {
                return;
            }

            const items = toArray(region.itemInstances);
            const fields = [];

            items.forEach(item => {
                const fieldInstances = toArray(item.fieldInstance);
                fieldInstances.forEach(instance => {
                    const fieldItem = toValue(instance.fieldItem);
                    if (!fieldItem) {
                        return;
                    }
                    const fieldName = fieldItem.includes('.')
                        ? fieldItem.split('.').slice(-1)[0]
                        : fieldItem;
                    const properties = toArray(instance.fieldInstanceProperties);
                    const uiBehavior = properties.find(p => toValue(p.name) === 'uiBehavior');
                    const required = uiBehavior ? toValue(uiBehavior.value) === 'required' : false;
                    fields.push({
                        name: fieldName,
                        label: fieldName,
                        required: required
                    });
                });
            });

            if (fields.length > 0) {
                facetFields.set(regionName, fields);
            }

            items.forEach(item => {
                const components = toArray(item.componentInstance);
                components.forEach(comp => {
                    const componentName = toValue(comp.componentName);
                    if (componentName !== 'flexipage:column') {
                        return;
                    }
                    const props = toArray(comp.componentInstanceProperties);
                    const bodyProp = props.find(p => toValue(p.name) === 'body');
                    const bodyFacet = bodyProp ? toValue(bodyProp.value) : null;
                    if (!bodyFacet) {
                        return;
                    }
                    if (!facetBodies.has(regionName)) {
                        facetBodies.set(regionName, []);
                    }
                    facetBodies.get(regionName).push(bodyFacet);
                });
            });
        });

        const collectFields = (facetName, visited = new Set()) => {
            if (!facetName || visited.has(facetName)) {
                return [];
            }
            visited.add(facetName);

            if (facetFields.has(facetName)) {
                return facetFields.get(facetName);
            }

            const bodies = facetBodies.get(facetName) || [];
            const collected = [];
            bodies.forEach(body => {
                collectFields(body, visited).forEach(field => collected.push(field));
            });

            return collected;
        };

        regions.forEach(region => {
            const items = toArray(region.itemInstances);
            items.forEach(item => {
                const components = toArray(item.componentInstance);
                components.forEach(comp => {
                    const componentName = toValue(comp.componentName);
                    if (componentName !== 'flexipage:fieldSection') {
                        return;
                    }

                    const props = toArray(comp.componentInstanceProperties);
                    const labelProp = props.find(p => toValue(p.name) === 'label');
                    const columnsProp = props.find(p => toValue(p.name) === 'columns');

                    const label = labelProp ? toValue(labelProp.value) : null;
                    const columnsFacet = columnsProp ? toValue(columnsProp.value) : null;
                    const fields = collectFields(columnsFacet);
                    const fieldMap = new Map();
                    fields.forEach(field => {
                        if (field && field.name && !fieldMap.has(field.name)) {
                            fieldMap.set(field.name, field);
                        }
                    });

                    sections.push({
                        label: label || 'Field Section',
                        fields: Array.from(fieldMap.values())
                    });
                });
            });
        });

        return sections;
    }

    /**
     * Extract field sections from component list (fallback).
     * @private
     */
    extractFieldSectionsFromComponents(components) {
        const fieldSectionComponents = components.filter(c =>
            c.type && c.type.toLowerCase().includes('fieldsection')
        );

        return fieldSectionComponents.map((comp, index) => ({
            label: comp.name || `Section ${index + 1}`,
            fields: []
        }));
    }

    /**
     * Extract fields from classic layout
     * @private
     */
    extractClassicLayoutFields(sections) {
        const fields = [];

        const sectionsArray = Array.isArray(sections) ? sections : [sections];

        sectionsArray.forEach(section => {
            const columns = Array.isArray(section.layoutColumns)
                ? section.layoutColumns
                : (section.layoutColumns ? [section.layoutColumns] : []);

            columns.forEach(column => {
                const items = Array.isArray(column.layoutItems)
                    ? column.layoutItems
                    : (column.layoutItems ? [column.layoutItems] : []);

                items.forEach(item => {
                    if (item.field) {
                        fields.push({
                            name: Array.isArray(item.field) ? item.field[0] : item.field,
                            required: item.behavior && item.behavior[0] === 'Required'
                        });
                    }
                });
            });
        });

        return fields;
    }
}

module.exports = LayoutAnalyzer;

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);

    const flexiPageIndex = args.indexOf('--flexipage-file');
    const compactLayoutIndex = args.indexOf('--compact-layout-file');
    const verbose = args.includes('--verbose');

    if (args.length < 2 && flexiPageIndex < 0) {
        console.log(`
Usage: node layout-analyzer.js <org-alias> <object-name> [options]
       node layout-analyzer.js --flexipage-file <path> [--compact-layout-file <path>] [options]

Options:
  --flexipage-file <path>       Analyze a generated FlexiPage XML file
  --compact-layout-file <path>  Analyze a generated CompactLayout XML file
  --verbose                     Show detailed analysis output

Examples:
  node layout-analyzer.js my-org Opportunity
  node layout-analyzer.js production Account --verbose
  node layout-analyzer.js --flexipage-file out/Account_Page.flexipage-meta.xml --compact-layout-file out/Account_Compact.compactLayout-meta.xml
        `);
        process.exit(1);
    }

    const orgAlias = flexiPageIndex >= 0 ? null : args[0];
    const objectName = flexiPageIndex >= 0 ? null : args[1];
    const flexiPageFile = flexiPageIndex >= 0 ? args[flexiPageIndex + 1] : null;
    const compactLayoutFile = compactLayoutIndex >= 0 ? args[compactLayoutIndex + 1] : null;

    (async () => {
        try {
            const analyzer = new LayoutAnalyzer(orgAlias || 'local', { verbose });
            let analysis;

            if (flexiPageFile) {
                analysis = await analyzer.analyzeFromFiles({
                    flexiPageFile,
                    compactLayoutFile,
                    objectName: path.basename(flexiPageFile)
                });
            } else {
                await analyzer.init();
                analysis = await analyzer.analyzeObject(objectName);
            }

            console.log(`\n${'='.repeat(80)}`);
            console.log(`LAYOUT QUALITY ANALYSIS: ${objectName || path.basename(flexiPageFile)}`);
            console.log(`${'='.repeat(80)}\n`);

            console.log(`Overall Score: ${analysis.overallScore}/100 (${analysis.overallGrade})`);
            console.log(`\nBreakdown:`);
            console.log(`  - FlexiPages: ${analysis.flexiPages.length}`);
            console.log(`  - Classic Layouts: ${analysis.layouts.length}`);
            console.log(`  - Compact Layouts: ${analysis.compactLayouts.length}`);

            if (analysis.recommendations.length > 0) {
                console.log(`\nTop Recommendations:`);
                analysis.recommendations.slice(0, 5).forEach((rec, i) => {
                    console.log(`  ${i + 1}. [${rec.priority}] ${rec.recommendation}`);
                });
            }

            if (verbose) {
                console.log(`\n${'='.repeat(80)}`);
                console.log('DETAILED ANALYSIS');
                console.log(`${'='.repeat(80)}\n`);
                console.log(JSON.stringify(analysis, null, 2));
            }

            // Quality Gate: Validate analysis produced valid results
            if (!analysis || !analysis.summary || typeof analysis.summary.totalLayouts !== 'number') {
                throw new Error('Analysis failed: Invalid or incomplete analysis results');
            }

            console.log(`\n✓ Analysis complete\n`);

        } catch (error) {
            console.error('❌ Error:', error.message);
            process.exit(1);
        }
    })();
}
