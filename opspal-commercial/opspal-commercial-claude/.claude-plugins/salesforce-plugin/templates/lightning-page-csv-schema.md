# Lightning Page Field Inventory - CSV Schema Documentation

**Version**: 1.0
**Created**: October 17, 2025
**Plugin**: salesforce-plugin
**Command**: /sfpageaudit

---

## Overview

This document defines the CSV file format produced by the Lightning Page Field Inventory analysis. CSVs are generated for each Lightning Record Page discovered in a Salesforce org.

## CSV File Format

### File Naming Convention

```
{PageDeveloperName}_fields.csv
```

**Examples**:
- `Opportunity_Record_Page_fields.csv`
- `Account_Sales_Layout_fields.csv`
- `Contact_Support_Page_fields.csv`

### Encoding

- **Character Encoding**: UTF-8
- **Line Endings**: LF (Unix-style)
- **Delimiter**: Comma (`,`)

### Header Row

All CSVs include a header row with these column names (case-sensitive):

```csv
Field_API_Name,Field_Label,Field_Type,Field_Classification,Help_Text,UI_Behavior
```

---

## Column Definitions

### 1. Field_API_Name

**Type**: String
**Required**: Yes
**Example Values**: `AccountId`, `Amount`, `Custom_Field__c`

**Description**: The Salesforce API name for the field. This is the unique identifier used in APIs, formulas, and code.

**Format**:
- Standard fields: Typically CamelCase (e.g., `AccountId`, `CloseDate`)
- Custom fields: Always end with `__c` (e.g., `Revenue_Type__c`, `Account_Executive__c`)

**Special Cases**:
- Compound fields may appear as individual components (e.g., `BillingStreet`, `BillingCity` instead of `BillingAddress`)
- Related object fields are not included (only fields directly on the current object)

---

### 2. Field_Label

**Type**: String
**Required**: Yes
**Example Values**: `Account ID`, `Amount`, `Custom Field`

**Description**: The human-readable label displayed in the Salesforce UI. This is what users see on the page.

**Characteristics**:
- Can contain spaces and special characters
- May be customized from default labels
- Subject to translation in multi-language orgs

**Empty Values**: Should not occur unless metadata retrieval failed

---

### 3. Field_Type

**Type**: String (Enumerated)
**Required**: Yes
**Example Values**: `reference`, `text`, `picklist`, `currency`, `date`

**Description**: The Salesforce data type of the field. Determines how data is stored and displayed.

**Common Values**:

| Type | Description | Example Use Cases |
|------|-------------|-------------------|
| `id` | Record ID | Opportunity ID, Record ID |
| `reference` | Lookup/Master-Detail | AccountId, OwnerId |
| `string` | Text field | Name, Description |
| `textarea` | Long text area | Notes, Comments |
| `picklist` | Single-select list | Stage, Status |
| `multipicklist` | Multi-select list | Products, Categories |
| `boolean` | Checkbox | IsWon, IsActive |
| `currency` | Money field | Amount, Revenue |
| `double` | Number (decimal) | Probability, Discount |
| `percent` | Percentage | Completion, Tax Rate |
| `int` | Integer | Count, Quantity |
| `date` | Date only | CloseDate, StartDate |
| `datetime` | Date and time | CreatedDate, LastModifiedDate |
| `email` | Email address | Email |
| `phone` | Phone number | Phone, MobilePhone |
| `url` | Web address | Website |
| `address` | Compound address | BillingAddress, ShippingAddress |
| `location` | Geolocation | Location__c |

