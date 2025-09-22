/**
 * Unified Record Model for Cross-Platform Operations
 * Provides a standard data structure that can represent records from both Salesforce and HubSpot
 */

class UnifiedRecord {
  constructor(data = {}) {
    // Core identification
    this.id = data.id || null;
    this.externalIds = data.externalIds || {};
    this.source = data.source || null; // 'salesforce' | 'hubspot' | 'manual'
    this.sourceId = data.sourceId || null;

    // Standard fields
    this.type = data.type || null; // 'contact', 'company', 'deal', etc.
    this.name = data.name || null;
    this.email = data.email || null;
    this.phone = data.phone || null;
    this.website = data.website || null;
    this.description = data.description || null;

    // Timestamps
    this.createdDate = data.createdDate || null;
    this.modifiedDate = data.modifiedDate || null;
    this.lastSyncDate = data.lastSyncDate || null;

    // Ownership
    this.ownerId = data.ownerId || null;
    this.ownerName = data.ownerName || null;

    // Status fields
    this.status = data.status || null;
    this.stage = data.stage || null;
    this.lifecycleStage = data.lifecycleStage || null;

    // Relationships
    this.parentId = data.parentId || null;
    this.parentType = data.parentType || null;
    this.associations = data.associations || [];

    // Address information
    this.address = data.address || {
      street: null,
      city: null,
      state: null,
      postalCode: null,
      country: null
    };

    // Custom fields (platform-specific)
    this.customFields = data.customFields || {};

    // Sync metadata
    this.syncStatus = data.syncStatus || 'pending';
    this.syncErrors = data.syncErrors || [];
    this.lastSyncAttempt = data.lastSyncAttempt || null;
    this.syncPriority = data.syncPriority || 0;

    // Data quality metrics
    this.dataQuality = data.dataQuality || {
      completeness: 0,
      accuracy: null,
      duplicateProbability: 0,
      validationErrors: []
    };

    // Audit trail
    this.history = data.history || [];
    this.mergedFromIds = data.mergedFromIds || [];
  }

  /**
   * Create from Salesforce record
   */
  static fromSalesforce(sfRecord, objectType) {
    const unified = new UnifiedRecord();

    unified.source = 'salesforce';
    unified.sourceId = sfRecord.Id;
    unified.type = this.mapSalesforceType(objectType);
    unified.externalIds.salesforce = sfRecord.Id;

    // Map common fields based on object type
    switch (objectType.toLowerCase()) {
      case 'contact':
        unified.name = `${sfRecord.FirstName || ''} ${sfRecord.LastName || ''}`.trim();
        unified.email = sfRecord.Email;
        unified.phone = sfRecord.Phone || sfRecord.MobilePhone;
        unified.ownerId = sfRecord.OwnerId;
        unified.parentId = sfRecord.AccountId;
        unified.parentType = 'account';
        break;

      case 'lead':
        unified.name = `${sfRecord.FirstName || ''} ${sfRecord.LastName || ''}`.trim();
        unified.email = sfRecord.Email;
        unified.phone = sfRecord.Phone || sfRecord.MobilePhone;
        unified.ownerId = sfRecord.OwnerId;
        unified.status = sfRecord.Status;
        unified.lifecycleStage = 'lead';
        break;

      case 'account':
        unified.name = sfRecord.Name;
        unified.phone = sfRecord.Phone;
        unified.website = sfRecord.Website;
        unified.ownerId = sfRecord.OwnerId;
        unified.parentId = sfRecord.ParentId;
        unified.parentType = 'account';
        break;

      case 'opportunity':
        unified.name = sfRecord.Name;
        unified.stage = sfRecord.StageName;
        unified.ownerId = sfRecord.OwnerId;
        unified.parentId = sfRecord.AccountId;
        unified.parentType = 'account';
        break;
    }

    // Map address
    if (sfRecord.MailingStreet || sfRecord.BillingStreet) {
      unified.address = {
        street: sfRecord.MailingStreet || sfRecord.BillingStreet,
        city: sfRecord.MailingCity || sfRecord.BillingCity,
        state: sfRecord.MailingState || sfRecord.BillingState,
        postalCode: sfRecord.MailingPostalCode || sfRecord.BillingPostalCode,
        country: sfRecord.MailingCountry || sfRecord.BillingCountry
      };
    }

    // Map timestamps
    unified.createdDate = sfRecord.CreatedDate;
    unified.modifiedDate = sfRecord.LastModifiedDate;

    // Store all other fields as custom
    const standardFields = ['Id', 'FirstName', 'LastName', 'Name', 'Email', 'Phone',
                           'MobilePhone', 'OwnerId', 'AccountId', 'ParentId', 'Status',
                           'StageName', 'CreatedDate', 'LastModifiedDate'];

    for (const [key, value] of Object.entries(sfRecord)) {
      if (!standardFields.includes(key) && value !== null) {
        unified.customFields[`sf_${key}`] = value;
      }
    }

    return unified;
  }

