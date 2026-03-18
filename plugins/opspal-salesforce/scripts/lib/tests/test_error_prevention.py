#!/usr/bin/env python3
from scripts.lib.error_prevention import parse_sf_datetime, deduplicate_name_aliases

def assert_true(cond, msg):
    if not cond:
        raise AssertionError(msg)

def test_parse_sf_datetime():
    d1 = parse_sf_datetime('2025-01-01')
    d2 = parse_sf_datetime('2025-01-01T00:00:00Z')
    d3 = parse_sf_datetime('2025-01-01T00:00:00+00:00')
    assert_true(d1 and d1.tzinfo, 'date-only should be tz-aware')
    assert_true(d2 and d2.tzinfo, 'Z datetime should be tz-aware')
    assert_true(d3 and d3.tzinfo, '+00:00 datetime should be tz-aware')
    assert_true((d2 - d1).total_seconds() == 0, 'date forms should be equal at midnight UTC')

def test_alias_dedup():
    q = "SELECT CreatedBy.Name, Owner.Name FROM Lead"
    out = deduplicate_name_aliases(q)
    assert_true('CreatedBy.Name CreatedByName' in out, 'CreatedBy.Name should get alias')
    assert_true('Owner.Name OwnerName' in out, 'Owner.Name should get alias')

if __name__ == '__main__':
    test_parse_sf_datetime()
    test_alias_dedup()
    print('OK: error_prevention tests passed')

