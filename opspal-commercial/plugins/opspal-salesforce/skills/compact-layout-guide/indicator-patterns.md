# Visual Indicator Patterns

## Overview

Visual indicators use formula fields with images to convey status information quickly in compact layouts. These "traffic light" patterns help users make fast decisions without reading text.

---

## Standard Image Paths

Salesforce provides built-in images you can reference:

### Color Flags
```
/img/samples/flag_green.gif
/img/samples/flag_yellow.gif
/img/samples/flag_red.gif
```

### Color Circles
```
/img/samples/color_green.gif
/img/samples/color_yellow.gif
/img/samples/color_red.gif
```

### Light Bulbs
```
/img/samples/light_green.gif
/img/samples/light_yellow.gif
/img/samples/light_red.gif
```

### Stars (ratings)
```
/img/samples/stars_100.gif  (full)
/img/samples/stars_200.gif
/img/samples/stars_300.gif
/img/samples/stars_400.gif
/img/samples/stars_500.gif
```

---

## Contact Indicators

### Do Not Call Indicator

**API Name:** `DoNotCall_Indicator__c`
**Object:** Contact, Lead

```
IF(DoNotCall,
   IMAGE("/img/samples/flag_red.gif", "Do Not Call", 16, 16),
   IMAGE("/img/samples/flag_green.gif", "OK to Call", 16, 16)
)
```

**Display:**
- Red flag: Do not call this contact
- Green flag: OK to call

---

### Email Opt-Out Indicator

**API Name:** `EmailOptOut_Indicator__c`
**Object:** Contact, Lead

```
IF(HasOptedOutOfEmail,
   IMAGE("/img/samples/flag_red.gif", "Email Opt Out", 16, 16),
   IMAGE("/img/samples/flag_green.gif", "OK to Email", 16, 16)
)
```

---

### Combined Contact Status

**API Name:** `Contact_Preferences__c`
**Object:** Contact, Lead

```
"Call: " &
IF(DoNotCall,
   IMAGE("/img/samples/flag_red.gif", "No", 12, 12),
   IMAGE("/img/samples/flag_green.gif", "Yes", 12, 12)
) &
" | Email: " &
IF(HasOptedOutOfEmail,
   IMAGE("/img/samples/flag_red.gif", "No", 12, 12),
   IMAGE("/img/samples/flag_green.gif", "Yes", 12, 12)
)
```

**Display:** "Call: [green] | Email: [red]"

---

### Fax Opt-Out (if applicable)

**API Name:** `FaxOptOut_Indicator__c`
**Object:** Contact, Lead

```
IF(HasOptedOutOfFax,
   IMAGE("/img/samples/flag_red.gif", "Fax Opt Out", 16, 16),
   IMAGE("/img/samples/flag_green.gif", "OK to Fax", 16, 16)
)
```

---

## Priority Indicators

### Case Priority

**API Name:** `Priority_Indicator__c`
**Object:** Case

```
CASE(Priority,
   "High", IMAGE("/img/samples/color_red.gif", "High Priority", 16, 16),
   "Medium", IMAGE("/img/samples/color_yellow.gif", "Medium Priority", 16, 16),
   "Low", IMAGE("/img/samples/color_green.gif", "Low Priority", 16, 16),
   IMAGE("/img/samples/color_green.gif", "Normal", 16, 16)
)
```

---

### Lead Rating

**API Name:** `Rating_Indicator__c`
**Object:** Lead

```
CASE(Rating,
   "Hot", IMAGE("/img/samples/color_red.gif", "Hot", 16, 16) & " Hot",
   "Warm", IMAGE("/img/samples/color_yellow.gif", "Warm", 16, 16) & " Warm",
   "Cold", IMAGE("/img/samples/color_green.gif", "Cold", 16, 16) & " Cold",
   ""
)
```

**Display:** "[red circle] Hot" or "[yellow circle] Warm" or "[green circle] Cold"

---

### Task Priority with Label

**API Name:** `Task_Priority_Indicator__c`
**Object:** Task

```
CASE(Priority,
   "High",
      IMAGE("/img/samples/flag_red.gif", "High", 12, 12) & " HIGH",
   "Normal",
      IMAGE("/img/samples/flag_yellow.gif", "Normal", 12, 12) & " NORMAL",
   "Low",
      IMAGE("/img/samples/flag_green.gif", "Low", 12, 12) & " LOW",
   ""
)
```

---

## Status Indicators

### Opportunity Stage Traffic Light

**API Name:** `Stage_Indicator__c`
**Object:** Opportunity

```
IF(
   CONTAINS("Prospecting:Qualification:Needs Analysis", StageName),
   IMAGE("/img/samples/color_yellow.gif", "Early Stage", 16, 16),
   IF(
      CONTAINS("Proposal:Negotiation", StageName),
      IMAGE("/img/samples/color_green.gif", "Active", 16, 16),
      IF(
         StageName = "Closed Won",
         IMAGE("/img/samples/color_green.gif", "Won", 16, 16),
         IF(
            StageName = "Closed Lost",
            IMAGE("/img/samples/color_red.gif", "Lost", 16, 16),
            IMAGE("/img/samples/color_yellow.gif", "In Progress", 16, 16)
         )
      )
   )
)
```

---

### Quote Status

**API Name:** `Quote_Status_Indicator__c`
**Object:** Quote

