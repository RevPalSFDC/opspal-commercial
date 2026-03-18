#!/usr/bin/env node

/**
 * Flow Change Strategy Engine
 *
 * Determines whether a requested change should update an existing Flow,
 * create a net-new Flow, or refactor with subflows. Uses weighted scoring
 * and risk-based enforcement.
 *
 * @module flow-change-strategy-engine
 * @version 1.0.0
 */

class FlowChangeStrategyEngine {
  constructor(options = {}) {
    this.weights = options.weights || {
      functionalOverlap: 20,
      blastRadius: 20,
      complexityImpact: 15,
      performanceRisk: 15,
      testability: 15,
      rollbackSimplicity: 10,
      governanceMaintainability: 5
    };

    this.tieThreshold = options.tieThreshold || 5;
    this.verbose = options.verbose || false;
  }

  _log(message) {
    if (this.verbose) {
      console.log(`[FlowChangeStrategyEngine] ${message}`);
    }
  }

  _toNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  _normalizeBoolean(value, defaultValue = false) {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return defaultValue;
  }

  _deriveOverlapSignals(input) {
    const label = (input.flowMetadata?.label || '').toLowerCase();
    const description = (input.flowMetadata?.description || '').toLowerCase();
    const capabilityDomain = (input.capabilityDomain || '').toLowerCase().trim();
    const entryCriteria = (input.entryCriteria || '').trim();

    const hasCapabilityDomain = capabilityDomain.length > 0;
    const overlapByText = hasCapabilityDomain &&
      (label.includes(capabilityDomain) || description.includes(capabilityDomain));

    const competingFlows = input.competingAutomation?.flows || [];
    const activeSameContextFlows = competingFlows.length;
    const hasExistingFlow = Boolean(input.flowMetadata?.apiName);

    return {
      hasCapabilityDomain,
      overlapByText,
      hasExistingFlow,
      activeSameContextFlows,
      hasEntryCriteria: entryCriteria.length > 0
    };
  }

  _scoreFunctionalOverlap(input, signals) {
    let updateScore = 2;
    let newScore = 3;

    if (signals.overlapByText) {
      updateScore = 5;
      newScore = 2;
    } else if (signals.hasCapabilityDomain) {
      updateScore = 3;
      newScore = 4;
    }

    if (!signals.hasExistingFlow) {
      updateScore = 1;
      newScore = 5;
    }

    if (input.proposedAction === 'update') {
      updateScore = Math.min(5, updateScore + 1);
      newScore = Math.max(1, newScore - 1);
    } else if (input.proposedAction === 'new') {
      newScore = Math.min(5, newScore + 1);
      updateScore = Math.max(1, updateScore - 1);
    }

    return { updateScore, newScore };
  }

  _scoreBlastRadius(input, signals) {
    const totalAutomation = this._toNumber(input.totalAutomation, 0);
    const complexity = this._toNumber(input.complexity?.score, 0);
    const versionSkew = this._toNumber(input.versionInfo?.versionSkew, 0);

    let updateScore = 4;
    let newScore = 4;

    if (totalAutomation >= 6) {
      updateScore -= 1;
      newScore += 0;
    }

    if (complexity >= 10) {
      updateScore -= 2;
      newScore += 1;
    } else if (complexity >= 6) {
      updateScore -= 1;
    }

    if (versionSkew > 1) {
      updateScore -= 1;
    }

    if (!signals.hasEntryCriteria) {
      newScore -= 1;
    }

    return {
      updateScore: Math.max(1, Math.min(5, updateScore)),
      newScore: Math.max(1, Math.min(5, newScore))
    };
  }

  _scoreComplexity(input) {
    const complexity = this._toNumber(input.complexity?.score, 0);
    let updateScore = 4;
    let newScore = 3;
    let refactorRecommended = false;

    if (complexity >= 20) {
      updateScore = 1;
      newScore = 2;
      refactorRecommended = true;
    } else if (complexity >= 10) {
      updateScore = 2;
      newScore = 4;
      refactorRecommended = true;
    } else if (complexity >= 6) {
      updateScore = 3;
      newScore = 4;
    }

    return { updateScore, newScore, refactorRecommended };
  }

