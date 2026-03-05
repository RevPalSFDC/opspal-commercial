/**
 * Usage Data to Diagrams Converter
 *
 * Converts reports/dashboard usage audit data into various Mermaid diagram formats.
 *
 * @module mermaid-converters/usage-data-to-diagrams
 * @version 1.0.0
 * @date 2025-10-20
 */

/**
 * Convert dashboard dependencies to flowchart
 *
 * @param {Array} dashboards - Dashboard data
 * @param {Array} reports - Report data
 * @param {Array} components - Dashboard component mappings
 * @param {Object} options - Conversion options
 * @returns {Object} Flowchart data structure
 */
function dashboardDependenciesToFlowchart(dashboards, reports, components, options = {}) {
  const nodes = [];
  const edges = [];
  const subgraphs = [];

  // Create dashboard nodes
  dashboards.forEach(dashboard => {
    const isStale = !dashboard.lastViewedDate || isOlderThan(dashboard.lastViewedDate, 180);

    nodes.push({
      id: dashboard.id,
      label: `📊 ${dashboard.title}\\n(${dashboard.componentCount || 0} components)`,
      shape: 'rectangle',
      style: isStale ? 'fill:#ffcccc' : undefined
    });
  });

  // Create report nodes
  reports.forEach(report => {
    const usageLevel = getUsageLevel(report.timesRun);

    nodes.push({
      id: report.id,
      label: `📄 ${report.name}\\n(Run ${report.timesRun || 0} times)`,
      shape: 'parallelogram',
      style: usageLevel === 'high' ? 'fill:#ccffcc' :
             usageLevel === 'medium' ? 'fill:#ffffcc' : 'fill:#ffcccc'
    });
  });

  // Create edges from components
  components.forEach(comp => {
    edges.push({
      from: comp.dashboardId,
      to: comp.reportId,
      label: comp.componentType || ''
    });
  });

  // Group by department if available
  if (options.groupByDepartment && dashboards[0]?.department) {
    const deptMap = new Map();

    dashboards.forEach(d => {
      const dept = d.department || 'Uncategorized';
      if (!deptMap.has(dept)) {
        deptMap.set(dept, []);
      }
      deptMap.get(dept).push(d.id);
    });

    deptMap.forEach((dashboardIds, dept) => {
      subgraphs.push({
        id: `dept_${dept.replace(/\s+/g, '_')}`,
        title: dept,
        nodes: dashboardIds
      });
    });
  }

  const annotations = [
    { text: '🟢 High Usage (>100 runs)', color: 'green' },
    { text: '🟡 Medium Usage (10-100 runs)', color: 'yellow' },
    { text: '🔴 Low/No Usage or Stale', color: 'red' }
  ];

  return {
    nodes,
    edges,
    subgraphs,
    annotations,
    direction: 'TB'
  };
}

/**
 * Convert field usage data to ERD
 *
 * @param {Object} fieldUsageData - Field usage by object
 * @param {Object} options - Conversion options
 * @returns {Object} ERD data structure
 */
function fieldUsageToERD(fieldUsageData, options = {}) {
  const entities = [];
  const relationships = [];

  Object.entries(fieldUsageData).forEach(([objectName, objectData]) => {
    const attributes = objectData.fields.map(field => {
      const reportCount = field.reportCount || 0;

      return {
        name: field.name,
        type: field.type,
        metadata: `Used in ${reportCount} reports`,
        style: reportCount === 0 ? 'fill:#ff6b6b' :
               reportCount > 50 ? 'fill:#4caf50' :
               reportCount > 10 ? 'fill:#ffd93d' : undefined
      };
    });

    entities.push({
      name: objectName,
      label: `${objectName}\\n(${objectData.totalFields} fields)`,
      attributes
    });

    // Add relationships if available
    if (objectData.relationships) {
      objectData.relationships.forEach(rel => {
        relationships.push({
          from: objectName,
          to: rel.relatedObject,
          type: rel.type === 'Lookup' ? 'many-to-one' : 'one-to-many',
          label: rel.fieldName
        });
      });
    }
  });

  const annotations = [
    { text: '🟢 Highly Used (>50 reports)' },
    { text: '🟡 Moderately Used (10-50 reports)' },
    { text: '🔴 Unused (0 reports)', position: 'bottom' }
  ];

  return {
    entities,
    relationships,
    annotations
  };
}

