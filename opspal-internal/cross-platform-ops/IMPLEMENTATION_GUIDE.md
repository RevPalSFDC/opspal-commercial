# 🚀 Contact Marking Implementation Guide

## Your Situation
- **Production Org** with 254,176 contacts
- **CPU timeouts** on large batches
- **51% code coverage** (blocks new Apex deployment)
- **Need immediate solution** to mark contacts

## 🎯 Recommended Approach (In Order)

### 1️⃣ IMMEDIATE: Run Small Batches (Works Now!)

**Execute this script repeatedly** (processes 100 contacts per run):
```bash
sf apex run --file scripts/simple-execute.apex --target-org rentable-production
```

**Why this works:**
- Only 100 contacts per run = no CPU timeout
- Takes ~1 second per execution
- Run it 50 times = 5,000 contacts marked
- Can be automated with a shell loop

**Automation script:**
```bash
# Run 50 times to process 5,000 contacts
for i in {1..50}; do
  echo "Batch $i of 50..."
  sf apex run --file scripts/simple-execute.apex --target-org rentable-production
  sleep 2  # Brief pause between runs
done
```

### 2️⃣ TODAY: Create Scheduled Flow (No Code Needed)

**Setup → Flows → New Flow → Scheduled-Triggered Flow**

Follow the configuration in: `flow-configs/Contact_Marking_Scheduled_Flow.md`

**Benefits:**
- Runs automatically every day/hour
- Processes 200 contacts per run
- No deployment required
- No code coverage issues
- Salesforce handles all batching

### 3️⃣ THIS WEEK: Bulk API Export/Import

For the full 250k contacts:

**Option A - Use our script:**
```bash
npm install csv-parse csv-stringify
node scripts/bulk-api-marking.js
```

**Option B - Manual with Data Loader:**
1. Export: `SELECT Id, Email, Phone, AccountId, Name FROM Contact WHERE Clean_Status__c = null`
2. Process in Excel/Google Sheets (add Clean_Status__c and Sync_Status__c columns)
3. Import: Update Contact by Id

**Benefits:**
- Process all 250k contacts at once
- No governor limits
- Works in production immediately

### 4️⃣ LATER: Deploy Optimized Batch Class

**After fixing code coverage to 75%:**

Deploy: `ContactMarkingBatchOptimized.cls`

Run:
```apex
// Process with scope of 100
ContactMarkingBatchOptimized.run(100);
```

**Benefits:**
- Fully automated
- Handles millions of records
- Progress tracking
- Error handling
- Resumable

## 📊 Monitoring Progress

### Check marking status:
```sql
SELECT Clean_Status__c, COUNT(Id) count
FROM Contact
WHERE Clean_Status__c != null
GROUP BY Clean_Status__c
```

### Check remaining unmarked:
```sql
SELECT COUNT(Id)
FROM Contact
WHERE Email != null
  AND Clean_Status__c = null
```

### Find contacts needing Inclusion List:
```sql
SELECT Id, Name, Email
FROM Contact
WHERE Sync_Status__c = 'In HS Not on Inclusion List'
LIMIT 100
```

## ⚡ Quick Decision Tree

**Q: I need to mark contacts RIGHT NOW**
→ Run `simple-execute.apex` repeatedly

**Q: I want it automated going forward**
→ Create the Scheduled Flow

**Q: I need all 250k done today**
→ Use Bulk API export/import

**Q: I want a permanent solution**
→ Fix code coverage, deploy batch class

## 🔧 Troubleshooting

### "CPU time limit exceeded"
- Reduce batch size (use 50 instead of 100)
- Remove aggregation queries
- Simplify scoring logic

### "Cannot deploy - insufficient code coverage"
- Use Flow or Bulk API instead
- Or add test classes to reach 75%

### "Flow not processing enough"
- Increase frequency (hourly vs daily)
- Create multiple flows with different filters
- Use Bulk API for initial backfill

## 📈 Expected Timeline

Using recommended approach:

1. **Hour 1**: Run simple script 50x → 5,000 contacts marked
2. **Day 1**: Create Flow → 4,800 contacts/day automated
3. **Day 2-3**: Bulk API → All 250k contacts marked
4. **Week 2**: Deploy batch class → Permanent solution

## 💡 Pro Tips

1. **Start with simple-execute.apex** - it works immediately
2. **Create the Flow today** - it runs forever without maintenance
3. **Use Bulk API for backlog** - fastest way to catch up
4. **Fix code coverage when convenient** - not urgent

## 📞 Next Steps

1. Run this now:
```bash
sf apex run --file /home/chris/Desktop/RevPal/Agents/opspal-internal/cross-platform-ops/scripts/simple-execute.apex --target-org rentable-production
```

2. Check it worked:
```bash
sf data query --query "SELECT Clean_Status__c, COUNT(Id) FROM Contact WHERE Clean_Status__c != null GROUP BY Clean_Status__c" --target-org rentable-production
```

3. Repeat until satisfied, then implement Flow for automation

---

**Files Ready to Use:**
- `scripts/simple-execute.apex` - Run now, no timeout
- `scripts/bulk-api-marking.js` - Process all contacts
- `flow-configs/Contact_Marking_Scheduled_Flow.md` - Auto-marking
- `classes/ContactMarkingBatchOptimized.cls` - Future deployment

You're all set! 🚀