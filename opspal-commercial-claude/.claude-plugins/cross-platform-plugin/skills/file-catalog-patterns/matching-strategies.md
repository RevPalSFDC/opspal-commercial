# File Matching Strategies

## Strategy Overview

File matching connects downloaded assets to catalog entries. The choice of strategy depends on available metadata and reliability requirements.

## Strategy 1: Resource ID Matching (Recommended)

**Reliability: 99%**

Most reliable strategy when source platform provides unique file identifiers.

### How It Works

1. Extract `resource_id` from source URL
2. Build lookup table: `resource_id` → local filename
3. Match by resource_id prefix in downloaded files

### Implementation

```python
import os
import re

def build_resource_lookup(assets_folder):
    """
    Build resource_id → filename lookup from assets folder.

    Expects files named: {resource_id}_{original_filename}
    Example: 1458720369123_Contract_2024.pdf
    """
    lookup = {}

    for filename in os.listdir(assets_folder):
        if filename.startswith('.'):
            continue

        # Pattern: {resource_id}_{original_filename}
        parts = filename.split('_', 1)
        if len(parts) >= 2 and parts[0].isdigit():
            resource_id = parts[0]
            lookup[resource_id] = filename

    return lookup

def extract_resource_id(url, platform='monday'):
    """Extract resource_id from platform URL."""

    PATTERNS = {
        'monday': r'/resources/(\d+)/',
        'airtable': r'\.attachments/([^/]+)/',
        'google_drive': r'/file/d/([^/]+)/',
        'dropbox': r'/s/([^/]+)/',
        's3': r's3\.amazonaws\.com/[^/]+/(.+)'
    }

    pattern = PATTERNS.get(platform)
    if not pattern:
        return None

    match = re.search(pattern, str(url))
    return match.group(1) if match else None

def match_by_resource_id(url, lookup, platform='monday'):
    """Match URL to local file using resource_id."""
    resource_id = extract_resource_id(url, platform)
    if resource_id:
        return lookup.get(resource_id)
    return None
```

### When to Use

- Monday.com exports (always)
- Airtable exports
- Any platform with unique file IDs in URLs

---

## Strategy 2: Hash Matching

**Reliability: 95%**

Uses file content hashes for exact matching and deduplication.

### How It Works

1. Calculate hash (MD5/SHA256) for each downloaded file
2. Calculate hash for source file (if accessible)
3. Match by identical hash values

### Implementation

```python
import hashlib
import os

def calculate_file_hash(file_path, algorithm='md5'):
    """Calculate file hash for matching."""
    hash_func = hashlib.md5() if algorithm == 'md5' else hashlib.sha256()

    with open(file_path, 'rb') as f:
        for chunk in iter(lambda: f.read(8192), b''):
            hash_func.update(chunk)

    return hash_func.hexdigest()

def build_hash_lookup(assets_folder, algorithm='md5'):
    """Build hash → filename lookup."""
    lookup = {}

    for filename in os.listdir(assets_folder):
        if filename.startswith('.'):
            continue

        file_path = os.path.join(assets_folder, filename)
        if os.path.isfile(file_path):
            file_hash = calculate_file_hash(file_path, algorithm)
            lookup[file_hash] = filename

    return lookup

def match_by_hash(source_hash, lookup):
    """Match by file hash."""
    return lookup.get(source_hash)
```

### When to Use

- Deduplication required
- Source provides file hashes
- Content verification needed
- No unique IDs available

---

## Strategy 3: Filename + Size Matching

**Reliability: 80%**

Combines filename and file size for matching when IDs unavailable.

### How It Works

1. Normalize filenames (lowercase, remove special chars)
2. Get file sizes
3. Match by both normalized name AND size

### Implementation

```python
import os
import re
import urllib.parse

def normalize_filename(filename):
    """Normalize filename for matching."""
    # URL decode
    filename = urllib.parse.unquote(filename)
    # Lowercase
    filename = filename.lower()
    # Remove special characters (keep alphanumeric, dots, underscores)
    filename = re.sub(r'[^a-z0-9._]', '', filename)
    return filename

def build_name_size_lookup(assets_folder):
    """Build (normalized_name, size) → filename lookup."""
    lookup = {}

    for filename in os.listdir(assets_folder):
        if filename.startswith('.'):
            continue

        file_path = os.path.join(assets_folder, filename)
        if os.path.isfile(file_path):
            # Extract original filename (after resource_id prefix)
            parts = filename.split('_', 1)
            original = parts[1] if len(parts) > 1 else filename

            normalized = normalize_filename(original)
            size = os.path.getsize(file_path)

            lookup[(normalized, size)] = filename

    return lookup

def match_by_name_size(source_filename, source_size, lookup):
    """Match by normalized filename and size."""
    normalized = normalize_filename(source_filename)
    return lookup.get((normalized, source_size))
```

