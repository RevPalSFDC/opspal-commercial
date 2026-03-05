#!/usr/bin/env python3
from __future__ import annotations
import argparse
import json
from scripts.lib.metadata_discovery_service import MetadataDiscoveryService


def main():
    p = argparse.ArgumentParser(description='Metadata Discovery CLI')
    p.add_argument('--org', required=True, help='Salesforce org alias')
    sub = p.add_subparsers(dest='cmd', required=True)

    sub.add_parser('flows').add_argument('--all', action='store_true')
    vr = sub.add_parser('validation-rules')
    vr.add_argument('--object', help='Object API name (optional)')
    sub.add_parser('escalation-rules')
    ar = sub.add_parser('assignment-rules')
    ar.add_argument('--object', help='Object API name (optional)')

    args = p.parse_args()
    svc = MetadataDiscoveryService(args.org)

    if args.cmd == 'flows':
        recs = svc.flows(active_only=not args.all)
    elif args.cmd == 'validation-rules':
        recs = svc.validation_rules(args.object)
    elif args.cmd == 'assignment-rules':
        recs = svc.assignment_rules(args.object)
    elif args.cmd == 'escalation-rules':
        recs = svc.escalation_rules()
    else:
        recs = []

    print(json.dumps(recs, indent=2))

if __name__ == '__main__':
    main()

