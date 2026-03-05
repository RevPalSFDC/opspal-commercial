/**
 * Marketo Routing Analysis Helpers
 *
 * Pure utilities shared by routing diagnostics tools.
 *
 * @module routing-analysis
 * @version 1.0.0
 */

function toTimestamp(value) {
  if (!value) return null;
  const n = Date.parse(value);
  return Number.isNaN(n) ? null : n;
}

function normalizeString(value) {
  if (value === null || value === undefined) return null;
  return String(value);
}

function parseChangeFields(changeRecord) {
  if (!changeRecord || typeof changeRecord !== 'object') return [];

  if (Array.isArray(changeRecord.fields)) {
    return changeRecord.fields
      .filter(field => field && field.name)
      .map(field => ({
        name: normalizeString(field.name),
        oldValue: normalizeString(field.oldValue),
        newValue: normalizeString(field.newValue),
        activityDate: changeRecord.activityDate || changeRecord.activityTime || changeRecord.createdAt || null
      }));
  }

  return [];
}

export function selectCanonicalLead(leads = [], filterType = 'id') {
  if (!Array.isArray(leads) || leads.length === 0) {
    return {
      canonicalLead: null,
      duplicates: [],
      duplicateRisk: false,
      method: 'none'
    };
  }

  if (leads.length === 1) {
    return {
      canonicalLead: leads[0],
      duplicates: [],
      duplicateRisk: false,
      method: 'single'
    };
  }

  const ranked = [...leads].sort((a, b) => {
    const aUpdated = toTimestamp(a.updatedAt) || 0;
    const bUpdated = toTimestamp(b.updatedAt) || 0;
    if (aUpdated !== bUpdated) return bUpdated - aUpdated;
    return (Number(a.id) || 0) - (Number(b.id) || 0);
  });

  const byId = [...leads].sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));
  const canonical = filterType === 'id' ? byId[0] : ranked[0];
  const duplicates = leads.filter(lead => lead.id !== canonical.id);

  return {
    canonicalLead: canonical,
    duplicates,
    duplicateRisk: duplicates.length > 0,
    method: filterType === 'id' ? 'lowest_id' : 'most_recent_update'
  };
}

export function detectFieldOscillation(leadChanges = [], fieldName) {
  const target = normalizeString(fieldName);
  if (!target) {
    return {
      field: fieldName,
      count: 0,
      distinctValues: 0,
      flips: 0,
      avgSecondsBetweenFlips: null,
      recentEvents: [],
      isOscillating: false
    };
  }

  const events = [];
  for (const change of leadChanges) {
    for (const field of parseChangeFields(change)) {
      if (field.name === target) {
        events.push(field);
      }
    }
  }

  events.sort((a, b) => {
    const ta = toTimestamp(a.activityDate) || 0;
    const tb = toTimestamp(b.activityDate) || 0;
    return ta - tb;
  });

  let flips = 0;
  let flipIntervalsMs = [];
  for (let i = 1; i < events.length; i += 1) {
    const prev = events[i - 1];
    const cur = events[i];
    if (cur.newValue !== prev.newValue) {
      flips += 1;
      const dt = (toTimestamp(cur.activityDate) || 0) - (toTimestamp(prev.activityDate) || 0);
      if (dt > 0) flipIntervalsMs.push(dt);
    }
  }

  const distinct = new Set(events.map(item => item.newValue)).size;
  const avgMs = flipIntervalsMs.length > 0
    ? Math.round(flipIntervalsMs.reduce((sum, value) => sum + value, 0) / flipIntervalsMs.length)
    : null;

  const isOscillating = flips >= 3 && distinct >= 2;

  return {
    field: target,
    count: events.length,
    distinctValues: distinct,
    flips,
    avgSecondsBetweenFlips: avgMs ? Math.round(avgMs / 1000) : null,
    recentEvents: events.slice(-10),
    isOscillating
  };
}

export function detectLoopCandidates(leadChanges = [], candidateFields = []) {
  const fields = Array.isArray(candidateFields) ? candidateFields : [];
  const metrics = {};
  const oscillating = [];

  for (const field of fields) {
    const metric = detectFieldOscillation(leadChanges, field);
    metrics[field] = metric;
    if (metric.isOscillating) {
      oscillating.push({
        field,
        flips: metric.flips,
        distinctValues: metric.distinctValues,
        avgSecondsBetweenFlips: metric.avgSecondsBetweenFlips
      });
    }
  }

  return {
    hasLoopSignal: oscillating.length > 0,
    oscillatingFields: oscillating,
    metrics
  };
}

export function buildActivitySummary(activities = []) {
  const byType = new Map();
  let earliest = null;
  let latest = null;

  for (const activity of activities) {
    const typeId = activity.activityTypeId;
    byType.set(typeId, (byType.get(typeId) || 0) + 1);

    const ts = toTimestamp(activity.activityDate || activity.createdAt);
    if (ts !== null) {
      earliest = earliest === null ? ts : Math.min(earliest, ts);
      latest = latest === null ? ts : Math.max(latest, ts);
    }
  }

  return {
    total: activities.length,
    byType: Object.fromEntries(byType.entries()),
    windowStart: earliest ? new Date(earliest).toISOString() : null,
    windowEnd: latest ? new Date(latest).toISOString() : null
  };
}