  /**
   * Create from HubSpot record
   */
  static fromHubSpot(hsRecord, objectType) {
    const unified = new UnifiedRecord();
    const properties = hsRecord.properties || {};

    unified.source = 'hubspot';
    unified.sourceId = hsRecord.id;
    unified.type = this.mapHubSpotType(objectType);
    unified.externalIds.hubspot = hsRecord.id;

    // Map common fields based on object type
    switch (objectType.toLowerCase()) {
      case 'contact':
        unified.name = `${properties.firstname || ''} ${properties.lastname || ''}`.trim();
        unified.email = properties.email;
        unified.phone = properties.phone || properties.mobilephone;
        unified.ownerId = properties.hubspot_owner_id;
        unified.lifecycleStage = properties.lifecyclestage;
        break;

      case 'company':
        unified.name = properties.name;
        unified.phone = properties.phone;
        unified.website = properties.domain || properties.website;
        unified.ownerId = properties.hubspot_owner_id;
        unified.description = properties.description;
        break;

      case 'deal':
        unified.name = properties.dealname;
        unified.stage = properties.dealstage;
        unified.ownerId = properties.hubspot_owner_id;
        unified.description = properties.description;
        break;
    }

    // Map address
    if (properties.address || properties.city) {
      unified.address = {
        street: properties.address,
        city: properties.city,
        state: properties.state,
        postalCode: properties.zip,
        country: properties.country
      };
    }

    // Map timestamps
    unified.createdDate = properties.createdate || hsRecord.createdAt;
    unified.modifiedDate = properties.lastmodifieddate || hsRecord.updatedAt;

    // Map associations
    if (hsRecord.associations) {
      for (const [type, associations] of Object.entries(hsRecord.associations)) {
        unified.associations.push(...associations.map(a => ({
          type: type,
          id: a.id,
          label: a.label
        })));
      }
    }

    // Store all other properties as custom
    const standardProps = ['firstname', 'lastname', 'email', 'phone', 'mobilephone',
                          'hubspot_owner_id', 'lifecyclestage', 'name', 'domain',
                          'website', 'description', 'dealname', 'dealstage', 'address',
                          'city', 'state', 'zip', 'country', 'createdate', 'lastmodifieddate'];

    for (const [key, value] of Object.entries(properties)) {
      if (!standardProps.includes(key) && value !== null) {
        unified.customFields[`hs_${key}`] = value;
      }
    }

    return unified;
  }