**Full Reference**: See [Appendix A: Complete Field Type Reference](#appendix-a-complete-field-type-reference)

---

### 4. Field_Classification

**Type**: String (Enumerated)
**Required**: Yes
**Allowed Values**: `Standard`, `Custom`

**Description**: Indicates whether the field is a Salesforce standard field or a custom field created by administrators.

**Classification Rules**:
- **Standard**: Field provided by Salesforce out-of-the-box
  - Examples: `AccountId`, `Amount`, `CloseDate`, `Name`
  - Do not end with `__c`
  - Available in all orgs (unless deprecated)

- **Custom**: Field created by administrators or deployed via packages
  - Examples: `Revenue_Type__c`, `Account_Executive__c`
  - Always end with `__c`
  - Specific to this org or installed package

**Use Cases**:
- Identifying org customization extent
- Planning for org-to-org migrations
- Estimating upgrade complexity

---

### 5. Help_Text

**Type**: String
**Required**: No (can be empty)
**Example Values**:
- `Enter the primary account for this opportunity`
- `Select the expected close date for forecasting`
- (empty string if no help text)

**Description**: Field-level help text configured by administrators. Displayed to users as inline help or tooltips.

**Characteristics**:
- Can be empty/null if no help text configured
- May contain special characters and formatting
- Subject to translation in multi-language orgs
- Useful for training and data quality initiatives

**Empty Values**:
- Represented as empty string (`""`) in CSV
- Common for standard fields without customized help text
- Opportunity for documentation improvement if coverage is low

---

### 6. UI_Behavior

**Type**: String (Enumerated)
**Required**: Yes
**Allowed Values**: `required`, `readonly`, `none`

**Description**: How the field behaves on the Lightning Page in terms of user interaction.

**Behavior Types**:

| Value | Description | User Experience |
|-------|-------------|-----------------|
| `required` | Field must be filled before saving | Red asterisk (*), cannot save without value |
| `readonly` | Field is visible but cannot be edited | Grayed out, display-only |
| `none` | Standard editable field | Normal input, no special restrictions |

**Important Notes**:
- `required` on Lightning Page **does not** mean field-level required
- Page-level requirements supplement field-level validation
- Readonly on page may differ from field-level readonly settings
- Behavior can vary by record type or page assignment

**Use Cases**:
- Understanding user data entry workflows
- Identifying friction points (too many required fields)
- Documenting field editability by page

---

## Sample CSV

### Example: Opportunity_Record_Page_fields.csv

```csv
Field_API_Name,Field_Label,Field_Type,Field_Classification,Help_Text,UI_Behavior
AccountId,Account ID,reference,Standard,,required
Amount,Amount,currency,Standard,,required
CloseDate,Close Date,date,Standard,Expected close date for this opportunity,required
Name,Opportunity Name,string,Standard,,required
Probability,Probability (%),percent,Standard,,none
StageName,Stage,picklist,Standard,,required
Account_Executive__c,Account Executive,reference,Custom,Who is the Account executive helping with this deal?,none
Custom_Notes__c,Custom Notes,textarea,Custom,Enter any special notes or requirements,none
Revenue_Type__c,Revenue Type,picklist,Custom,Classification for revenue recognition,none
```

### Parsing Example (Python)

```python
import csv

with open('Opportunity_Record_Page_fields.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    for row in reader:
        print(f"{row['Field_Label']} ({row['Field_API_Name']})")
        print(f"  Type: {row['Field_Type']}")
        print(f"  Classification: {row['Field_Classification']}")
        print(f"  UI Behavior: {row['UI_Behavior']}")
        if row['Help_Text']:
            print(f"  Help: {row['Help_Text']}")
```

---

## Common Use Cases

### 1. Training Material Generation

Extract field labels and help text to create user guides:

```python
import csv

with open('fields.csv') as f:
    reader = csv.DictReader(f)
    required_fields = [row for row in reader if row['UI_Behavior'] == 'required']

print("Required Fields on This Page:")
for field in required_fields:
    print(f"- **{field['Field_Label']}**: {field['Help_Text'] or 'No help text'}")
```

### 2. Migration Planning

Identify custom fields that need special handling:

```python
import csv

custom_fields = []
with open('fields.csv') as f:
    reader = csv.DictReader(f)
    custom_fields = [row for row in reader if row['Field_Classification'] == 'Custom']

print(f"Total custom fields on page: {len(custom_fields)}")
```

### 3. Data Quality Analysis

Find fields without help text:

```python
import csv

missing_help = []
with open('fields.csv') as f:
    reader = csv.DictReader(f)
    missing_help = [row for row in reader if not row['Help_Text'].strip()]

print(f"Fields without help text: {len(missing_help)}")
```

---

## Validation Rules

### CSV File Validation

**Valid CSV Must Have**:
- UTF-8 encoding
- Header row matching exact column names
- At least one data row (empty CSVs indicate parsing error)
- All required columns present
- No duplicate `Field_API_Name` values

**Validation Script**:

```python
import csv

def validate_csv(csv_path):
    """Validate Lightning Page field inventory CSV"""

    required_columns = [
        'Field_API_Name',
        'Field_Label',
        'Field_Type',
        'Field_Classification',
        'Help_Text',
        'UI_Behavior'
    ]

    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)

        # Check header
        if set(required_columns) != set(reader.fieldnames):
            print(f"❌ Invalid header. Expected: {required_columns}")
            return False

        # Check rows
        row_count = 0
        field_names = set()

        for row in reader:
            row_count += 1

            # Check for duplicate API names
            if row['Field_API_Name'] in field_names:
                print(f"❌ Duplicate field: {row['Field_API_Name']}")
                return False
            field_names.add(row['Field_API_Name'])

            # Validate UI_Behavior
            if row['UI_Behavior'] not in ['required', 'readonly', 'none']:
                print(f"❌ Invalid UI_Behavior: {row['UI_Behavior']} for {row['Field_API_Name']}")
                return False

            # Validate Field_Classification
            if row['Field_Classification'] not in ['Standard', 'Custom']:
                print(f"❌ Invalid classification: {row['Field_Classification']} for {row['Field_API_Name']}")
                return False

        if row_count == 0:
            print("❌ CSV is empty (no data rows)")
            return False

        print(f"✓ CSV is valid ({row_count} fields)")
        return True
```

---

## Appendix A: Complete Field Type Reference

### Standard Field Types

| Type | Storage | UI Display | Common Use Cases |
|------|---------|------------|------------------|
| `id` | 18-char string | Read-only ID | Record identifiers |
| `reference` | 18-char string | Lookup field | Relationships to other objects |
| `string` | Text (255 chars) | Text input | Names, short descriptions |
| `textarea` | Text (32K chars) | Text area | Long descriptions, notes |
| `picklist` | String | Dropdown | Status, Stage, Category |
| `multipicklist` | Semicolon-separated | Multi-select | Tags, Categories |
| `boolean` | True/False | Checkbox | Flags, Yes/No questions |
| `currency` | Decimal | Currency input | Money amounts |
| `double` | Decimal | Number input | Quantities, percentages |
| `percent` | Decimal | Percentage input | Probabilities, rates |
| `int` | Integer | Number input | Counts, whole numbers |
| `date` | Date only | Date picker | Close dates, start dates |
| `datetime` | Date + time | Date-time picker | Timestamps |
| `time` | Time only | Time picker | Meeting times |
| `email` | String | Email input | Email addresses |
| `phone` | String | Phone input | Phone numbers |
| `url` | String | URL input | Websites, links |
| `address` | Compound | Address widget | Billing/shipping addresses |
| `location` | Lat/Long | Map widget | Geolocation coordinates |
| `encryptedstring` | Encrypted text | Masked input | Sensitive data (SSN, etc.) |
| `base64` | Binary data | N/A | File attachments |

### Compound Field Types

These appear as individual fields in the CSV:

| Compound Type | Component Fields | Example |
|---------------|------------------|---------|
| `address` | Street, City, State, PostalCode, Country | `BillingStreet`, `BillingCity` |
| `location` | Latitude, Longitude | `Location__Latitude__s`, `Location__Longitude__s` |
| `Name` | FirstName, LastName, Salutation | `FirstName`, `LastName` (Contact/Lead) |

---

## Appendix B: Troubleshooting

### Issue: Empty Field_Label

**Cause**: Metadata retrieval failed for this field

**Solution**:
1. Verify field exists in Salesforce
2. Check API version compatibility
3. Re-run `/sfpageaudit` command

### Issue: Unexpected Field_Type Value

**Cause**: Custom field type or package-managed field

**Solution**: Refer to Salesforce documentation for the specific field type

### Issue: Duplicate Field_API_Name

**Cause**: FlexiPage XML contains same field multiple times (different sections)

**Solution**: This is expected; extract-flexipage-fields.py deduplicates automatically

### Issue: Missing Custom Fields

**Cause**: Field not on Lightning Page or page not retrieved

**Solution**: Verify field is on the page in Lightning App Builder

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-10-17 | Initial schema documentation |

---

**Maintained by**: RevPal Operations Team
**Plugin**: salesforce-plugin
**Command**: /sfpageaudit
