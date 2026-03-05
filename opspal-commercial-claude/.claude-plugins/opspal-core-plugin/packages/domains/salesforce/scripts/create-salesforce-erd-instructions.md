# Salesforce Standard Objects ERD - Manual Setup Instructions

## Document Created Successfully! ✅

**Edit URL:** https://lucid.app/lucidchart/b383c01e-8cc9-4300-9b41-f7f86afa640c/edit
**View URL:** https://lucid.app/lucidchart/b383c01e-8cc9-4300-9b41-f7f86afa640c/view

## Step-by-Step Instructions to Complete the ERD

Since the Lucid REST API doesn't support programmatic shape creation, please follow these steps to complete your ERD:

### 1. Open the Document
Click the Edit URL above to open the document in Lucidchart.

### 2. Access Entity Relationship Shapes
1. In the left panel, click on "Shapes"
2. Search for "Entity Relationship" or "ERD"
3. Select the ERD shape library

### 3. Create the Account Entity
1. Drag an "Entity" shape onto the canvas
2. Label it "Account"
3. Add these fields (click the entity and use the field editor):
   - `Id` (PK)
   - `Name`
   - `Type`
   - `Industry`
   - `AnnualRevenue`
   - `NumberOfEmployees`
   - `BillingCity`
   - `BillingState`
   - `OwnerId` (FK)

### 4. Create the Contact Entity
1. Drag another "Entity" shape onto the canvas (position to the right of Account)
2. Label it "Contact"
3. Add these fields:
   - `Id` (PK)
   - `FirstName`
   - `LastName`
   - `Email`
   - `Phone`
   - `Title`
   - `AccountId` (FK)
   - `Department`
   - `ReportsToId` (FK)

### 5. Create the Opportunity Entity
1. Drag an "Entity" shape below Account
2. Label it "Opportunity"
3. Add these fields:
   - `Id` (PK)
   - `Name`
   - `StageName`
   - `Amount`
   - `CloseDate`
   - `Probability`
   - `AccountId` (FK)
   - `Type`
   - `LeadSource`
   - `OwnerId` (FK)

### 6. Create the OpportunityContactRole Entity (Junction Object)
1. Drag an "Entity" shape between Contact and Opportunity
2. Label it "OpportunityContactRole"
3. Add these fields:
   - `Id` (PK)
   - `OpportunityId` (FK)
   - `ContactId` (FK)
   - `Role`
   - `IsPrimary`

### 7. Add Relationships

#### Account → Contact (One-to-Many)
1. Select the "Relationship" connector tool
2. Draw from Account to Contact
3. Set cardinality: One Account to Many Contacts
4. Label: "AccountId"

#### Account → Opportunity (One-to-Many)
1. Draw from Account to Opportunity
2. Set cardinality: One Account to Many Opportunities
3. Label: "AccountId"

#### Opportunity → OpportunityContactRole (One-to-Many)
1. Draw from Opportunity to OpportunityContactRole
2. Set cardinality: One Opportunity to Many OpportunityContactRoles
3. Label: "OpportunityId"

#### Contact → OpportunityContactRole (One-to-Many)
1. Draw from Contact to OpportunityContactRole
2. Set cardinality: One Contact to Many OpportunityContactRoles
3. Label: "ContactId"

### 8. Layout and Formatting

#### Recommended Layout:
```
        [Account]
           / \
          /   \
         /     \
   [Contact]  [Opportunity]
         \     /
          \   /
           \ /
  [OpportunityContactRole]
```

#### Color Coding (Optional):
- **Account**: Blue (#4A90E2) - Primary Business Entity
- **Contact**: Green (#7ED321) - People/User Entity
- **Opportunity**: Orange (#F5A623) - Transaction Entity
- **OpportunityContactRole**: Gray (#9B9B9B) - Junction Object

### 9. Add Annotations

Consider adding these annotations to explain the relationships:

1. **Account-Contact**: "An Account can have multiple Contacts (employees, stakeholders)"
2. **Account-Opportunity**: "An Account can have multiple sales Opportunities"
3. **OpportunityContactRole**: "Junction object defining which Contacts are involved in which Opportunities and their roles"

### 10. Final Touches

1. **Add a Title**: "Salesforce Standard Objects - Core CRM Model"
2. **Add a Legend**:
   - PK = Primary Key
   - FK = Foreign Key
   - 1:N = One-to-Many Relationship
3. **Include Metadata**:
   - Created Date: 2025-09-13
   - Version: 1.0
   - Purpose: Standard Salesforce CRM Object Model

## Alternative: Use a Template

If available in your Lucidchart account, look for:
1. Templates → Software → Database Design
2. Search for "CRM" or "Salesforce"
3. Use as a starting point and modify

## Validation Checklist

- [ ] All four entities created (Account, Contact, Opportunity, OpportunityContactRole)
- [ ] All primary keys (Id) marked
- [ ] All foreign keys properly identified
- [ ] Relationships show correct cardinality (1:N)
- [ ] Diagram is readable and well-organized
- [ ] Title and legend included

## Need Help?

The document is created and ready for your content. The Lucid REST API limitation means shapes must be added manually, but this ensures you have full control over the layout and design.

Once completed, this ERD will accurately represent the core Salesforce CRM data model that forms the foundation of most Salesforce implementations.