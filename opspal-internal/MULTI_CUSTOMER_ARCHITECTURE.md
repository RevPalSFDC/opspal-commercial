# Multi-Customer Instance Pairing Architecture

## Overview

A comprehensive system for managing multiple customer projects across different Salesforce and HubSpot instance pairings, with proper isolation, credential management, and operation tracking.

## ✅ Implemented Components

### 1. Instance Pairing Registry (`platforms/instance-pairings.json`)
Central registry tracking all customer configurations:
- **8 Customers**: Rentable, RevPal, Wedgewood, Peregrine, FilmHub, NeonOne, BlueRabbit, OpsPal
- **Instance Mappings**: SF ↔ HS pairings per environment
- **Sync Configuration**: Which pairings have sync enabled
- **Feature Flags**: Per-customer operation enablement

### 2. Instance Context Manager (`cross-platform-ops/lib/instance-context-manager.js`)
Core module for managing customer contexts:
- **Context Switching**: `switchContext(customer, environment)`
- **Credential Management**: Automatic .env file loading
- **Instance Validation**: SF org and HS API connectivity checks
- **Discovery API**: Find instances by platform, sync status, environment
- **Statistics Tracking**: Customer and platform usage metrics

### 3. Enhanced CLI (`cross-platform-ops/cli/customer-commands.js`)
New customer management commands:
```bash
xplat customer switch <customer> [environment]  # Switch context
xplat customer list [-v]                        # List all customers
xplat customer status                           # Show current context
xplat customer validate <customer> [env]        # Validate pairing
xplat customer info <customer>                  # Show details
xplat customer find [options]                   # Search instances
xplat customer stats                            # Show statistics
```

### 4. Enhanced Environment Configuration (`.env.template`)
Extended template with new fields:
- `CUSTOMER_NAME`: Customer identifier
- `CUSTOMER_DISPLAY_NAME`: Display name
- `ENVIRONMENT_TYPE`: production/sandbox/uat/dev
- `INSTANCE_PAIRING_ID`: Unique pairing ID
- `SYNC_PARTNER_INSTANCES`: Linked instances

## 🏗️ Architecture Benefits

### 1. **Isolation & Security**
- Each customer has isolated credentials
- No cross-customer data contamination
- Environment-specific access controls
- Audit trail per customer

### 2. **Scalability**
- Easy to add new customers
- Support for multiple environments per customer
- Flexible platform combinations (SF-only, HS-only, both)
- Extensible to other platforms

### 3. **Efficiency**
- Quick context switching between customers
- Automatic credential loading
- Shared operation templates
- Batch operations across customers

### 4. **Visibility**
- Clear view of all customer configurations
- Instance pairing validation
- Usage statistics and metrics
- Operation tracking per customer

## 📊 Current Statistics

### Customer Distribution
- **Total Customers**: 8
- **Active**: 7 (OpsPal in maintenance)
- **With Salesforce**: 7
- **With HubSpot**: 3
- **With Both Platforms**: 2 (Rentable, RevPal)
- **Sync Enabled**: 2 pairings

### Environment Coverage
- **Production**: 8 customers
- **Sandbox**: 2 customers
- **UAT**: 1 customer
- **Staging**: 1 customer

## 🚀 Usage Examples

### Switch to Customer Context
```bash
# Switch to Rentable production
xplat customer switch rentable production

# Switch to Wedgewood UAT
xplat customer switch wedgewood uat
```

### View Customer Information
```bash
# List all customers
xplat customer list

# Show current context
xplat customer status

# Get customer details
xplat customer info rentable
```

### Find Instances
```bash
# Find all sync-enabled instances
xplat customer find --sync

# Find all Salesforce instances
xplat customer find -p salesforce

# Find production environments
xplat customer find -e production
```

### Validate Configuration
```bash
# Validate Rentable production pairing
xplat customer validate rentable production
```

## 🔄 Next Steps

### Recommended Enhancements
1. **Create Customer Workspaces**: Organize configs/operations per customer
2. **Implement Pairing Validator**: Pre-operation validation system
3. **Add Operation Templates**: Standardized cross-customer operations
4. **Build Monitoring Dashboard**: Real-time visibility across customers
5. **Create Migration Scripts**: Move existing configs to new structure

### Future Features
- Web UI for customer management
- Automated customer onboarding
- Cross-customer reporting
- Bulk operation scheduling
- Advanced permission management

## 📝 Configuration Files

### Instance Pairing Registry Structure
```json
{
  "customers": {
    "<customer-id>": {
      "name": "Display Name",
      "status": "active|maintenance",
      "salesforce": { "env": "instance" },
      "hubspot": { "env": "instance" },
      "pairings": {
        "environment": {
          "sf": "sf-instance",
          "hs": "hs-instance",
          "sync_enabled": true,
          "primary": true
        }
      }
    }
  }
}
```

### Customer Context Structure
```json
{
  "customer": "customer-id",
  "environment": "production",
  "instances": {
    "salesforce": "sf-alias",
    "hubspot": "hs-portal"
  },
  "syncEnabled": true,
  "configurations": {},
  "activatedAt": "ISO-8601"
}
```

## 🔒 Security Considerations

1. **Credential Isolation**: Each customer uses separate .env files
2. **Access Control**: Environment-based restrictions
3. **Audit Logging**: All context switches are logged
4. **Validation**: Instance connectivity verified before operations
5. **No Hardcoding**: All credentials externalized

## 📚 Documentation

- **Instance Pairing Registry**: `platforms/instance-pairings.json`
- **Context Manager**: `cross-platform-ops/lib/instance-context-manager.js`
- **CLI Commands**: `cross-platform-ops/cli/customer-commands.js`
- **Environment Template**: `cross-platform-ops/.env.template`

## 🎯 Success Metrics

✅ **8 customers** configured and tracked
✅ **15 SF instances** mapped
✅ **3 HS instances** mapped
✅ **Automatic context switching** implemented
✅ **Instance validation** functional
✅ **CLI integration** complete
✅ **Statistics tracking** operational

---

*Multi-Customer Instance Pairing Architecture v1.0*
*Implemented: 2025-09-21*