# 01 - Screen Flow Automation Limits

## Purpose

Document the specific limitations of Screen Flow automation via Metadata API to set accurate expectations and prevent prompt-mismatch issues.

## Screen Flow Component Matrix

### Fully Automatable Components

| Component | XML Element | Notes |
|-----------|-------------|-------|
| Text Display | `<displayTextFields>` | Full content control |
| Text Input | `<inputFields>` | Label, required, default |
| Number Input | `<inputFields>` | Validation included |
| Date Input | `<inputFields>` | Format control |
| Checkbox (single) | `<inputFields>` | Boolean field |
| Radio Buttons | `<radioButtons>` | Static choices |
| Picklist (static) | `<choiceReferences>` | Predefined options |
| Long Text Area | `<inputFields>` | Character limits |
| Section Header | `<fieldDisplayTexts>` | Collapsible sections |

### Partially Automatable Components

| Component | What CAN Be Automated | What CANNOT Be Automated |
|-----------|----------------------|--------------------------|
| **Multi-Select Checkbox** | Choice definitions in XML | Visual layout, column arrangement |
| **Data Table** | Columns and fields | Row selection behavior, styling |
| **Dependent Picklists** | Field references | Dynamic choice population |
| **File Upload** | Field configuration | Custom upload handlers |
| **Address Input** | Field mapping | Autocomplete integration |

### Cannot Be Automated (UI Only)

| Component | Reason | Manual Step |
|-----------|--------|-------------|
| **Custom LWC in Flow** | Component reference only | Configure in Flow Builder |
| **Dynamic Record Choice** | Metadata limitation | Set up choice resource in UI |
| **Reactive Screen** | Complex state management | Configure in Flow Builder |
| **Stage Indicator** | Visual styling | Adjust in Flow Builder |
| **Slider Input** | Custom component | Install and configure |

## XML Syntax Reference

### Screen Element Structure

```xml
<screens>
    <name>Welcome_Screen</name>
    <label>Welcome</label>
    <showFooter>true</showFooter>
    <showHeader>true</showHeader>
    <fields>
        <name>Welcome_Text</name>
        <fieldType>DisplayText</fieldType>
        <fieldText>Welcome to the application process.</fieldText>
    </fields>
    <fields>
        <name>First_Name_Input</name>
        <fieldType>InputField</fieldType>
        <fieldText>First Name</fieldText>
        <inputParameters>
            <name>required</name>
            <value>true</value>
        </inputParameters>
        <isRequired>true</isRequired>
    </fields>
</screens>
```

### Known XML Limitations

#### 1. inputVariableAssignments Not Deployable

When a Screen Flow is invoked via Quick Action, variable assignments cannot be set via XML:

```xml
<!-- This CANNOT be deployed via Metadata API -->
<inputVariableAssignments>
    <name>recordId</name>
    <value>
        <elementReference>recordId</elementReference>
    </value>
</inputVariableAssignments>
```

**Workaround**: Deploy flow, then manually configure in Setup > Object > Quick Actions

#### 2. Dynamic Choice Components

```xml
<!-- Static choices work -->
<choices>
    <name>Choice_1</name>
    <choiceText>Option A</choiceText>
    <value>A</value>
</choices>

<!-- Dynamic choices require UI setup -->
<dynamicChoiceSets>
    <name>Account_Choices</name>
    <!-- Object, filter, display field must be set in UI -->
</dynamicChoiceSets>
```

#### 3. Data Table Column Configuration

```xml
<!-- Basic data table deploys -->
<fields>
    <fieldType>ComponentInstance</fieldType>
    <fieldText>Account List</fieldText>
    <componentName>flowruntime:datatable</componentName>
</fields>

<!-- But column visibility, sorting, selection mode need UI configuration -->
```

## Feasibility Assessment Workflow

### Step 1: Identify Flow Type

```
IF Flow Type = "Screen Flow"
  THEN Feasibility < 100% (proceed to Step 2)
ELSE
  Feasibility = 100% (fully automatable)
```

### Step 2: Inventory Screen Components

For each screen in the flow:

```javascript
function assessScreenFeasibility(screen) {
  const components = {
    fullyAuto: ['DisplayText', 'InputField', 'RadioButtons', 'Checkbox'],
    partialAuto: ['MultiSelectCheckboxes', 'DataTable', 'DependentPicklist'],
    manualOnly: ['CustomLWC', 'DynamicChoice', 'ReactiveScreen']
  };

  let autoCount = 0;
  let manualCount = 0;

  screen.fields.forEach(field => {
    if (components.fullyAuto.includes(field.fieldType)) {
      autoCount++;
    } else if (components.partialAuto.includes(field.fieldType)) {
      autoCount += 0.5;
      manualCount += 0.5;
    } else {
      manualCount++;
    }
  });

  return {
    feasibilityScore: (autoCount / (autoCount + manualCount)) * 100,
    requiresManualSteps: manualCount > 0
  };
}
```

### Step 3: Generate Expectation Report

```markdown
## Automation Feasibility Report

**Flow**: Create_Customer_Onboarding
**Type**: Screen Flow
**Screens**: 5

| Screen | Feasibility | Manual Steps Required |
|--------|-------------|----------------------|
| Welcome | 100% | None |
| Basic Info | 100% | None |
| Product Selection | 70% | Configure multi-select layout |
| Document Upload | 50% | Configure file handler |
| Confirmation | 100% | None |

**Overall Feasibility**: 84%
**Estimated Time**: Automated: 15 min | Manual: 20 min
```

## Manual Step Templates

### Template: Multi-Select Configuration

```
POST-DEPLOYMENT: Multi-Select Checkbox Configuration
Flow: [Flow Name]
Screen: [Screen Name]

Steps:
1. Open Flow in Flow Builder
2. Navigate to [Screen Name] screen
3. Select the Multi-Select Checkbox component
4. Configure:
   - Columns: [Number]
   - Layout: [Horizontal/Vertical]
   - Required: [Yes/No]
5. Save and Activate flow

Estimated Time: 5 minutes
```

### Template: Quick Action Variable Mapping

```
POST-DEPLOYMENT: Quick Action Variable Mapping
Quick Action: [Action Name]
Flow: [Flow Name]

Steps:
1. Go to Setup > Object Manager > [Object] > Buttons, Links, and Actions
2. Click [Action Name]
3. Under "Set Variable Values", configure:
   - recordId = {!Record.Id}
   - [Other variables as needed]
4. Save

Estimated Time: 3 minutes
```

## Success Criteria

- [ ] All Screen Flows assessed for component feasibility before work begins
- [ ] Feasibility score presented to user before acceptance
- [ ] Manual step templates provided for all non-automatable components
- [ ] Zero "I thought this would be fully automated" feedback
- [ ] Post-deployment checklists generated for hybrid workflows
