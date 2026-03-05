/**
 * Self-Correction Protocol Tests
 *
 * Tests the 3-step self-correction protocol for assessment agents:
 * 1. Generate Initial Assessment
 * 2. Self-Review (Grade A-F)
 * 3. Refine Based on Review
 */

const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const fs = require('fs');
const path = require('path');

// Load schema
const schemaPath = path.join(__dirname, '../../../config/assessment-output.schema.json');
const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

// Initialize AJV validator
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

describe('Self-Correction Protocol', () => {

  describe('Step 1: Initial Assessment Validation', () => {

    test('valid assessment passes schema validation', () => {
      const validAssessment = {
        assessment_type: 'revops_audit',
        version: '2.0',
        generated_at: '2025-12-26T10:30:00Z',
        executive_summary: {
          bottom_line: 'Pipeline velocity is 23% below target due to stalled Stage 3 opportunities.',
          health_score: 62,
          critical_issues: [
            '47 opportunities stuck in Negotiation >30 days',
            'Win rate declined 8% QoQ'
          ]
        },
        metrics: [
          {
            name: 'Pipeline Velocity',
            value: '$847,500/month',
            source_id: 'sf_query_001',
            benchmark: {
              value: '$1.1M/month',
              source: 'Bridge Group 2024',
              gap: '-23%'
            },
            reasoning: 'Total pipeline ($4.2M) / Avg cycle (149 days) = $28,188/day = $847K/month'
          }
        ],
        findings: [
          {
            title: 'Stalled Negotiation Opportunities',
            severity: 'high',
            description: '47 opportunities have been in Negotiation stage for >30 days.',
            source_ids: ['sf_query_003', 'sf_query_004']
          }
        ],
        recommendations: [
          {
            title: 'Implement Negotiation Stage Time Alerts',
            priority: 'immediate',
            rationale: 'Automated alerts when opportunities exceed 14 days will enable proactive intervention.',
            related_findings: ['Stalled Negotiation Opportunities']
          }
        ]
      };

      const isValid = validate(validAssessment);
      expect(isValid).toBe(true);
      if (!isValid) console.log('Validation errors:', validate.errors);
    });

    test('assessment without source_id fails validation', () => {
      const invalidAssessment = {
        executive_summary: {
          bottom_line: 'Test summary',
          health_score: 50,
          critical_issues: ['Issue 1']
        },
        metrics: [
          {
            name: 'Win Rate',
            value: '22%'
            // Missing source_id - should fail
          }
        ],
        findings: [
          {
            title: 'Test Finding',
            severity: 'high',
            description: 'Test description',
            source_ids: ['sf_query_001']
          }
        ],
        recommendations: [
          {
            title: 'Test Recommendation',
            priority: 'immediate',
            rationale: 'Test rationale'
          }
        ]
      };

      const isValid = validate(invalidAssessment);
      expect(isValid).toBe(false);
      expect(validate.errors.some(e => e.message.includes('source_id'))).toBe(true);
    });

    test('invalid source_id pattern fails validation', () => {
      const invalidPattern = {
        executive_summary: {
          bottom_line: 'Test',
          health_score: 50,
          critical_issues: []
        },
        metrics: [
          {
            name: 'Win Rate',
            value: '22%',
            source_id: 'invalid-pattern' // Should be like sf_query_001
          }
        ],
        findings: [],
        recommendations: []
      };

      const isValid = validate(invalidPattern);
      expect(isValid).toBe(false);
      expect(validate.errors.some(e => e.keyword === 'pattern')).toBe(true);
    });

    test('invalid severity enum fails validation', () => {
      const invalidSeverity = {
        executive_summary: {
          bottom_line: 'Test',
          health_score: 50,
          critical_issues: []
        },
        metrics: [],
        findings: [
          {
            title: 'Test',
            severity: 'urgent', // Invalid - should be critical/high/medium/low
            description: 'Test',
            source_ids: []
          }
        ],
        recommendations: []
      };

      const isValid = validate(invalidSeverity);
      expect(isValid).toBe(false);
    });

    test('invalid priority enum fails validation', () => {
      const invalidPriority = {
        executive_summary: {
          bottom_line: 'Test',
          health_score: 50,
          critical_issues: []
        },
        metrics: [],
        findings: [],
        recommendations: [
          {
            title: 'Test',
            priority: 'urgent', // Invalid - should be immediate/short-term/long-term
            rationale: 'Test'
          }
        ]
      };

      const isValid = validate(invalidPriority);
      expect(isValid).toBe(false);
    });

    test('health_score out of range fails validation', () => {
      const invalidScore = {
        executive_summary: {
          bottom_line: 'Test',
          health_score: 150, // Invalid - max is 100
          critical_issues: []
        },
        metrics: [],
        findings: [],
        recommendations: []
      };

      const isValid = validate(invalidScore);
      expect(isValid).toBe(false);
    });
  });

  describe('Step 2: Self-Review Grading', () => {

    /**
     * Simulates the self-review grading logic
     */
    function selfReviewAssessment(assessment) {
      const review = {
        accuracy_grade: 'A',
        clarity_grade: 'A',
        completeness_grade: 'A',
        citation_coverage_grade: 'A',
        issues: []
      };

      // Check accuracy: Do all metrics have reasoning?
      const metricsWithoutReasoning = assessment.metrics.filter(m => !m.reasoning);
      if (metricsWithoutReasoning.length > 0) {
        review.accuracy_grade = metricsWithoutReasoning.length > 2 ? 'C' : 'B';
        review.issues.push(`${metricsWithoutReasoning.length} metrics missing reasoning`);
      }

      // Check clarity: Is bottom_line under 200 chars and actionable?
      if (!assessment.executive_summary.bottom_line ||
          assessment.executive_summary.bottom_line.length > 200) {
        review.clarity_grade = 'B-';
        review.issues.push('Bottom line exceeds 200 characters or missing');
      }

      // Check completeness: Are all required sections present with content?
      if (assessment.metrics.length === 0) {
        review.completeness_grade = 'D';
        review.issues.push('No metrics provided');
      } else if (assessment.metrics.length < 3) {
        review.completeness_grade = 'B';
        review.issues.push('Fewer than 3 metrics - assessment may be incomplete');
      }

      if (assessment.findings.length === 0) {
        review.completeness_grade = 'D';
        review.issues.push('No findings provided');
      }

      if (assessment.recommendations.length === 0) {
        review.completeness_grade = 'D';
        review.issues.push('No recommendations provided');
      }

      // Check citation coverage: Do findings link back to metrics?
      const totalSourceIds = assessment.findings.reduce(
        (acc, f) => acc + (f.source_ids?.length || 0), 0
      );
      if (assessment.findings.length > 0 && totalSourceIds === 0) {
        review.citation_coverage_grade = 'F';
        review.issues.push('Findings have no source citations');
      } else if (totalSourceIds < assessment.findings.length) {
        review.citation_coverage_grade = 'B';
        review.issues.push('Some findings missing source citations');
      }

      // Do recommendations link to findings?
      const recsWithFindings = assessment.recommendations.filter(
        r => r.related_findings && r.related_findings.length > 0
      );
      if (assessment.recommendations.length > 0 && recsWithFindings.length === 0) {
        review.citation_coverage_grade = 'C';
        review.issues.push('Recommendations not linked to findings');
      }

      return review;
    }

    test('complete assessment gets A grades', () => {
      const completeAssessment = {
        executive_summary: {
          bottom_line: 'Pipeline velocity is 23% below target.',
          health_score: 62,
          critical_issues: ['Stalled opportunities', 'Declining win rate']
        },
        metrics: [
          { name: 'Pipeline Velocity', value: '$847K', source_id: 'sf_query_001', reasoning: 'Calculated from total/cycle' },
          { name: 'Win Rate', value: '22%', source_id: 'sf_query_002', reasoning: 'Won / Total Closed' },
          { name: 'Avg Deal Size', value: '$45K', source_id: 'sf_query_003', reasoning: 'Sum ACV / Count' }
        ],
        findings: [
          { title: 'Stalled Opps', severity: 'high', description: 'Test', source_ids: ['sf_query_001'] },
          { title: 'Low Win Rate', severity: 'medium', description: 'Test', source_ids: ['sf_query_002'] }
        ],
        recommendations: [
          { title: 'Add Alerts', priority: 'immediate', rationale: 'Proactive intervention', related_findings: ['Stalled Opps'] },
          { title: 'Win Rate Training', priority: 'short-term', rationale: 'Improve conversion', related_findings: ['Low Win Rate'] }
        ]
      };

      const review = selfReviewAssessment(completeAssessment);

      expect(review.accuracy_grade).toBe('A');
      expect(review.clarity_grade).toBe('A');
      expect(review.completeness_grade).toBe('A');
      expect(review.citation_coverage_grade).toBe('A');
      expect(review.issues).toHaveLength(0);
    });

    test('assessment without reasoning gets B grade', () => {
      const missingReasoning = {
        executive_summary: {
          bottom_line: 'Test summary under 200 chars.',
          health_score: 50,
          critical_issues: ['Issue 1']
        },
        metrics: [
          { name: 'Metric 1', value: '10%', source_id: 'sf_query_001' }, // No reasoning
          { name: 'Metric 2', value: '20%', source_id: 'sf_query_002', reasoning: 'Has reasoning' },
          { name: 'Metric 3', value: '30%', source_id: 'sf_query_003' }  // No reasoning
        ],
        findings: [
          { title: 'Finding', severity: 'high', description: 'Test', source_ids: ['sf_query_001'] }
        ],
        recommendations: [
          { title: 'Rec', priority: 'immediate', rationale: 'Test', related_findings: ['Finding'] }
        ]
      };

      const review = selfReviewAssessment(missingReasoning);

      expect(review.accuracy_grade).toBe('B');
      expect(review.issues).toContain('2 metrics missing reasoning');
    });

    test('assessment without source citations gets F grade', () => {
      const noSourceCitations = {
        executive_summary: {
          bottom_line: 'Test summary.',
          health_score: 50,
          critical_issues: []
        },
        metrics: [
          { name: 'Metric 1', value: '10%', source_id: 'sf_query_001', reasoning: 'Test' },
          { name: 'Metric 2', value: '20%', source_id: 'sf_query_002', reasoning: 'Test' },
          { name: 'Metric 3', value: '30%', source_id: 'sf_query_003', reasoning: 'Test' }
        ],
        findings: [
          { title: 'Finding 1', severity: 'high', description: 'Test', source_ids: [] }, // Empty!
          { title: 'Finding 2', severity: 'medium', description: 'Test', source_ids: [] }
        ],
        recommendations: [
          { title: 'Rec', priority: 'immediate', rationale: 'Test', related_findings: ['Finding 1'] }
        ]
      };

      const review = selfReviewAssessment(noSourceCitations);

      expect(review.citation_coverage_grade).toBe('F');
      expect(review.issues).toContain('Findings have no source citations');
    });

    test('empty assessment gets D grades', () => {
      const emptyAssessment = {
        executive_summary: {
          bottom_line: 'Test',
          health_score: 50,
          critical_issues: []
        },
        metrics: [],
        findings: [],
        recommendations: []
      };

      const review = selfReviewAssessment(emptyAssessment);

      expect(review.completeness_grade).toBe('D');
      expect(review.issues).toContain('No metrics provided');
    });
  });

  describe('Step 3: Refinement Logic', () => {

    /**
     * Determines if refinement is needed based on review grades
     */
    function needsRefinement(review) {
      const passingGrades = ['A', 'A-', 'B+'];
      const grades = [
        review.accuracy_grade,
        review.clarity_grade,
        review.completeness_grade,
        review.citation_coverage_grade
      ];

      return grades.some(g => !passingGrades.includes(g));
    }

    /**
     * Simulates refinement of an assessment based on review feedback
     */
    function refineAssessment(assessment, review) {
      const refined = JSON.parse(JSON.stringify(assessment)); // Deep clone
      const refinementsMade = [];

      // Add missing reasoning to metrics
      if (review.issues.some(i => i.includes('missing reasoning'))) {
        refined.metrics.forEach(m => {
          if (!m.reasoning) {
            m.reasoning = `Calculated from ${m.source_id} data`;
            refinementsMade.push(`Added reasoning to metric: ${m.name}`);
          }
        });
      }

      // Add source citations to findings
      if (review.issues.some(i => i.includes('source citations'))) {
        refined.findings.forEach((f, idx) => {
          if (!f.source_ids || f.source_ids.length === 0) {
            f.source_ids = [`sf_query_${String(idx + 1).padStart(3, '0')}`];
            refinementsMade.push(`Added source citation to finding: ${f.title}`);
          }
        });
      }

      // Link recommendations to findings
      if (review.issues.some(i => i.includes('not linked to findings'))) {
        const findingTitles = refined.findings.map(f => f.title);
        refined.recommendations.forEach(r => {
          if (!r.related_findings || r.related_findings.length === 0) {
            r.related_findings = findingTitles.length > 0 ? [findingTitles[0]] : [];
            refinementsMade.push(`Linked recommendation to finding: ${r.title}`);
          }
        });
      }

      refined.self_review = {
        accuracy_grade: review.accuracy_grade,
        clarity_grade: review.clarity_grade,
        completeness_grade: review.completeness_grade,
        citation_coverage_grade: review.citation_coverage_grade,
        refinements_made: refinementsMade
      };

      return refined;
    }

    test('B grade triggers refinement', () => {
      const review = {
        accuracy_grade: 'B',
        clarity_grade: 'A',
        completeness_grade: 'A',
        citation_coverage_grade: 'A',
        issues: ['2 metrics missing reasoning']
      };

      expect(needsRefinement(review)).toBe(true);
    });

    test('all A grades does not trigger refinement', () => {
      const review = {
        accuracy_grade: 'A',
        clarity_grade: 'A',
        completeness_grade: 'A',
        citation_coverage_grade: 'A',
        issues: []
      };

      expect(needsRefinement(review)).toBe(false);
    });

    test('B+ grade does not trigger refinement', () => {
      const review = {
        accuracy_grade: 'B+',
        clarity_grade: 'A-',
        completeness_grade: 'A',
        citation_coverage_grade: 'B+',
        issues: []
      };

      expect(needsRefinement(review)).toBe(false);
    });

    test('refinement adds missing reasoning', () => {
      const assessment = {
        executive_summary: { bottom_line: 'Test', health_score: 50, critical_issues: [] },
        metrics: [
          { name: 'Win Rate', value: '22%', source_id: 'sf_query_001' } // Missing reasoning
        ],
        findings: [{ title: 'F1', severity: 'high', description: 'Test', source_ids: ['sf_query_001'] }],
        recommendations: [{ title: 'R1', priority: 'immediate', rationale: 'Test', related_findings: ['F1'] }]
      };

      const review = {
        accuracy_grade: 'B',
        clarity_grade: 'A',
        completeness_grade: 'B',
        citation_coverage_grade: 'A',
        issues: ['1 metrics missing reasoning']
      };

      const refined = refineAssessment(assessment, review);

      expect(refined.metrics[0].reasoning).toBeDefined();
      expect(refined.self_review.refinements_made).toContain('Added reasoning to metric: Win Rate');
    });

    test('refinement adds source citations to findings', () => {
      const assessment = {
        executive_summary: { bottom_line: 'Test', health_score: 50, critical_issues: [] },
        metrics: [{ name: 'M1', value: '10%', source_id: 'sf_query_001', reasoning: 'Test' }],
        findings: [
          { title: 'Finding 1', severity: 'high', description: 'Test', source_ids: [] } // Empty
        ],
        recommendations: [{ title: 'R1', priority: 'immediate', rationale: 'Test', related_findings: ['Finding 1'] }]
      };

      const review = {
        accuracy_grade: 'A',
        clarity_grade: 'A',
        completeness_grade: 'B',
        citation_coverage_grade: 'F',
        issues: ['Findings have no source citations']
      };

      const refined = refineAssessment(assessment, review);

      expect(refined.findings[0].source_ids.length).toBeGreaterThan(0);
      expect(refined.self_review.refinements_made).toContain('Added source citation to finding: Finding 1');
    });

    test('refined assessment passes schema validation', () => {
      const assessment = {
        executive_summary: { bottom_line: 'Test summary', health_score: 50, critical_issues: ['Issue'] },
        metrics: [
          { name: 'Win Rate', value: '22%', source_id: 'sf_query_001' }
        ],
        findings: [
          { title: 'Low Win Rate', severity: 'high', description: 'Win rate below benchmark', source_ids: [] }
        ],
        recommendations: [
          { title: 'Training', priority: 'immediate', rationale: 'Improve skills' }
        ]
      };

      const review = {
        accuracy_grade: 'B',
        clarity_grade: 'A',
        completeness_grade: 'B',
        citation_coverage_grade: 'F',
        issues: ['1 metrics missing reasoning', 'Findings have no source citations', 'Recommendations not linked to findings']
      };

      const refined = refineAssessment(assessment, review);

      // Add required fields for full schema compliance
      refined.assessment_type = 'revops_audit';
      refined.version = '2.0';
      refined.generated_at = new Date().toISOString();

      const isValid = validate(refined);
      expect(isValid).toBe(true);
      if (!isValid) console.log('Validation errors:', validate.errors);
    });
  });

  describe('Full Protocol Integration', () => {

    test('complete 3-step protocol flow', () => {
      // Step 1: Generate Initial Assessment (simulated from agent)
      const initialAssessment = {
        assessment_type: 'revops_audit',
        version: '2.0',
        generated_at: '2025-12-26T10:30:00Z',
        executive_summary: {
          bottom_line: 'Pipeline health requires attention - 23% below velocity targets.',
          health_score: 62,
          critical_issues: [
            'Stalled opportunities in Negotiation stage',
            'Win rate declining quarter-over-quarter'
          ]
        },
        metrics: [
          {
            name: 'Pipeline Velocity',
            value: '$847,500/month',
            source_id: 'sf_query_001'
            // Missing reasoning - will be flagged
          },
          {
            name: 'Win Rate',
            value: '22%',
            source_id: 'sf_query_002',
            reasoning: 'Closed Won (44) / Total Closed (200) = 22%',
            benchmark: { value: '28%', source: 'Bridge Group 2024', gap: '-6%' }
          }
        ],
        findings: [
          {
            title: 'Stalled Negotiation Opportunities',
            severity: 'high',
            description: '47 opportunities stuck in Negotiation >30 days',
            source_ids: ['sf_query_003']
          },
          {
            title: 'Declining Win Rate',
            severity: 'medium',
            description: 'Win rate dropped from 30% to 22% over 2 quarters',
            source_ids: [] // Missing - will be flagged
          }
        ],
        recommendations: [
          {
            title: 'Implement Stage Duration Alerts',
            priority: 'immediate',
            rationale: 'Proactive alerts enable manager intervention before deals stall',
            related_findings: ['Stalled Negotiation Opportunities']
          },
          {
            title: 'Sales Methodology Training',
            priority: 'short-term',
            rationale: 'Targeted training on objection handling and negotiation'
            // Missing related_findings - will be flagged
          }
        ]
      };

      // Step 2: Self-Review
      function selfReview(assessment) {
        const grades = {
          accuracy_grade: 'A',
          clarity_grade: 'A',
          completeness_grade: 'A',
          citation_coverage_grade: 'A'
        };
        const issues = [];

        // Check metric reasoning
        const missingReasoning = assessment.metrics.filter(m => !m.reasoning);
        if (missingReasoning.length > 0) {
          grades.accuracy_grade = 'B';
          issues.push(`${missingReasoning.length} metric(s) missing reasoning`);
        }

        // Check finding citations
        const missingCitations = assessment.findings.filter(f => !f.source_ids || f.source_ids.length === 0);
        if (missingCitations.length > 0) {
          grades.citation_coverage_grade = missingCitations.length > 1 ? 'C' : 'B';
          issues.push(`${missingCitations.length} finding(s) missing source citations`);
        }

        // Check recommendation links
        const unlinkedRecs = assessment.recommendations.filter(r => !r.related_findings || r.related_findings.length === 0);
        if (unlinkedRecs.length > 0) {
          if (grades.citation_coverage_grade === 'A') grades.citation_coverage_grade = 'B';
          issues.push(`${unlinkedRecs.length} recommendation(s) not linked to findings`);
        }

        return { ...grades, issues };
      }

      const review = selfReview(initialAssessment);

      // Verify review catches issues
      expect(review.accuracy_grade).toBe('B');
      expect(review.citation_coverage_grade).toBe('B');
      expect(review.issues).toHaveLength(3);

      // Step 3: Refine
      function refine(assessment, review) {
        const refined = JSON.parse(JSON.stringify(assessment));
        const refinements = [];

        // Fix missing reasoning
        refined.metrics.forEach(m => {
          if (!m.reasoning) {
            m.reasoning = `Derived from ${m.source_id}: [calculation details to be added]`;
            refinements.push(`Added reasoning stub to: ${m.name}`);
          }
        });

        // Fix missing citations
        refined.findings.forEach((f, i) => {
          if (!f.source_ids || f.source_ids.length === 0) {
            f.source_ids = [`sf_query_${String(i + 10).padStart(3, '0')}`];
            refinements.push(`Added source citation to: ${f.title}`);
          }
        });

        // Fix unlinked recommendations
        const findingTitles = refined.findings.map(f => f.title);
        refined.recommendations.forEach(r => {
          if (!r.related_findings || r.related_findings.length === 0) {
            r.related_findings = [findingTitles[1] || findingTitles[0]]; // Link to relevant finding
            refinements.push(`Linked recommendation: ${r.title}`);
          }
        });

        refined.self_review = { ...review, refinements_made: refinements };
        return refined;
      }

      const refinedAssessment = refine(initialAssessment, review);

      // Verify refinements were made
      expect(refinedAssessment.metrics[0].reasoning).toBeDefined();
      expect(refinedAssessment.findings[1].source_ids.length).toBeGreaterThan(0);
      expect(refinedAssessment.recommendations[1].related_findings.length).toBeGreaterThan(0);
      expect(refinedAssessment.self_review.refinements_made.length).toBe(3);

      // Verify final output passes schema
      const isValid = validate(refinedAssessment);
      expect(isValid).toBe(true);
    });
  });
});
