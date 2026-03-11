# OKR Platform Comparison

When to use the opspal-okrs plugin vs dedicated OKR tools, with migration considerations and hybrid approaches.

---

## Comparison Table

| Capability | opspal-okrs | Lattice | Gtmhub (Quantive) | Notion OKRs |
|-----------|------------|---------|-------------------|-------------|
| **Data-driven baselines** | Live from SF/HS/Gong | Manual entry | API integrations | Manual entry |
| **Three-stance targets** | Built-in (A/B/C + P10/P50/P90) | Not native | Metric forecasting | Manual |
| **Initiative scoring** | 5-dimension rubric | Performance reviews | Task tracking | Kanban/table |
| **Revenue alignment** | Native (RevOps-native) | HR-focused | Business-focused | Generic |
| **Cascade validation** | Automated audit | Visual tree | Alignment view | Manual linking |
| **Operating rhythm** | Cadence manager + Asana | Check-ins native | Check-ins native | Manual reminders |
| **Executive reporting** | BLUF+4 + dashboards | Review cycles | Analytics dashboards | Manual |
| **Learning engine** | Bayesian calibration | None | Confidence scoring | None |
| **PLG support** | PQL/activation KRs | None | Limited | None |
| **Cost** | Included with OpsPal | $6-11/user/mo | $9-20/user/mo | Free-$10/user/mo |
| **Setup time** | Minutes (plugin install) | Weeks (implementation) | Weeks (implementation) | Hours (templates) |
| **Best for** | Revenue teams, RevOps | HR/People teams | Large enterprises | Small teams, startups |

---

## When to Use opspal-okrs

**Best fit when:**
- Your OKRs are primarily revenue and growth focused
- You already use Salesforce and/or HubSpot
- You want baselines derived from live data, not manual entry
- You need initiative scoring tied to funnel leverage
- Your team is <200 people and doesn't need a separate OKR platform
- You value RevOps-native reporting (BLUF+4, confidence bands)

**Not ideal when:**
- OKRs are primarily for HR performance management
- You need mobile apps for individual contributors
- You have 1000+ employees needing self-service OKR editing
- You want visual OKR trees with drag-and-drop editing
- You need compliance-grade audit trails for OKR changes

---

## Migration Considerations

### From Spreadsheets to opspal-okrs
- Export current OKRs to JSON matching `config/okr-schema.json`
- Use `/okr-generate` to create a fresh draft with live baselines
- Compare spreadsheet targets with data-driven targets
- Transition over 1-2 cycles (run both in parallel initially)

### From Lattice/Quantive to opspal-okrs
- Export historical OKR data as CSV/JSON
- Import outcomes into `config/okr-outcomes.json` for learning engine seed
- Recreate objectives and KRs using `/okr-generate`
- Note: Performance review integration requires separate tool

### From opspal-okrs to a Dedicated Platform
- Export approved OKR sets from `orgs/{org}/platforms/okr/{cycle}/approved/`
- Export outcomes from `config/okr-outcomes.json`
- Most platforms accept CSV import for objectives and key results
- Confidence bands and three-stance data may not transfer (simplify to single targets)

---

## Hybrid Approach

Many organizations use opspal-okrs alongside a dedicated tool:

| Use opspal-okrs For | Use Dedicated Tool For |
|---------------------|----------------------|
| Revenue and growth OKRs | Company-wide people OKRs |
| Data-driven baselines and targets | Individual contributor goals |
| Initiative prioritization | Performance review integration |
| Executive reporting (BLUF+4) | Self-service OKR editing |
| Cycle-over-cycle calibration | Visual alignment trees |

**Integration Pattern:**
1. Generate revenue OKRs in opspal-okrs (data-driven)
2. Export approved OKRs to the dedicated tool
3. Track progress in both (opspal-okrs for analytics, dedicated tool for visibility)
4. Close cycle in opspal-okrs for learning engine calibration

---

*Part of the opspal-okrs plugin v3.0.0*