### When to Use

- No resource IDs in URLs
- Hash calculation not feasible
- Source provides file sizes

---

## Strategy 4: Fuzzy Filename Matching

**Reliability: 60%**

Last resort using fuzzy string matching on filenames.

### How It Works

1. Normalize all filenames
2. Use fuzzy matching algorithm (Levenshtein distance)
3. Accept matches above threshold (typically 85%)

### Implementation

```python
from difflib import SequenceMatcher

def fuzzy_match_score(str1, str2):
    """Calculate fuzzy match score (0-100)."""
    return SequenceMatcher(None, str1.lower(), str2.lower()).ratio() * 100

def build_fuzzy_lookup(assets_folder):
    """Build list of (normalized_name, filename) for fuzzy matching."""
    files = []

    for filename in os.listdir(assets_folder):
        if filename.startswith('.'):
            continue

        file_path = os.path.join(assets_folder, filename)
        if os.path.isfile(file_path):
            # Extract original filename
            parts = filename.split('_', 1)
            original = parts[1] if len(parts) > 1 else filename
            normalized = normalize_filename(original)

            files.append((normalized, filename))

    return files

def match_by_fuzzy(source_filename, file_list, threshold=85):
    """Match using fuzzy string matching."""
    normalized_source = normalize_filename(source_filename)

    best_match = None
    best_score = 0

    for normalized, filename in file_list:
        score = fuzzy_match_score(normalized_source, normalized)
        if score > best_score and score >= threshold:
            best_score = score
            best_match = filename

    return best_match, best_score
```

### When to Use

- All other strategies failed
- Filenames were modified during download
- Approximate matching acceptable

---

## Composite Matching Strategy

For best results, combine strategies in priority order:

```python
def match_file(url, source_filename, source_size, lookups):
    """
    Attempt file matching using multiple strategies.

    Args:
        url: Source URL (for resource_id extraction)
        source_filename: Original filename from source
        source_size: File size in bytes (if available)
        lookups: Dict containing all lookup tables

    Returns:
        tuple: (matched_filename, strategy_used, confidence)
    """

    # Strategy 1: Resource ID (highest priority)
    if 'resource_id' in lookups:
        match = match_by_resource_id(url, lookups['resource_id'])
        if match:
            return (match, 'resource_id', 0.99)

    # Strategy 2: Hash (if available)
    if 'hash' in lookups and source_hash:
        match = match_by_hash(source_hash, lookups['hash'])
        if match:
            return (match, 'hash', 0.95)

    # Strategy 3: Filename + Size
    if 'name_size' in lookups and source_size:
        match = match_by_name_size(source_filename, source_size, lookups['name_size'])
        if match:
            return (match, 'name_size', 0.80)

    # Strategy 4: Fuzzy matching (last resort)
    if 'fuzzy' in lookups:
        match, score = match_by_fuzzy(source_filename, lookups['fuzzy'])
        if match:
            return (match, 'fuzzy', score / 100)

    return (None, None, 0)
```

---

## Match Rate Analysis

Track matching effectiveness:

```python
def analyze_match_results(catalog):
    """Analyze matching results for quality assessment."""

    total = len(catalog)
    matched = sum(1 for r in catalog if r['matched'] == 'Yes')

    by_strategy = {}
    for row in catalog:
        strategy = row.get('match_strategy', 'unknown')
        by_strategy[strategy] = by_strategy.get(strategy, 0) + 1

    return {
        'total_entries': total,
        'matched': matched,
        'unmatched': total - matched,
        'match_rate': f"{(matched/total)*100:.1f}%",
        'by_strategy': by_strategy,
        'recommendations': generate_recommendations(matched/total, by_strategy)
    }

def generate_recommendations(match_rate, by_strategy):
    """Generate recommendations based on match analysis."""
    recommendations = []

    if match_rate < 0.8:
        recommendations.append("Low match rate - verify asset folder completeness")

    if by_strategy.get('fuzzy', 0) > by_strategy.get('resource_id', 0):
        recommendations.append("High fuzzy matching - consider re-downloading with resource_id naming")

    if match_rate < 0.5:
        recommendations.append("Critical: More than half of files unmatched - review export/download process")

    return recommendations
```