  _scorePerformance(input, signals) {
    const totalAutomation = this._toNumber(input.totalAutomation, 0);
    const hasEntryCriteria = signals.hasEntryCriteria;

    let updateScore = 3;
    let newScore = hasEntryCriteria ? 4 : 2;

    if (totalAutomation >= 8) {
      updateScore = 2;
      newScore = hasEntryCriteria ? 3 : 1;
    } else if (totalAutomation <= 2) {
      updateScore = 4;
      newScore = hasEntryCriteria ? 4 : 3;
    }

    return { updateScore, newScore };
  }

  _scoreTestability(input) {
    const complexity = this._toNumber(input.complexity?.score, 0);
    const totalAutomation = this._toNumber(input.totalAutomation, 0);

    let updateScore = 4;
    let newScore = 4;

    if (complexity >= 10) {
      updateScore -= 2;
    } else if (complexity >= 6) {
      updateScore -= 1;
    }

    if (totalAutomation >= 6) {
      updateScore -= 1;
      newScore -= 0;
    }

    return {
      updateScore: Math.max(1, Math.min(5, updateScore)),
      newScore: Math.max(1, Math.min(5, newScore))
    };
  }

  _scoreRollback(input) {
    const hasActiveVersion = Boolean(input.versionInfo?.activeVersion?.VersionNumber);
    const hasVersionHistory = this._toNumber(input.versionInfo?.totalVersions, 0) > 1;
    const hasEntryCriteria = Boolean((input.entryCriteria || '').trim());

    let updateScore = 3;
    let newScore = 4;

    if (hasActiveVersion) {
      updateScore = 5;
    }
    if (!hasVersionHistory && hasActiveVersion) {
      updateScore = 4;
    }

    if (!hasEntryCriteria) {
      newScore = 3;
    }

    return { updateScore, newScore };
  }

  _scoreGovernance(input, signals) {
    const totalAutomation = this._toNumber(input.totalAutomation, 0);

    let updateScore = signals.overlapByText ? 5 : 3;
    let newScore = signals.overlapByText ? 2 : 4;

    if (totalAutomation >= 8) {
      newScore -= 1;
    }
    if (!signals.hasEntryCriteria) {
      newScore -= 1;
    }

    return {
      updateScore: Math.max(1, Math.min(5, updateScore)),
      newScore: Math.max(1, Math.min(5, newScore))
    };
  }

  _calculateWeightedTotals(criteriaScores) {
    const updateTotal =
      (criteriaScores.functionalOverlap.updateScore / 5) * this.weights.functionalOverlap +
      (criteriaScores.blastRadius.updateScore / 5) * this.weights.blastRadius +
      (criteriaScores.complexityImpact.updateScore / 5) * this.weights.complexityImpact +
      (criteriaScores.performanceRisk.updateScore / 5) * this.weights.performanceRisk +
      (criteriaScores.testability.updateScore / 5) * this.weights.testability +
      (criteriaScores.rollbackSimplicity.updateScore / 5) * this.weights.rollbackSimplicity +
      (criteriaScores.governanceMaintainability.updateScore / 5) * this.weights.governanceMaintainability;

    const newTotal =
      (criteriaScores.functionalOverlap.newScore / 5) * this.weights.functionalOverlap +
      (criteriaScores.blastRadius.newScore / 5) * this.weights.blastRadius +
      (criteriaScores.complexityImpact.newScore / 5) * this.weights.complexityImpact +
      (criteriaScores.performanceRisk.newScore / 5) * this.weights.performanceRisk +
      (criteriaScores.testability.newScore / 5) * this.weights.testability +
      (criteriaScores.rollbackSimplicity.newScore / 5) * this.weights.rollbackSimplicity +
      (criteriaScores.governanceMaintainability.newScore / 5) * this.weights.governanceMaintainability;

    return {
      update: Number(updateTotal.toFixed(2)),
      new: Number(newTotal.toFixed(2))
    };
  }

