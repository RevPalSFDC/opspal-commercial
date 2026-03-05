from __future__ import annotations
import re
from datetime import datetime, timezone


TOOLING_OBJECTS = {
    'FLOW', 'FLOWDEFINITION', 'FLOWDEFINITIONVIEW', 'VALIDATIONRULE',
    'FLEXIPAGE', 'LAYOUT', 'FIELDDEFINITION', 'ENTITYDEFINITION',
    'APEXCLASS', 'APEXTRIGGER', 'APEXTESTQUEUEITEM', 'APEXCODECOVERAGE',
    'APEXCODECOVERAGEAGGREGATE'
}


def needs_tooling_api(query: str) -> bool:
    upper = query.upper()
    if ' FROM ' not in upper:
        return False
    try:
        from_part = upper.split(' FROM ', 1)[1]
        # crude removal of subselects
        while '(' in from_part and ')' in from_part:
            s = from_part.find('(')
            e = from_part.find(')', s)
            if e == -1:
                break
            from_part = from_part[:s] + from_part[e+1:]
        first = from_part.strip().split()[0]
        return first in TOOLING_OBJECTS
    except Exception:
        return False


def parse_sf_datetime(date_str: str | None) -> datetime | None:
    """Return timezone-aware datetime for Salesforce date/datetime strings.
    Handles 'YYYY-MM-DD' and ISO datetimes with optional 'Z'.
    """
    if not date_str:
        return None
    s = date_str.strip()
    try:
        if len(s) == 10 and s.count('-') == 2:  # date-only
            return datetime.fromisoformat(s + 'T00:00:00+00:00')
        # ensure timezone
        if s.endswith('Z'):
            s = s.replace('Z', '+00:00')
        if re.match(r"^\d{4}-\d{2}-\d{2}T.*[+-]\d{2}:?\d{2}$", s):
            # normalize +0000 -> +00:00
            if re.match(r".*[+-]\d{4}$", s):
                s = s[:-5] + s[-5:-2] + ':' + s[-2:]
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        # last resort: naive parse → make UTC
        try:
            dt = datetime.fromisoformat(s)
            return dt.replace(tzinfo=timezone.utc)
        except Exception:
            return None


ALIAS_RELATION_NAME = re.compile(r"\b([A-Za-z_][\w]*)\.Name\b(?!\s+[A-Za-z_][\w]*)")


def deduplicate_name_aliases(query: str) -> str:
    """Add unique aliases for Relationship.Name selections lacking aliases.
    Example: CreatedBy.Name -> CreatedBy.Name CreatedByName
    """
    def repl(m: re.Match[str]) -> str:
        rel = m.group(1)
        return f"{rel}.Name {rel}Name"

    return ALIAS_RELATION_NAME.sub(repl, query)

