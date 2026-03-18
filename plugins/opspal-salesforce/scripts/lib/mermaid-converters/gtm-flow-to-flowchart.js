/**
 * GTM Flow to Flowchart Converter
 *
 * Converts GTM funnel analysis data (from sfdc-revops-auditor) into
 * Mermaid flowchart format for visualization.
 *
 * @module mermaid-converters/gtm-flow-to-flowchart
 * @version 1.0.0
 * @date 2025-10-20
 */

/**
 * Convert GTM funnel data to flowchart structure
 *
 * @param {Object} gtmData - GTM flow analysis data
 * @param {Array} gtmData.stages - Funnel stages with conversion metrics
 * @param {Array} gtmData.transitions - Stage-to-stage transitions
 * @param {Object} options - Conversion options
 * @param {boolean} options.showConversionRates - Include conversion % on edges
 * @param {boolean} options.showVolumes - Include volume counts on nodes
 * @param {boolean} options.highlightBottlenecks - Highlight low-conversion stages
 * @returns {Object} Flowchart data structure for diagram-generator
 */
function gtmFlowToFlowchart(gtmData, options = {}) {
  const {
    showConversionRates = true,
    showVolumes = true,
    highlightBottlenecks = true
  } = options;

  const nodes = [];
  const edges = [];
  const annotations = [];

  // Create nodes for each stage
  gtmData.stages.forEach((stage, index) => {
    const label = formatStageLabel(stage, showVolumes);
    const shape = index === gtmData.stages.length - 1 ? 'circle' : 'rectangle';

    let style;
    if (index === gtmData.stages.length - 1) {
      style = 'fill:#4caf50'; // Success stage (Closed Won)
    } else if (highlightBottlenecks && stage.conversionRate < 0.2) {
      style = 'fill:#ff6b6b'; // Bottleneck
    } else if (stage.conversionRate < 0.4) {
      style = 'fill:#ffd93d'; // Warning
    }

    nodes.push({
      id: stage.id || stage.name,
      label,
      shape,
      style
    });
  });

  // Create edges for transitions
  gtmData.transitions.forEach(transition => {
    let label = '';

    if (showConversionRates) {
      const rate = (transition.conversionRate * 100).toFixed(1);
      label = `${rate}% convert`;

      if (transition.avgDays !== undefined) {
        label += `\\n(avg ${transition.avgDays} days)`;
      }
    }

    const edgeColor = getConversionColor(transition.conversionRate);

    edges.push({
      from: transition.from,
      to: transition.to,
      label,
      color: edgeColor
    });
  });

  // Add bottleneck annotations
  if (highlightBottlenecks) {
    gtmData.stages.forEach(stage => {
      if (stage.conversionRate < 0.2) {
        annotations.push({
          node: stage.id || stage.name,
          text: `⚠️ Bottleneck: ${(stage.conversionRate * 100).toFixed(1)}% conversion`
        });
      }
    });
  }

  return {
    nodes,
    edges,
    annotations,
    direction: 'LR'
  };
}

/**
 * Convert campaign attribution data to sequence diagram
 *
 * @param {Object} attributionData - Campaign attribution journey data
 * @param {Array} attributionData.touchpoints - Campaign touchpoints in order
 * @param {Object} attributionData.contact - Contact information
 * @param {Object} attributionData.opportunity - Resulting opportunity
 * @returns {Object} Sequence diagram data structure
 */
function attributionToSequence(attributionData) {
  const participants = [];
  const messages = [];

  // Add contact as actor
  participants.push({
    id: 'contact',
    label: attributionData.contact.name || 'Contact',
    type: 'actor'
  });

  // Add unique campaigns as participants
  const campaignMap = new Map();
  attributionData.touchpoints.forEach(tp => {
    if (!campaignMap.has(tp.campaignId)) {
      campaignMap.set(tp.campaignId, {
        id: tp.campaignId,
        label: tp.campaignName,
        type: 'participant'
      });
    }
  });
  participants.push(...campaignMap.values());

  // Add opportunity as participant
  if (attributionData.opportunity) {
    participants.push({
      id: 'opportunity',
      label: 'Opportunity',
      type: 'participant'
    });
  }

  // Create messages for each touchpoint
  attributionData.touchpoints.forEach((tp, index) => {
    const isFirstTouch = index === 0;
    const isLastTouch = index === attributionData.touchpoints.length - 1;

    let label = tp.interactionType || 'Interaction';
    if (isFirstTouch) label = `First Touch: ${label}`;
    if (isLastTouch) label = `Last Touch: ${label}`;

    messages.push({
      from: 'contact',
      to: tp.campaignId,
      label,
      note: `Day ${tp.daysSinceFirstTouch || index}`
    });

    // Response from campaign
    if (tp.response) {
      messages.push({
        from: tp.campaignId,
        to: 'contact',
        label: tp.response
      });
    }
  });

  // Add opportunity creation
  if (attributionData.opportunity) {
    messages.push({
      from: attributionData.touchpoints[attributionData.touchpoints.length - 1].campaignId,
      to: 'opportunity',
      label: 'Opportunity Created'
    });

    if (attributionData.opportunity.closedWon) {
      messages.push({
        from: 'opportunity',
        to: 'contact',
        label: `Closed Won (Deal: $${attributionData.opportunity.amount})`
      });
    }
  }

  return {
    participants,
    messages,
    autonumber: true
  };
}

/**
 * Format stage label with optional volume
 */
function formatStageLabel(stage, showVolume) {
  let label = stage.name || stage.label;

  if (showVolume && stage.count !== undefined) {
    label += `\\n(${stage.count.toLocaleString()})`;
  }

  return label;
}

/**
 * Get edge color based on conversion rate
 */
function getConversionColor(conversionRate) {
  if (conversionRate >= 0.5) return 'green';
  if (conversionRate >= 0.25) return 'orange';
  return 'red';
}

module.exports = {
  gtmFlowToFlowchart,
  attributionToSequence
};