  _deriveCriticalIssues(input, signals) {
    const critical = [];
    const warnings = [];
    const requiredActions = [];

    const requiresAsyncOrdering = this._normalizeBoolean(input.requiresAsyncOrdering, false);
    const expandsPrivilegedScope = this._normalizeBoolean(input.security?.expandsPrivilegedScope, false);
    const hasPrivilegeGuard = this._normalizeBoolean(input.security?.hasGuardConditions, false);
    const overlapContradictions = this._toNumber(input.entryCriteriaAnalysis?.summary?.contradictions, 0);

    if (requiresAsyncOrdering) {
      critical.push('Design assumes strict asynchronous ordering, which Salesforce cannot guarantee.');
      requiredActions.push('Redesign flow orchestration to avoid strict ordering dependencies on async paths.');
    }

    if (
      input.proposedAction === 'new' &&
      signals.activeSameContextFlows > 0 &&
      !signals.hasEntryCriteria
    ) {
      critical.push('New flow targets a context with existing active flows but has no explicit entry criteria.');
      requiredActions.push('Define mutually exclusive entry criteria or consolidate logic.');
    }

    if (
      signals.activeSameContextFlows > 1 &&
      input.competingAutomation?.conflicts?.some(conflict => conflict.type === 'race_condition')
    ) {
      critical.push('Multiple flows share trigger context with ambiguous trigger ordering.');
      requiredActions.push('Set explicit trigger order values and document rationale.');
    }

    if (overlapContradictions > 0) {
      critical.push('Entry criteria contradictions detected between start conditions and internal flow logic.');
      requiredActions.push('Resolve entry criteria contradictions before deployment.');
    }

    if (expandsPrivilegedScope && !hasPrivilegeGuard) {
      critical.push('Change expands privileged automation scope without guard conditions.');
      requiredActions.push('Add guard conditions or explicit security controls for privileged execution.');
    }

    if (!signals.hasCapabilityDomain) {
      warnings.push('Capability domain not provided; overlap scoring confidence reduced.');
      requiredActions.push('Provide capability domain for high-confidence decisioning.');
    }

    if (!signals.hasEntryCriteria && (input.proposedAction === 'new' || signals.activeSameContextFlows > 0)) {
      warnings.push('Entry criteria not provided; overlap risk cannot be fully evaluated.');
      requiredActions.push('Document explicit entry criteria to reduce overlap risk.');
    }

    if ((input.totalAutomation || 0) >= 6) {
      warnings.push('High automation density on target object may increase execution overhead.');
      requiredActions.push('Review execution order and optimization opportunities.');
    }

    return {
      critical,
      warnings,
      requiredActions: [...new Set(requiredActions)]
    };
  }

  _deriveConfidence(signals, criticalCount) {
    let confidence = 0.9;

    if (!signals.hasCapabilityDomain) {
      confidence -= 0.2;
    }
    if (!signals.hasEntryCriteria) {
      confidence -= 0.15;
    }
    if (criticalCount > 0) {
      confidence -= 0.15;
    }

    return Number(Math.max(0.3, Math.min(0.95, confidence)).toFixed(2));
  }

  _chooseStrategy(totals, criteriaScores, critical, warnings) {
    const delta = Number(Math.abs(totals.update - totals.new).toFixed(2));
    let recommendedStrategy = totals.update >= totals.new ? 'update_existing' : 'create_new';
    let tieBreakApplied = false;

    const refactorRecommended = Boolean(criteriaScores.complexityImpact.refactorRecommended);

    if (delta <= this.tieThreshold) {
      tieBreakApplied = true;
      // Tie-break policy: prefer smaller blast radius and clearer rollback boundary.
      const updateSafetyScore =
        criteriaScores.blastRadius.updateScore + criteriaScores.rollbackSimplicity.updateScore;
      const newSafetyScore =
        criteriaScores.blastRadius.newScore + criteriaScores.rollbackSimplicity.newScore;
      recommendedStrategy = updateSafetyScore >= newSafetyScore
        ? 'update_existing'
        : 'create_new';
    }

    if (refactorRecommended && recommendedStrategy === 'update_existing') {
      recommendedStrategy = 'refactor_with_subflow';
    }

    const hasCriticalBlocks = critical.length > 0;
    const riskLevel = hasCriticalBlocks ? 'critical' : warnings.length > 0 ? 'elevated' : 'normal';

    return {
      recommendedStrategy,
      tieBreakApplied,
      scoreDelta: delta,
      riskLevel
    };
  }

