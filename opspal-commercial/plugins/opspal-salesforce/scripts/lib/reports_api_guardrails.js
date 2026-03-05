// Runtime JS build of reports_api_guardrails for current Node setup

function buildBooleanFilter(filters, override) {
    if (!filters || filters.length === 0) return undefined;
    if (override && override.trim().length > 0) return override.trim();
    if (filters.length === 1) return '1';
    return Array.from({ length: filters.length }, (_, i) => `${i + 1}`).join(' AND ');
}

function normalizeOperators(op) {
    const v = (op || '').toString().trim().toLowerCase();
    const map = {
        '=': 'equals',
        '==': 'equals',
        'equals': 'equals',
        'equal': 'equals',
        'not equal': 'notEqual',
        'notequal': 'notEqual',
        '!=': 'notEqual',
        '<>': 'notEqual',
        'ne': 'notEqual',
        'not': 'notEqual',
        '<': 'lessThan',
        '>': 'greaterThan',
        '<=': 'lessOrEqual',
        '>=': 'greaterOrEqual',
        'lessthan': 'lessThan',
        'greaterthan': 'greaterThan',
        'lessorequal': 'lessOrEqual',
        'greaterorequal': 'greaterOrEqual',
        'contains': 'contains',
        'includes': 'includes',
        'excludes': 'excludes',
        'startswith': 'startsWith',
        'starts': 'startsWith',
        'starts_with': 'startsWith',
    };
    const mapped = map[v];
    if (!mapped) throw new Error(`Unsupported operator: ${op}`);
    return mapped;
}

function enforceRelativeDates(meta, options) {
    const context = (options && options.context) || 'persisted';
    const allowAbsolute = options && options.allowAbsolute === true;
    const sdf = meta && meta.standardDateFilter;
    if (!sdf) return meta || {};
    if (typeof sdf.durationValue === 'string') {
        if (context === 'export') {
            const abs = literalToAbsolute(sdf.durationValue);
            if (abs) return { standardDateFilter: Object.assign({ column: sdf.column }, abs) };
        }
        return meta;
    }
    if (sdf.startDate && sdf.endDate) {
        if (context === 'adhoc' && allowAbsolute) return meta;
        const literal = toNearestLiteral(sdf.startDate, sdf.endDate);
        if (literal) {
            return { standardDateFilter: { column: sdf.column, durationValue: literal } };
        }
        const n = daysBetween(sdf.startDate, sdf.endDate);
        return { standardDateFilter: { column: sdf.column, durationValue: `LAST_N_DAYS:${n}` } };
    }
    return meta;
}

function daysBetween(start, end) {
    const s = new Date(start + 'T00:00:00Z').getTime();
    const e = new Date(end + 'T00:00:00Z').getTime();
    const ms = Math.max(0, Math.round((e - s) / (1000 * 60 * 60 * 24)));
    return ms || 0;
}

function toNearestLiteral(start, end) {
    const s = new Date(start + 'T00:00:00Z');
    const e = new Date(end + 'T00:00:00Z');
    const today = new Date();
    const todayY = today.getUTCFullYear();
    const todayM = today.getUTCMonth();
    const firstOfMonth = new Date(Date.UTC(todayY, todayM, 1));
    if (s.getTime() === firstOfMonth.getTime() && e <= today) return 'THIS_MONTH';
    return null;
}

async function withRetries(fn, opts) {
    const maxTries = Math.max(1, (opts && opts.maxTries) ?? 4);
    const base = (opts && opts.baseMs) ?? 1000;
    const cap = (opts && opts.capMs) ?? 8000;
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
        try {
            return await fn();
        } catch (err) {
            attempt++;
            const status = err && (err.statusCode || err.status || parseStatusFromMessage(err.message));
            if (!(status === 429 || status === 503) || attempt >= maxTries) throw err;
            let backoff = Math.min(cap, base * Math.pow(2, attempt - 1));
            const retryAfterHeader = (err && (err.retryAfterSeconds || parseRetryAfter(err.headers)));
            if (retryAfterHeader && Number.isFinite(retryAfterHeader)) {
                backoff = Math.max(backoff, retryAfterHeader * 1000);
            }
            const jitterPct = 0.1 + Math.random() * 0.1; // 10-20%
            const jitter = Math.floor(backoff * jitterPct);
            await new Promise(res => setTimeout(res, backoff + jitter));
        }
    }
}

function parseStatusFromMessage(msg) {
    if (!msg) return undefined;
    const m = msg.match(/\((\d{3})\)/);
    if (m) return parseInt(m[1], 10);
    return undefined;
}

function parseRetryAfter(headers) {
    if (!headers) return undefined;
    const v = headers['retry-after'] || headers['Retry-After'];
    if (!v) return undefined;
    const n = parseInt(Array.isArray(v) ? v[0] : v, 10);
    return Number.isFinite(n) ? n : undefined;
}

function tokenMap(field, describe) {
    if (!field) return undefined;
    const direct = field.toUpperCase();
    const knownTokens = new Set([
        'CREATED_DATE', 'LAST_MODIFIED_DATE', 'CLOSE_DATE', 'STAGE_NAME', 'OWNER_ID', 'ACCOUNT_NAME', 'CONTACT_NAME', 'LEAD_SOURCE', 'TYPE', 'AMOUNT'
    ]);
    if (knownTokens.has(direct)) return direct;
    const table = {
        'createddate': 'CREATED_DATE',
        'lastmodifieddate': 'LAST_MODIFIED_DATE',
        'closedate': 'CLOSE_DATE',
        'close date': 'CLOSE_DATE',
        'stage': 'STAGE_NAME',
        'stage name': 'STAGE_NAME',
        'ownerid': 'OWNER_ID',
        'owner id': 'OWNER_ID',
        'account name': 'ACCOUNT_NAME',
        'contact name': 'CONTACT_NAME',
        'lead source': 'LEAD_SOURCE',
        'type': 'TYPE',
        'amount': 'AMOUNT'
    };
    const key = field.toLowerCase().trim();
    if (table[key]) return table[key];
    if (describe && Array.isArray(describe.fields)) {
        const byLabel = describe.fields.find(f => (f.label || '').toLowerCase() === key);
        if (byLabel) return byLabel.token;
        const byToken = describe.fields.find(f => f.token && f.token.toLowerCase() === key);
        if (byToken) return byToken.token;
    }
    return undefined;
}

function literalToAbsolute(literal) {
    const today = new Date();
    const fmt = d => d.toISOString().slice(0, 10);
    if (literal === 'THIS_MONTH') {
        const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
        return { startDate: fmt(start), endDate: fmt(today) };
    }
    const m = literal.match(/^LAST_N_DAYS:(\d+)$/);
    if (m) {
        const n = parseInt(m[1], 10);
        const start = new Date(today);
        start.setUTCDate(start.getUTCDate() - n);
        return { startDate: fmt(start), endDate: fmt(today) };
    }
    return null;
}

module.exports = {
    buildBooleanFilter,
    normalizeOperators,
    enforceRelativeDates,
    withRetries,
    tokenMap
};