  /**
   * Convert to Salesforce format
   */
  toSalesforce(objectType) {
    const sfRecord = {};

    // Map back to Salesforce fields based on type
    switch (objectType.toLowerCase()) {
      case 'contact':
        if (this.name) {
          const nameParts = this.name.split(' ');
          sfRecord.FirstName = nameParts.slice(0, -1).join(' ');
          sfRecord.LastName = nameParts[nameParts.length - 1] || 'Unknown';
        }
        sfRecord.Email = this.email;
        sfRecord.Phone = this.phone;
        sfRecord.OwnerId = this.ownerId;
        sfRecord.AccountId = this.parentId;
        break;

      case 'lead':
        if (this.name) {
          const nameParts = this.name.split(' ');
          sfRecord.FirstName = nameParts.slice(0, -1).join(' ');
          sfRecord.LastName = nameParts[nameParts.length - 1] || 'Unknown';
        }
        sfRecord.Email = this.email;
        sfRecord.Phone = this.phone;
        sfRecord.OwnerId = this.ownerId;
        sfRecord.Status = this.status || 'Open';
        break;

      case 'account':
        sfRecord.Name = this.name;
        sfRecord.Phone = this.phone;
        sfRecord.Website = this.website;
        sfRecord.OwnerId = this.ownerId;
        sfRecord.ParentId = this.parentId;
        break;

      case 'opportunity':
        sfRecord.Name = this.name;
        sfRecord.StageName = this.stage || 'Prospecting';
        sfRecord.CloseDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        sfRecord.OwnerId = this.ownerId;
        sfRecord.AccountId = this.parentId;
        break;
    }

    // Map address fields
    if (this.address && this.address.street) {
      const addressPrefix = objectType === 'account' ? 'Billing' : 'Mailing';
      sfRecord[`${addressPrefix}Street`] = this.address.street;
      sfRecord[`${addressPrefix}City`] = this.address.city;
      sfRecord[`${addressPrefix}State`] = this.address.state;
      sfRecord[`${addressPrefix}PostalCode`] = this.address.postalCode;
      sfRecord[`${addressPrefix}Country`] = this.address.country;
    }

    // Add custom fields that start with sf_
    for (const [key, value] of Object.entries(this.customFields)) {
      if (key.startsWith('sf_')) {
        sfRecord[key.substring(3)] = value;
      }
    }

    // Add external ID if updating
    if (this.externalIds.salesforce) {
      sfRecord.Id = this.externalIds.salesforce;
    }

    return sfRecord;
  }

  /**
   * Convert to HubSpot format
   */
  toHubSpot(objectType) {
    const hsRecord = {
      properties: {}
    };

    // Map to HubSpot properties based on type
    switch (objectType.toLowerCase()) {
      case 'contact':
        if (this.name) {
          const nameParts = this.name.split(' ');
          hsRecord.properties.firstname = nameParts.slice(0, -1).join(' ');
          hsRecord.properties.lastname = nameParts[nameParts.length - 1] || '';
        }
        hsRecord.properties.email = this.email;
        hsRecord.properties.phone = this.phone;
        hsRecord.properties.hubspot_owner_id = this.ownerId;
        hsRecord.properties.lifecyclestage = this.lifecycleStage || 'subscriber';
        break;

      case 'company':
        hsRecord.properties.name = this.name;
        hsRecord.properties.phone = this.phone;
        hsRecord.properties.domain = this.website;
        hsRecord.properties.hubspot_owner_id = this.ownerId;
        hsRecord.properties.description = this.description;
        break;

      case 'deal':
        hsRecord.properties.dealname = this.name;
        hsRecord.properties.dealstage = this.stage || 'appointmentscheduled';
        hsRecord.properties.hubspot_owner_id = this.ownerId;
        hsRecord.properties.description = this.description;
        break;
    }

    // Map address
    if (this.address && this.address.street) {
      hsRecord.properties.address = this.address.street;
      hsRecord.properties.city = this.address.city;
      hsRecord.properties.state = this.address.state;
      hsRecord.properties.zip = this.address.postalCode;
      hsRecord.properties.country = this.address.country;
    }

    // Add custom fields that start with hs_
    for (const [key, value] of Object.entries(this.customFields)) {
      if (key.startsWith('hs_')) {
        hsRecord.properties[key.substring(3)] = value;
      }
    }

    // Add ID if updating
    if (this.externalIds.hubspot) {
      hsRecord.id = this.externalIds.hubspot;
    }

    // Add associations if present
    if (this.associations && this.associations.length > 0) {
      hsRecord.associations = this.associations;
    }

    return hsRecord;
  }

  /**
   * Calculate data completeness score
   */
  calculateCompleteness() {
    const requiredFields = ['name', 'email', 'phone'];
    const importantFields = ['address', 'ownerId', 'description'];

    let score = 0;
    let maxScore = 0;

    // Check required fields (weight: 2)
    for (const field of requiredFields) {
      maxScore += 2;
      if (this[field]) {
        score += 2;
      }
    }

    // Check important fields (weight: 1)
    for (const field of importantFields) {
      maxScore += 1;
      if (field === 'address') {
        if (this.address && this.address.street) {
          score += 1;
        }
      } else if (this[field]) {
        score += 1;
      }
    }

    // Check custom fields
    const customFieldCount = Object.keys(this.customFields).length;
    if (customFieldCount > 0) {
      score += Math.min(customFieldCount / 10, 1) * 5;
    }
    maxScore += 5;

    this.dataQuality.completeness = (score / maxScore) * 100;
    return this.dataQuality.completeness;
  }