  evaluate(input = {}) {
    const normalized = {
      proposedAction: (input.proposedAction || 'auto').toLowerCase(),
      capabilityDomain: input.capabilityDomain || '',
      entryCriteria: input.entryCriteria || '',
      flowMetadata: input.flowMetadata || {},
      versionInfo: input.versionInfo || {},
      complexity: input.complexity || {},
      competingAutomation: input.competingAutomation || {},
      security: input.security || {},
      entryCriteriaAnalysis: input.entryCriteriaAnalysis || {},
      totalAutomation: this._toNumber(input.totalAutomation, 0),
      requiresAsyncOrdering: this._normalizeBoolean(input.requiresAsyncOrdering, false)
    };

    const signals = this._deriveOverlapSignals(normalized);
    const criteriaScores = {};

    criteriaScores.functionalOverlap = this._scoreFunctionalOverlap(normalized, signals);
    criteriaScores.blastRadius = this._scoreBlastRadius(normalized, signals);
    criteriaScores.complexityImpact = this._scoreComplexity(normalized);
    criteriaScores.performanceRisk = this._scorePerformance(normalized, signals);
    criteriaScores.testability = this._scoreTestability(normalized);
    criteriaScores.rollbackSimplicity = this._scoreRollback(normalized);
    criteriaScores.governanceMaintainability = this._scoreGovernance(normalized, signals);

    const totals = this._calculateWeightedTotals(criteriaScores);
    const issueBundle = this._deriveCriticalIssues(normalized, signals);
    const choice = this._chooseStrategy(
      totals,
      criteriaScores,
      issueBundle.critical,
      issueBundle.warnings
    );

    if (
      criteriaScores.complexityImpact.refactorRecommended &&
      normalized.proposedAction === 'update' &&
      signals.hasExistingFlow
    ) {
      choice.recommendedStrategy = 'refactor_with_subflow';
    }

    const confidence = this._deriveConfidence(signals, issueBundle.critical.length);
    const rationale = [];

    rationale.push(
      `Weighted totals: update=${totals.update}, new=${totals.new} (delta=${choice.scoreDelta}).`
    );
    if (choice.tieBreakApplied) {
      rationale.push(
        `Tie-break applied (threshold <= ${this.tieThreshold}): preferred smaller blast radius and clearer rollback boundary.`
      );
    }
    if (criteriaScores.complexityImpact.refactorRecommended) {
      rationale.push('Complexity threshold exceeded; refactor/subflow extraction is recommended.');
    }
    if (!signals.hasCapabilityDomain) {
      rationale.push('Capability domain not provided, reducing overlap certainty.');
    }
    if (!signals.hasEntryCriteria) {
      rationale.push('Entry criteria not provided, reducing exclusivity certainty.');
    }

    this._log(`Strategy recommendation: ${choice.recommendedStrategy}`);

    return {
      recommendedStrategy: choice.recommendedStrategy,
      weightedScores: totals,
      criteriaScores,
      scoreDelta: choice.scoreDelta,
      tieBreakApplied: choice.tieBreakApplied,
      riskLevel: choice.riskLevel,
      blockingIssues: issueBundle.critical,
      warnings: issueBundle.warnings,
      requiredActions: issueBundle.requiredActions,
      rationale,
      confidence
    };
  }
}

module.exports = {
  FlowChangeStrategyEngine
};