```
CASE(Status,
   "Draft", IMAGE("/img/samples/color_yellow.gif", "Draft", 16, 16) & " Draft",
   "Needs Review", IMAGE("/img/samples/color_yellow.gif", "Review", 16, 16) & " Needs Review",
   "In Review", IMAGE("/img/samples/color_yellow.gif", "In Review", 16, 16) & " In Review",
   "Approved", IMAGE("/img/samples/color_green.gif", "Approved", 16, 16) & " Approved",
   "Rejected", IMAGE("/img/samples/color_red.gif", "Rejected", 16, 16) & " Rejected",
   "Presented", IMAGE("/img/samples/color_green.gif", "Presented", 16, 16) & " Presented",
   "Accepted", IMAGE("/img/samples/color_green.gif", "Accepted", 16, 16) & " Accepted",
   "Denied", IMAGE("/img/samples/color_red.gif", "Denied", 16, 16) & " Denied",
   ""
)
```

---

### Active/Inactive Status

**API Name:** `Active_Indicator__c`
**Object:** Any with IsActive or Active__c

```
IF(IsActive,
   IMAGE("/img/samples/color_green.gif", "Active", 16, 16) & " Active",
   IMAGE("/img/samples/color_red.gif", "Inactive", 16, 16) & " Inactive"
)
```

---

## Health & Score Indicators

### Account Health Score (0-100)

**API Name:** `Health_Score_Indicator__c`
**Object:** Account (with Health_Score__c field)

```
IF(Health_Score__c >= 80,
   IMAGE("/img/samples/color_green.gif", "Healthy", 16, 16) & " " & TEXT(Health_Score__c),
   IF(Health_Score__c >= 50,
      IMAGE("/img/samples/color_yellow.gif", "At Risk", 16, 16) & " " & TEXT(Health_Score__c),
      IMAGE("/img/samples/color_red.gif", "Critical", 16, 16) & " " & TEXT(Health_Score__c)
   )
)
```

---

### NPS Score Indicator

**API Name:** `NPS_Indicator__c`
**Object:** Account, Contact (with NPS_Score__c)

```
IF(NPS_Score__c >= 9,
   IMAGE("/img/samples/color_green.gif", "Promoter", 16, 16) & " Promoter",
   IF(NPS_Score__c >= 7,
      IMAGE("/img/samples/color_yellow.gif", "Passive", 16, 16) & " Passive",
      IMAGE("/img/samples/color_red.gif", "Detractor", 16, 16) & " Detractor"
   )
)
```

---

### Star Rating (1-5)

**API Name:** `Star_Rating_Display__c`
**Object:** Any with Rating__c (1-5 number)

```
CASE(Rating__c,
   5, IMAGE("/img/samples/stars_500.gif", "5 Stars", 80, 16),
   4, IMAGE("/img/samples/stars_400.gif", "4 Stars", 80, 16),
   3, IMAGE("/img/samples/stars_300.gif", "3 Stars", 80, 16),
   2, IMAGE("/img/samples/stars_200.gif", "2 Stars", 80, 16),
   1, IMAGE("/img/samples/stars_100.gif", "1 Star", 80, 16),
   ""
)
```

---

## Date-Based Indicators

### Expiration Warning

**API Name:** `Expiration_Warning__c`
**Object:** Quote, Contract, any with expiration date

```
IF(ISBLANK(ExpirationDate), "",
   IF(ExpirationDate < TODAY(),
      IMAGE("/img/samples/flag_red.gif", "Expired", 16, 16) & " EXPIRED",
      IF(ExpirationDate <= TODAY() + 7,
         IMAGE("/img/samples/flag_yellow.gif", "Expiring Soon", 16, 16) & " Expires " & TEXT(ExpirationDate - TODAY()) & " days",
         IMAGE("/img/samples/flag_green.gif", "Active", 16, 16)
      )
   )
)
```

---

### Overdue Task Indicator

**API Name:** `Overdue_Indicator__c`
**Object:** Task

```
IF(IsClosed, "",
   IF(ActivityDate < TODAY(),
      IMAGE("/img/samples/flag_red.gif", "Overdue", 16, 16) & " OVERDUE",
      IF(ActivityDate = TODAY(),
         IMAGE("/img/samples/flag_yellow.gif", "Due Today", 16, 16) & " DUE TODAY",
         ""
      )
   )
)
```

---

## Best Practices

### Image Sizing

| Context | Recommended Size | Notes |
|---------|------------------|-------|
| Icon only | 16 × 16 | Standard indicator |
| With text | 12 × 12 | Smaller to fit with label |
| Star ratings | 80 × 16 | Wide for 5 stars |

### Formula Structure

1. **Keep formulas simple** - Complex nested IFs are hard to maintain
2. **Use CASE for multiple values** - Cleaner than nested IFs
3. **Include alt text** - Second parameter of IMAGE() for accessibility
4. **Test in compact layout** - Some formulas render differently

### Color Conventions

| Color | Meaning | Use For |
|-------|---------|---------|
| Green | Good/OK/Active | Safe to contact, healthy, won, active |
| Yellow | Caution/Warning | In progress, expiring soon, medium priority |
| Red | Alert/Stop/Problem | Do not contact, expired, lost, high priority |

### Testing Checklist

- [ ] Formula compiles without errors
- [ ] Images display in record detail
- [ ] Images display in compact layout
- [ ] Images display on mobile app
- [ ] Alt text is meaningful
- [ ] Formula handles blank values