/**
 * Convert department coverage to flowchart
 *
 * @param {Object} departmentData - Reports/dashboards by department
 * @returns {Object} Flowchart data structure
 */
function departmentCoverageToFlowchart(departmentData) {
  const nodes = [];
  const subgraphs = [];

  Object.entries(departmentData).forEach(([deptName, deptData]) => {
    const coverage = calculateCoverage(deptData);

    // Create nodes for each report/dashboard in department
    deptData.items.forEach(item => {
      nodes.push({
        id: item.id,
        label: `${item.name}\\n${item.type}\\n(${item.timesRun || 0} runs)`,
        shape: item.type === 'Dashboard' ? 'hexagon' : 'rectangle'
      });
    });

    // Create subgraph for department
    subgraphs.push({
      id: `dept_${deptName.replace(/\s+/g, '_')}`,
      title: `${deptName}\\n${deptData.reportCount} reports | ${deptData.dashboardCount} dashboards`,
      nodes: deptData.items.map(item => item.id),
      style: coverage === 'low' ? 'fill:#ffcccc' :
             coverage === 'high' ? 'fill:#ccffcc' : undefined
    });
  });

  return {
    nodes,
    edges: [], // No edges, just grouped layout
    subgraphs,
    direction: 'TB'
  };
}

/**
 * Convert stale reports data to decision tree flowchart
 *
 * @param {Array} staleReports - Stale report analysis results
 * @returns {Object} Flowchart data structure
 */
function staleReportsToDecisionTree(staleReports) {
  const nodes = [
    { id: 'start', label: `${staleReports.length} Stale Reports\\n(>6 months unused)`, shape: 'circle' },
    { id: 'on_dashboard', label: 'On Dashboard?', shape: 'diamond' },
    { id: 'high_quality', label: 'High Quality Score?', shape: 'diamond' },
    { id: 'keep', label: 'Keep\\n(Dashboard dependency)', shape: 'rectangle', style: 'fill:#4caf50' },
    { id: 'promote', label: 'Promote or Sunset\\n(High quality, not used)', shape: 'rectangle', style: 'fill:#ffd93d' },
    { id: 'delete', label: 'Delete Candidate\\n(Low quality, unused)', shape: 'rectangle', style: 'fill:#ff6b6b' }
  ];

  const edges = [
    { from: 'start', to: 'on_dashboard', label: 'Evaluate' },
    { from: 'on_dashboard', to: 'keep', label: 'Yes' },
    { from: 'on_dashboard', to: 'high_quality', label: 'No' },
    { from: 'high_quality', to: 'promote', label: 'Yes' },
    { from: 'high_quality', to: 'delete', label: 'No' }
  ];

  // Add report nodes
  staleReports.forEach(report => {
    nodes.push({
      id: report.id,
      label: `${report.name}\\n(Last run: ${report.lastRunDate || 'Never'})`,
      shape: 'parallelogram',
      style: report.recommendation === 'delete' ? 'fill:#ffcccc' : undefined
    });

    // Connect to recommendation node
    const targetNode = report.recommendation === 'keep' ? 'keep' :
                       report.recommendation === 'promote' ? 'promote' : 'delete';

    edges.push({
      from: targetNode,
      to: report.id,
      label: ''
    });
  });

  return {
    nodes,
    edges,
    direction: 'TB'
  };
}

/**
 * Helper: Get usage level based on run count
 */
function getUsageLevel(timesRun) {
  if (timesRun > 100) return 'high';
  if (timesRun > 10) return 'medium';
  return 'low';
}

/**
 * Helper: Check if date is older than N days
 */
function isOlderThan(dateStr, days) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = (now - date) / (1000 * 60 * 60 * 24);
  return diffDays > days;
}

/**
 * Helper: Calculate department coverage level
 */
function calculateCoverage(deptData) {
  const totalItems = deptData.reportCount + deptData.dashboardCount;
  if (totalItems > 30) return 'high';
  if (totalItems > 10) return 'medium';
  return 'low';
}

module.exports = {
  dashboardDependenciesToFlowchart,
  fieldUsageToERD,
  departmentCoverageToFlowchart,
  staleReportsToDecisionTree
};
