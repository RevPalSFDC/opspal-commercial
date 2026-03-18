# 07 - Monitoring SLO and Alert Score

## Goal

Track routing health as an operational SLO with incident prioritization.

## Core Metrics

- time-to-route from qualifying event to routed state
- leads stuck in staging/suppression states
- loop detector hit rate
- API limit pressure (606/615/607 trends)
- paging mismatch signal (high empty-page scans + unresolved moreResult)

## Alert Score (Reference)

Aggregate weighted signals:
1. routing SLO breach
2. loop detector triggered
3. API contention spike
4. paging-window mismatch signal

## Cadence

- near real-time: API contention + loop spikes
- daily: SLO distribution and stuck-lead age buckets
- weekly: trend review and runbook tuning
