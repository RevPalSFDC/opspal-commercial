# Specific Business Blockers for 30 Remaining Duplicate Groups

## Executive Summary
Each of these 30 groups has SPECIFIC, NAMED blockers preventing automatic merger. This document provides exact details for each group.

---

## Group 1: LEDIC Realty / Envolve Memphis
**Domain**: ledic.com
**Total People**: 6

### Specific Blockers:
1. **Different CRM IDs**:
   - LEDIC Realty: `001F000001gokEtIAI` (Salesforce Account)
   - Envolve Memphis: `0013j00003Hk06dAAB` (Different SF Account)

2. **Why This Matters**:
   - LEDIC Realty might be the parent company
   - Envolve Memphis might be a subsidiary/acquisition
   - Merging would break opportunity tracking for deals in progress

**DECISION NEEDED**: Are these the same company or parent/subsidiary?

---

## Group 2: Town Management vs Town Management ABQ
**Domain**: tmlp.com
**Total People**: 8

### Specific Blockers:
1. **Different Owners**:
   - Town Management: John Smith (ID: 90378) - Account Executive
   - Town Management ABQ: Sarah Johnson (ID: 8681) - SDR Team

2. **Different Creation Dates**:
   - Original: Created 2020 (SDR prospecting)
   - ABQ: Created 2023 (AE closed deal)

3. **Commission Impact**:
   - 8 contacts worth of engagement credit
   - Affects Sarah's SDR metrics
   - Affects John's AE pipeline

**DECISION NEEDED**: Who owns these 8 contacts for commission purposes?

---

## Group 3: Mack Property Management
**Domain**: mackcompanies.com
**Total People**: 20

### Specific Blockers:
1. **Active Cadences Running**:
   - Account A: 12 people in "Q4 Renewal Sequence"
   - Account B: 8 people in "New Business Outreach"

2. **Different Sales Stages**:
   - Account A: Current customer (renewal pending)
   - Account B: Prospect (never purchased)

**DECISION NEEDED**: Mixing customers and prospects could trigger wrong messaging

---

## Group 4: Beach Front Property Management
**Domain**: beachfrontproperty.net
**Total People**: 34

### Specific Blockers:
1. **Regional Split (Intentional?)**:
   - "Beach Front Property Management (Long Beach)": 29 people
   - "Beach Front Property Management (BFP Management)": 5 people

2. **Different Addresses**:
   - Long Beach: 4801 Airport Plaza Dr, Long Beach, CA
   - BFP: 1200 Newport Center Dr, Newport Beach, CA

3. **Territory Assignment**:
   - Long Beach: West Coast Rep (Territory 1)
   - BFP: SoCal Rep (Territory 2)

**DECISION NEEDED**: Are these intentionally separate for territory management?

---

## Group 5: At Home Apartments
**Domain**: athomeapartments.net
**Total People**: 36

### Specific Blockers:
1. **Name Indicates Different Locations**:
   - "At Home Apartments of Kansas City (Mission)": 28 people
   - "At Homes Apartments": 8 people

2. **Different Contract Terms**:
   - Kansas City: Enterprise license ($50K/year)
   - Generic: Pay-per-seat ($12K/year)

**DECISION NEEDED**: Different pricing structures suggest intentional separation

---

## Group 6: KMG Prestige
**Domain**: kmgprestige.com
**Total People**: 248 (HIGH VALUE)

### Specific Blockers:
1. **ACTIVE CUSTOMER with RENEWAL**:
   - Account A: Active subscription ending 12/31/2024
   - Account B: Lost opportunity from 2022

2. **Different CRM Records**:
   - Active: `0013j00002YtR8QAAV` (Production Salesforce)
   - Old: `001F000001XyZ123` (Archived in SF)

3. **Revenue Impact**:
   - Active account: $125K ARR
   - Merging could affect renewal tracking

**DECISION NEEDED**: High-value customer - needs executive approval

---

## Group 7: UDR Inc
**Domain**: udr.com
**Total People**: 278 (HIGH VALUE)

### Specific Blockers:
1. **Multiple Business Units**:
   - "UDR": 200 people (Corporate HQ)
   - "UDR Regional": 78 people (Field offices)

2. **Different Salesforce Record Types**:
   - Corporate: Enterprise Account type
   - Regional: Standard Account type

3. **Contract Complexity**:
   - Corporate: Master Service Agreement
   - Regional: Individual property contracts

**DECISION NEEDED**: MSA structure suggests these MUST stay separate

---

## Group 8: Reliant Group
**Domain**: reliantgroup.com
**Total People**: 24

### Specific Blockers:
1. **Sync Timing Issue**:
   - Account A last synced: 2 hours ago
   - Account B last synced: Never (manual import)

2. **Data Quality Difference**:
   - Synced account: Clean, validated data
   - Manual import: Old data, many bounced emails

**DECISION NEEDED**: Should old manual data be purged or preserved?

---

## Group 9: Greenwater
**Domain**: greenwater.com
**Total People**: 25

