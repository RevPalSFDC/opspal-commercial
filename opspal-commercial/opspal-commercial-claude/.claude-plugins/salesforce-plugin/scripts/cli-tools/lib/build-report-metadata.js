const { tokenMap, normalizeOperators, buildBooleanFilter } = require('../../scripts/lib/reports_api_guardrails');

async function buildMetadataFromArgs({ type, groupBy = [], filters = [], date = null, name }, describe) {
  const metadata = {
    name: name || `CLI Report ${Date.now()}`,
    reportType: { type },
    reportFormat: groupBy.length > 0 ? 'SUMMARY' : 'TABULAR',
    detailColumns: []
  };
  if (groupBy.length > 0) {
    metadata.groupingsDown = groupBy.map(g => ({ name: (tokenMap(g, describe) || g), sortOrder: 'ASC' }));
  }
  if (filters.length > 0) {
    metadata.reportFilters = filters.map(f => ({
      column: tokenMap(f.column, describe) || f.column,
      operator: normalizeOperators(f.operator),
      value: f.value
    }));
    if (metadata.reportFilters.length > 1) {
      metadata.reportBooleanFilter = buildBooleanFilter(metadata.reportFilters);
    }
  }
  if (date) {
    const [col, literal] = date.split(':', 2);
    metadata.standardDateFilter = { column: tokenMap(col, describe) || col, durationValue: literal };
  }
  return metadata;
}

module.exports = { buildMetadataFromArgs };

