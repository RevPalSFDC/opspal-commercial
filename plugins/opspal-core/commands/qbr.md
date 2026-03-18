---
name: qbr
description: Assemble a QBR or board pack from multi-platform data — ARR waterfall, pipeline health, engagement, Gong signals, and OKR progress
argument-hint: "[quarter e.g. Q1-2026] [--format qbr|board-pack] [--org <slug>]"
intent: Prepare comprehensive QBR or board meeting materials from multi-platform revenue data
dependencies: [board-pack-orchestrator]
failure_modes: [no_salesforce_connected, insufficient_pipeline_data]
---

# QBR / Board Pack Preparation

Assemble a comprehensive quarterly business review or board pack presentation.

## Usage

```
/qbr Q1-2026                         # Full QBR for Q1
/qbr Q1-2026 --format board-pack     # Condensed board format (10-15 slides)
/qbr Q1-2026 --org acme-corp         # Specify org
```

## Instructions

Route to `opspal-core:board-pack-orchestrator` agent. The orchestrator coordinates parallel data collection across all connected platforms and assembles the final deliverable.

Output: Branded PPTX + PDF backup + interactive dashboard.