  /**
   * Merge with another record
   */
  merge(otherRecord, strategy = 'newer') {
    const merged = new UnifiedRecord(this);

    // Merge based on strategy
    if (strategy === 'newer') {
      // Take non-null values from newer record
      const newer = this.modifiedDate > otherRecord.modifiedDate ? this : otherRecord;
      const older = this.modifiedDate > otherRecord.modifiedDate ? otherRecord : this;

      for (const [key, value] of Object.entries(newer)) {
        if (value !== null && value !== undefined) {
          merged[key] = value;
        } else if (older[key] !== null && older[key] !== undefined) {
          merged[key] = older[key];
        }
      }
    } else if (strategy === 'master') {
      // This record is master, only fill nulls from other
      for (const [key, value] of Object.entries(otherRecord)) {
        if ((merged[key] === null || merged[key] === undefined) && value !== null) {
          merged[key] = value;
        }
      }
    }

    // Merge external IDs
    merged.externalIds = { ...this.externalIds, ...otherRecord.externalIds };

    // Merge custom fields
    merged.customFields = { ...this.customFields, ...otherRecord.customFields };

    // Track merge history
    merged.mergedFromIds.push(otherRecord.sourceId);
    merged.history.push({
      action: 'merge',
      timestamp: new Date().toISOString(),
      mergedFrom: otherRecord.sourceId,
      strategy: strategy
    });

    return merged;
  }

  /**
   * Validate record data
   */
  validate() {
    const errors = [];

    // Check required fields based on type
    if (!this.type) {
      errors.push({ field: 'type', message: 'Record type is required' });
    }

    if (!this.name && this.type !== 'task') {
      errors.push({ field: 'name', message: 'Name is required' });
    }

    // Validate email format
    if (this.email && !this.isValidEmail(this.email)) {
      errors.push({ field: 'email', message: 'Invalid email format' });
    }

    // Validate phone format
    if (this.phone && !this.isValidPhone(this.phone)) {
      errors.push({ field: 'phone', message: 'Invalid phone format' });
    }

    // Validate URL format
    if (this.website && !this.isValidUrl(this.website)) {
      errors.push({ field: 'website', message: 'Invalid URL format' });
    }

    this.dataQuality.validationErrors = errors;
    return errors.length === 0;
  }

  // Helper methods

  static mapSalesforceType(sfType) {
    const typeMap = {
      'contact': 'contact',
      'lead': 'lead',
      'account': 'company',
      'opportunity': 'deal',
      'case': 'ticket',
      'task': 'task',
      'event': 'meeting'
    };
    return typeMap[sfType.toLowerCase()] || sfType.toLowerCase();
  }

  static mapHubSpotType(hsType) {
    const typeMap = {
      'contact': 'contact',
      'company': 'company',
      'deal': 'deal',
      'ticket': 'ticket',
      'task': 'task',
      'meeting': 'meeting'
    };
    return typeMap[hsType.toLowerCase()] || hsType.toLowerCase();
  }

  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  isValidPhone(phone) {
    const phoneRegex = /^[\d\s\-\+\(\)\.]+$/;
    return phoneRegex.test(phone) && phone.replace(/\D/g, '').length >= 10;
  }

  isValidUrl(url) {
    try {
      new URL(url.startsWith('http') ? url : `https://${url}`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clone the record
   */
  clone() {
    return new UnifiedRecord(JSON.parse(JSON.stringify(this)));
  }

  /**
   * Get a summary of the record
   */
  getSummary() {
    return {
      id: this.id,
      source: this.source,
      type: this.type,
      name: this.name,
      email: this.email,
      completeness: this.dataQuality.completeness,
      lastSync: this.lastSyncDate,
      syncStatus: this.syncStatus
    };
  }
}

module.exports = UnifiedRecord;