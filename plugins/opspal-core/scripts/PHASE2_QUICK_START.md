# Phase 2 Quick Start Guide

**Status**: ✅ READY TO EXECUTE

---

## ⚡ 60-Second Quick Start

```bash
# 1. Dry run (preview)
bash plugins/opspal-core/scripts/execute-phase2.sh --dry-run

# 2. Review output

# 3. Execute live
bash plugins/opspal-core/scripts/execute-phase2.sh
```

---

## 📋 What You Need

### Environment Variables (.env file)
```bash
SUPABASE_URL=https://<project-id>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...        # NOT anon key!
ASANA_ACCESS_TOKEN=2/xxx...
ASANA_REFLECTION_PROJECT_GID=xxx...
```

### Dependencies
- ✅ Node.js
- ✅ jq (for JSON processing)

---

## 🎯 What It Does

| Step | Action | Result |
|------|--------|--------|
| **1. Fix Plans** | Generate 5-Why RCA for 13 cohorts | Detailed solution designs |
| **2. Asana Tasks** | Create task for each cohort | 13 tasks ready for review |
| **3. Status Updates** | Mark reflections 'under_review' | Database updated transactionally |

---

## ✅ Expected Results

- **13 Asana tasks** created
- **All reflections** → 'under_review' status
- **Fix plans** generated with implementation estimates
- **Total execution time**: ~5-10 minutes

---

## 🔍 Verify Success

```bash
# Check Asana
open "https://app.asana.com/0/${ASANA_REFLECTION_PROJECT_GID}"
# Should see 13 new tasks with [Reflection Cohort] prefix

# Check Supabase
echo "SELECT reflection_status, COUNT(*) FROM reflections
WHERE reflection_status = 'under_review'
GROUP BY reflection_status;" | psql $SUPABASE_URL
```

---

## ⚠️ Common Issues

| Error | Fix |
|-------|-----|
| "SUPABASE_SERVICE_ROLE_KEY not set" | Add to .env (not anon key!) |
| "Asana 401 Unauthorized" | Generate new token at app.asana.com |
| "Update verification failed" | Using anon key instead of service role |
| "Circuit breaker opened" | Wait 30-60s, automatic retry |

---

## 📚 Full Documentation

- **Detailed Plan**: `PHASE2_EXECUTION_PLAN.md`
- **Complete Summary**: `PHASE2_SUMMARY.md`
- **Orchestration Script**: `.claude/scripts/process-reflections.js`

---

## 🆘 Need Help?

1. Check logs: `.claude/logs/process-reflections-*.log`
2. Review DLQ: `.claude/dlq/`
3. Inspect checkpoint: `.claude/checkpoints/process-reflections-execute.json`

---

**Ready?** Run the dry-run command above to preview. 🚀