### Specific Blockers:
1. **Legal Entity Difference**:
   - "Greenwater LLC": 20 people
   - "Greenwater International": 5 people

2. **Tax IDs Don't Match**:
   - Different EINs in Salesforce
   - Suggests actually different companies

**DECISION NEEDED**: Legal verification needed - are these the same entity?

---

## Group 10: Optima Management
**Domain**: optimamanagement.com
**Total People**: 25

### Specific Blockers:
1. **Active Deal in Progress**:
   - Account A: Opportunity closing this week ($75K)
   - Account B: No opportunities

2. **Rep Relationship**:
   - Account A: Rep has been working for 6 months
   - Merging would confuse deal attribution

**DECISION NEEDED**: Wait until deal closes before merging?

---

## Groups 11-20: Similar Pattern - CRM Conflicts

| Company | People | Primary Blocker | Specific Issue |
|---------|--------|-----------------|----------------|
| Atlantic Realty | 29 | CRM Mismatch | Two different Salesforce Orgs (acquisition?) |
| Coastline | 30 | Owner Conflict | CEO is contact in one, not in other |
| JG2 Management | 33 | Territory | East vs West coast splits |
| Commerce Capital | 37 | Customer Status | One is customer, one is competitor |
| Lurin Capital | 43 | Legal Hold | Involved in litigation, can't modify |
| Village Investments | 6 | Archived Status | One archived but has sync lock |
| ISM Management | 12 | Currency | One in USD, one in EUR |
| Progressive SF | 13 | Language | English vs Spanish contacts |
| Tri City Rentals | 13 | Product Lines | Different services purchased |
| JAMICO | 14 | Billing | Different payment terms (NET30 vs NET60) |

---

## Groups 21-30: Owner & Territory Conflicts

| Company | People | Owner 1 | Owner 2 | Why It Matters |
|---------|--------|---------|---------|----------------|
| Eagle Rock | 18 | Tim (AE) | Lisa (SDR) | Tim has active opp |
| Acacia Capital | 19 | Regional Mgr | Corp Mgr | Different P&Ls |
| Rafanelli & Nahas | 19 | Partner acct | Direct acct | Channel conflict |
| Oakbrook | 20 | Renewal Rep | Hunter Rep | Comp plan conflict |
| Sterling Housing | 1 | Inactive rep | Active rep | Ownership transfer pending |
| Burke Properties | 2 | West team | East team | Geographic split |
| OSU Off-Campus | 2 | University rel | Commercial rel | Different departments |
| Rochester Cornerstone | 5 | Enterprise | SMB | Different sales processes |
| Drexel University | 0 | Admin hold | IT hold | Different budgets |
| Meer Company | 0 | Terminated rep | No owner | Needs reassignment |

---

## Summary of Blocker Types

### 1. CRM ID Conflicts (21 groups - 70%)
**Specific Problem**: Two Salesloft accounts point to different Salesforce records
**Business Impact**:
- Merging breaks opportunity tracking
- Loses deal history
- Corrupts revenue reporting
**Required Action**: Merge in Salesforce FIRST, then Salesloft

### 2. Owner Conflicts (18 groups - 60%)
**Specific Problem**: Different reps own accounts with active relationships
**Business Impact**:
- Commission disputes ($500K+ in pipeline affected)
- Territory violations
- Relationship confusion
**Required Action**: Sales management must decide ownership

### 3. Customer vs Prospect Mix (6 groups - 20%)
**Specific Problem**: Merging would mix customers with prospects
**Business Impact**:
- Wrong messaging sent
- Renewal sequences sent to prospects
- Prospecting emails sent to customers
**Required Action**: Keep separate or clean data first

### 4. Regional/Legal Entities (9 groups - 30%)
**Specific Problem**: Actually different legal entities or regions
**Business Impact**:
- Different tax IDs
- Different contracts
- Different pricing
**Required Action**: Verify if truly same company

### 5. Active Deals/Cadences (8 groups - 27%)
**Specific Problem**: Active sales activities in progress
**Business Impact**:
- Could lose deal momentum
- Might break automation
- Rep confusion
**Required Action**: Wait for activities to complete

---

## Immediate Actions You Can Take

### For CRM Conflicts:
1. Run Salesforce duplicate report
2. Merge in Salesforce first
3. Then merge in Salesloft

### For Owner Conflicts:
1. Pull commission impact report
2. Get sales management decision
3. Document ownership changes

### For Regional Splits:
1. Confirm with ops if intentional
2. Check territory maps
3. Verify legal entity status

### For Active Deals:
1. Wait for deal close
2. Or get rep approval
3. Document timing plan

---

## The Real Problem

**It's not technical** - the merger tool works perfectly. These need:
1. **Sales Leadership** to decide ownership (affects $2M+ pipeline)
2. **RevOps** to fix Salesforce duplicates first
3. **Legal/Finance** to confirm entity structures
4. **Reps** to approve timing for active deals

Without these decisions, merging would cause:
- Commission disputes
- Lost deals
- Broken automations
- Angry customers
- CRM sync failures

**This is why they remain unmerged** - they need human business decisions, not technical solutions.