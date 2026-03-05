# ADR-0001: Full Migration to LangGraph Framework

**Status:** Proposed
**Date:** 2025-10-19
**Deciders:** Engineering Team
**Related Issues:** Platform Independence, State Management, Multi-Model Cost Optimization

---

## Context and Problem Statement

The OpsPal plugin system currently runs on Claude Code with 156 agents, 411 scripts, and 8 plugins serving production users. While this architecture has proven effective, it faces several strategic challenges:

1. **Vendor Lock-In:** Full dependency on Anthropic/Claude Code creates platform risk
2. **State Management:** File-based state tracking (execution-logs/*.json) is fragile and hard to debug
3. **Model Limitations:** Cannot leverage o1 for complex reasoning, Haiku for cost savings, or Codestral for code generation
4. **Workflow Complexity:** Bash scripts + JS orchestrators lack sophisticated conditional logic, parallel execution management, and automatic recovery
5. **Rebuilding Framework Features:** Supervisor-Auditor system (recently built) essentially recreates LangGraph functionality

**Pain Points Identified:**
- Deployment pipelines: Rollback and state tracking challenges
- Dedup workflows: Parallel execution and recovery complexity

**Strategic Priority:** Platform independence to avoid vendor lock-in risk

---

## Decision Drivers

1. **Platform Independence** - Ability to switch LLM providers without major refactoring
2. **Multi-Model Optimization** - Use different models for different task complexities (cost reduction)
3. **State Management** - Built-in checkpointing and automatic recovery from failures
4. **Workflow Sophistication** - Complex conditional logic, parallel execution, human-in-loop
5. **Production Scalability** - API layer, web UI, monitoring for enterprise deployment
6. **Team Velocity** - Stop rebuilding framework features (Supervisor-Auditor shows we're rebuilding LangGraph)
7. **Long-Term Maintainability** - Use mature, community-supported framework vs custom orchestration

---

## Considered Options

### Option 1: Stay with Claude Code (No Migration)

**Pros:**
- ✅ Zero migration cost
- ✅ Existing users unaffected
- ✅ 156 agents already production-ready
- ✅ Plugin marketplace distribution working

**Cons:**
- ❌ **CRITICAL:** Vendor lock-in to Anthropic (API pricing risk, service discontinuation risk)
- ❌ Cannot use o1 for reasoning, Haiku for cost savings, other models
- ❌ File-based state management (fragile, hard to recover)
- ❌ Limited workflow complexity (bash scripts, manual orchestration)
- ❌ Rebuilding framework features (Supervisor-Auditor duplicates LangGraph)

**Risk Exposure:**
- If Claude Code becomes paid: **$50,000/year** estimated cost
- If plugin system deprecated: **3-6 month emergency migration** ($60k)
- If better models emerge elsewhere: **Missed opportunity cost**

**Total Annual Risk:** ~$40,000 (weighted by probability)

---

### Option 2: Hybrid Approach (Claude Code + LangGraph for Workflows)

**Pros:**
- ✅ Incremental migration (lower initial risk)
- ✅ Keep existing plugins for simple operations
- ✅ Add LangGraph for complex workflows only
- ✅ Backward compatibility during transition

**Cons:**
- ⚠️ **Maintains vendor lock-in** - Still dependent on Claude Code for 90% of functionality
- ⚠️ Dual maintenance burden (two systems)
- ⚠️ Limited multi-model flexibility (Claude Code portions still locked to Anthropic)
- ⚠️ API cost concerns (pay for LangGraph calls while Claude Code is "free")
- ⚠️ Doesn't solve platform independence goal

**Analysis:** Hybrid approach reduces migration risk but **fails to achieve primary goal** (platform independence).

---

### Option 3: Full Migration to LangGraph (RECOMMENDED)

**Pros:**
- ✅ **Platform independence** - Switch between Claude, GPT-4, o1, Gemini, etc.
- ✅ **Multi-model cost optimization** - 8.8x reduction via o1+Sonnet+Haiku routing
- ✅ **Sophisticated state management** - Built-in checkpointing, automatic recovery
- ✅ **Workflow visualization** - LangGraph Studio for debugging/monitoring
- ✅ **Stop rebuilding frameworks** - Use mature LangGraph instead of custom Supervisor-Auditor
- ✅ **Production scalability** - API layer, web UI, enterprise features
- ✅ **Community support** - Active LangChain ecosystem (30k+ GitHub stars)

**Cons:**
- ⚠️ **High migration cost** - 6 months, $60,000 investment
- ⚠️ **User disruption risk** - Existing users may experience temporary issues during migration
- ⚠️ **Team learning curve** - Python + LangGraph training required (4-6 weeks)
- ⚠️ **Re-implementation risk** - New workflows may have bugs old system didn't

**Mitigation Strategies:**
- Compatibility layer for gradual transition (3-6 months parallel operation)
- Comprehensive testing (unit, integration, e2e, shadow mode)
- Phased rollout (test → sandbox → production)
- Training program + external support if needed

**ROI:**
- **Year 1:** $150k benefits - $60k cost = **$90k net**
- **Payback Period:** 4.8 months
- **Year 2+:** $146k/year ongoing benefit

---

### Option 4: Full Migration to CrewAI

**Pros:**
- ✅ Simpler API than LangGraph
- ✅ Good for team-based delegation (coordinator → specialists)
- ✅ Platform independence (same as LangGraph)

**Cons:**
- ⚠️ **Less sophisticated state management** than LangGraph
- ⚠️ **Limited workflow complexity** - Best for sequential/hierarchical, not complex conditional flows
- ⚠️ **Smaller ecosystem** than LangChain/LangGraph
- ⚠️ Doesn't address deployment pipeline / dedup workflow pain points as well

**Analysis:** CrewAI is viable for simple team workflows but **LangGraph better matches our complex workflow needs** (deployment with conditional rollback, dedup with parallel execution).

---

## Decision Outcome

**Chosen Option:** **Option 3 - Full Migration to LangGraph**

**Rationale:**

1. **Primary Goal Achieved:** Platform independence eliminates vendor lock-in risk ($40k/year risk mitigation)

2. **Workflow Pain Points Solved:**
   - Deployment pipeline: Conditional rollback, state checkpoints, automatic recovery
   - Dedup workflow: Parallel execution management (framework-native), checkpoint recovery

3. **Cost Optimization:** Multi-model routing (o1 for reasoning, Sonnet for execution, Haiku for simple tasks) provides 8.8x cost reduction potential

4. **Stop Rebuilding Frameworks:** Supervisor-Auditor system shows we're already investing engineering time building LangGraph-equivalent features. Use the mature framework instead.

5. **Strong ROI:** 4.8 month payback, $90k net benefit Year 1, $146k/year ongoing

6. **Future-Proof:** Not locked to any single vendor, can adapt to model evolution (o1, Gemini 2.0, future models)

**Hybrid Approach Rejected Because:**
- Fails to achieve platform independence (still dependent on Claude Code for 90% of functionality)
- Limited multi-model flexibility
- Dual maintenance burden
- API cost concerns

**CrewAI Rejected Because:**
- Less sophisticated state management than our needs
- Not as well-suited for complex conditional workflows

---

## Implementation Plan

### Phase 1: Foundation (Months 1-2) - $16,000

**Deliverables:**
1. Model abstraction layer (o1/Sonnet/Haiku routing)
2. Deployment pipeline workflow in LangGraph
3. Dedup workflow in LangGraph
4. 50+ agents converted to LangGraph tools
5. State persistence (PostgreSQL checkpointer)

**Success Criteria:**
- Model router working (complexity-based selection)
- Deployment pipeline ≥ bash script performance
- Dedup workflow 5x+ speedup
- Cost reduction validated (8x+ savings)
- Team self-sufficient with LangGraph

---

### Phase 2: Complex Workflows (Months 3-4) - $16,000

**Deliverables:**
1. All orchestration workflows migrated
2. Reflection system (Supabase → LangGraph state)
3. Multi-platform sync (Salesforce ↔ HubSpot)
4. Remaining 106 agents converted to tools

**Success Criteria:**
- 10+ workflows migrated
- All 156 agents converted
- Reflection system functional
- User feedback positive (NPS ≥50)

---

### Phase 3: Production + UI (Months 5-6) - $12,000

**Deliverables:**
1. FastAPI endpoints for all workflows
2. LangGraph Studio integration
3. Claude Code compatibility layer (optional)
4. Production deployment (Docker, K8s)

**Success Criteria:**
- API deployed (99.9% uptime)
- User migration complete
- Cost savings validated
- Platform independence achieved

---

## Consequences

### Positive Consequences

1. **Platform Independence**
   - Can switch LLM providers without major refactoring
   - No vendor lock-in risk
   - Model flexibility (o1 for reasoning, Haiku for cost)

2. **Cost Optimization**
   - 60% reduction via multi-model routing
   - Estimated $25k/year savings at scale
   - Flexibility to optimize as usage grows

3. **State Management**
   - Automatic checkpointing (resume from any failure point)
   - Built-in audit trail
   - No more file-based state tracking

4. **Workflow Sophistication**
   - Complex conditional logic (rollback on failure)
   - Parallel execution management (fan-out/fan-in)
   - Human-in-loop (approval gates)
   - Visual debugging (LangGraph Studio)

5. **Production Readiness**
   - API layer for non-technical users
   - Web UI for workflow management
   - Monitoring and observability

6. **Stop Rebuilding Frameworks**
   - Deprecate Supervisor-Auditor (use LangGraph instead)
   - Focus engineering time on domain logic vs infrastructure

7. **Community Support**
   - Active LangChain ecosystem
   - 30k+ GitHub stars
   - Production-ready (Fortune 500 companies)

---

### Negative Consequences

1. **Migration Cost**
   - 6 months timeline
   - $60,000 one-time investment
   - Engineering time diverted from features

2. **User Disruption**
   - Existing users may experience issues during migration
   - Need compatibility layer for smooth transition
   - Support burden during migration period

3. **Team Learning Curve**
   - Python + LangGraph training (4-6 weeks)
   - Slower velocity during ramp-up
   - May need external consulting support

4. **Re-Implementation Risk**
   - New workflows may have bugs
   - Comprehensive testing required (unit, integration, e2e)
   - Shadow mode needed for validation

5. **Framework Dependency**
   - Locked to LangGraph (though it's open-source)
   - Breaking changes possible (mitigated by version pinning)
   - Maintenance burden for framework updates

---

### Risk Mitigation Strategies

**User Disruption:**
- ✅ Compatibility layer (run old + new in parallel for 3 months)
- ✅ Phased rollout (test → sandbox → production)
- ✅ Feature parity before deprecation

**Team Learning Curve:**
- ✅ Training program (LangGraph tutorial, hands-on workshop)
- ✅ Start simple (deployment pipeline → more complex)
- ✅ External support if needed (2-4 week consulting)

**Framework Maturity:**
- ✅ Version pinning (avoid bleeding edge)
- ✅ Abstraction layer (easier to update if API changes)
- ✅ Fallback plan (keep old workflows in git history)

**Re-Implementation Bugs:**
- ✅ Comprehensive testing (≥80% coverage)
- ✅ Shadow mode (compare old vs new results)
- ✅ Gradual rollout with monitoring
- ✅ Automated regression testing

---

## Validation

### Success Metrics (Phase 1 - Month 2)

| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Model cost per 1M tokens | ≤$1.20 | TBD | Pending |
| Deployment success rate | ≥99% | TBD | Pending |
| Dedup speedup | ≥5x | TBD | Pending |
| Test coverage | ≥80% | TBD | Pending |
| Team self-sufficiency | 100% | TBD | Pending |

### Decision Review Points

1. **End of Phase 1 (Month 2):** Validate technical feasibility
   - If success criteria not met → Re-evaluate or pivot to hybrid approach
   - If success criteria met → Proceed to Phase 2

2. **End of Phase 2 (Month 4):** Validate user acceptance
   - If user feedback negative (NPS <40) → Extend compatibility layer, address issues
   - If user feedback positive (NPS ≥50) → Proceed to Phase 3

3. **End of Phase 3 (Month 6):** Validate business outcomes
   - If cost savings not realized → Optimize model routing
   - If platform independence achieved → Success, document lessons learned

---

## References

- **Framework Comparison:** `FRAMEWORK_MIGRATION_ANALYSIS.md`
- **Phase 1 Details:** `FRAMEWORK_MIGRATION_PHASE1_PLAN.md`
- **LangGraph Docs:** https://langchain-ai.github.io/langgraph/
- **LangChain Ecosystem:** https://python.langchain.com/
- **Supervisor-Auditor:** `CLAUDE.md` (Section: Supervisor-Auditor System)

---

## Code References

Once implementation begins, key code locations will be:

- **Model Router:** `opspal-langgraph/config/models.py`
- **Deployment Pipeline:** `opspal-langgraph/workflows/deployment_pipeline.py`
- **Dedup Workflow:** `opspal-langgraph/workflows/dedup_pipeline.py`
- **Salesforce Tools:** `opspal-langgraph/tools/salesforce/`
- **State Persistence:** `opspal-langgraph/config/persistence.py`

---

## Notes

**Why This Decision Matters:**

This is one of the most significant architectural decisions for the OpsPal project. It affects:
- **Strategic independence** (can switch vendors)
- **Cost structure** (multi-model optimization)
- **Engineering velocity** (stop rebuilding frameworks)
- **User experience** (better workflows, API access)
- **Long-term maintainability** (mature framework vs custom code)

**What This Prevents:**

Without this migration:
1. **Vendor lock-in risk:** Potential $50k/year if Claude Code pricing changes
2. **Emergency migration:** 3-6 month crisis if plugin system deprecated
3. **Continued framework rebuilding:** Engineering time wasted recreating LangGraph features
4. **Model inflexibility:** Cannot leverage o1, Haiku, or future models
5. **State management fragility:** File-based logs continue to cause issues

**Historical Context:**

- **2025-10-19:** Supervisor-Auditor system built (task decomposition, parallel execution, audit compliance) - essentially LangGraph features
- **2025-10-17:** Proactive Agent Routing implemented (auto-agent-router.js)
- **2025-10-11:** Supabase Reflection System deployed (cohort detection, fix planning, Asana integration)
- **User Feedback:** Deployment pipeline and dedup workflow pain points identified

The timing is right: We're already building framework-like features, proving we need sophisticated orchestration. Use the mature framework instead.

---

**ADR Status:** Proposed (Pending Phase 1 Validation)
**Last Updated:** 2025-10-19
**Next Review:** End of Phase 1 (Month 2) - February 2026
