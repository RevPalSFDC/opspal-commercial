# Salesloft Domain Cleanup Guide

## The Problem
Companies are being created with malformed domains like:
- `https://www.tlrgroup.com/` (includes protocol and www)
- `www.example.com` (includes www)
- `http://company.com/` (includes protocol and trailing slash)

These cause duplicate key violations in the database.

## Quick Fix Process

### 1. Find Affected Companies
In Salesloft Companies tab, use these searches:
- Search: "https://"
- Search: "http://"
- Search: "www."

### 2. Fix Each Company
For each company with a malformed domain:
1. Click Edit
2. Change domain from: `https://www.tlrgroup.com/`
3. Change domain to: `tlrgroup.com`
4. Save

### 3. Prevent Future Issues

#### In Salesloft Settings:
- **Import Settings** → Enable "Clean Domains"
- **CRM Settings** → Check Website field mapping

#### In Salesforce:
Check if Website fields contain full URLs instead of just domains:
```sql
SELECT Id, Name, Website
FROM Account
WHERE Website LIKE 'http%'
   OR Website LIKE 'www.%'
LIMIT 10
```

If Salesforce has full URLs, you need to:
1. Clean them in Salesforce, OR
2. Add a formula field that extracts just the domain

### 4. Bulk Cleanup Script

If you have many companies with this issue, you can:
1. Export companies from Salesloft
2. Clean domains in spreadsheet:
   - Remove `https://`, `http://`
   - Remove `www.`
   - Remove trailing `/`
3. Re-import with cleaned domains

## Domain Format Rules

✅ **Correct Format:**
- `tlrgroup.com`
- `subdomain.company.com`
- `example.co.uk`

❌ **Incorrect Format:**
- `https://www.tlrgroup.com/`
- `www.tlrgroup.com`
- `http://example.com`
- `//company.com`

## Error Prevention Checklist

- [ ] Domain cleaning enabled in Import Settings
- [ ] CRM field mapping verified
- [ ] No duplicate companies with same domain
- [ ] Domains are lowercase
- [ ] No special characters except dots and hyphens
- [ ] No protocols (http/https)
- [ ] No www prefix
- [ ] No trailing slashes

## When This Error Occurs

The PostgreSQL error happens when:
1. Creating a new person with company domain
2. Updating a person's company
3. Importing from CSV
4. Syncing from CRM
5. API calls creating companies

The database enforces uniqueness on (domain, team_id) to prevent duplicate companies.