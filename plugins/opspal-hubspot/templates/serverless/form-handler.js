/**
 * HubSpot Serverless Function Template: Form Handler
 *
 * Processes form submissions and creates/updates contacts in HubSpot CRM.
 * Customize the properties mapping to match your form fields.
 *
 * Secrets required:
 * - HUBSPOT_ACCESS_TOKEN: Private app access token with contacts scope
 *
 * Usage:
 * 1. Copy to your project's src/app/app.functions/ directory
 * 2. Update serverless.json to register the endpoint
 * 3. Configure secrets in HubSpot portal
 * 4. Deploy with: hs project upload
 */

const hubspot = require('@hubspot/api-client');

exports.main = async (context, sendResponse) => {
  const { body, secrets } = context;

  // Validate required secrets
  if (!secrets.HUBSPOT_ACCESS_TOKEN) {
    console.log('Error: HUBSPOT_ACCESS_TOKEN secret not configured');
    return sendResponse({
      statusCode: 500,
      body: { error: 'Server configuration error' }
    });
  }

  // Initialize HubSpot client
  const hubspotClient = new hubspot.Client({
    accessToken: secrets.HUBSPOT_ACCESS_TOKEN
  });

  try {
    // Validate required fields
    if (!body.email) {
      return sendResponse({
        statusCode: 400,
        body: { error: 'Email is required' }
      });
    }

    // Map form fields to HubSpot properties
    const properties = {
      email: body.email,
      firstname: body.firstname || body.first_name || '',
      lastname: body.lastname || body.last_name || '',
      phone: body.phone || '',
      company: body.company || '',
      jobtitle: body.jobtitle || body.job_title || '',
      message: body.message || '',
      lifecyclestage: body.lifecyclestage || 'lead',
      // Add custom properties as needed
      // hs_lead_status: 'NEW',
    };

    // Remove empty properties
    Object.keys(properties).forEach(key => {
      if (properties[key] === '') delete properties[key];
    });

    // Check if contact exists
    let contactId;
    try {
      const searchResponse = await hubspotClient.crm.contacts.searchApi.doSearch({
        filterGroups: [{
          filters: [{
            propertyName: 'email',
            operator: 'EQ',
            value: body.email
          }]
        }],
        limit: 1
      });

      if (searchResponse.results.length > 0) {
        // Update existing contact
        contactId = searchResponse.results[0].id;
        await hubspotClient.crm.contacts.basicApi.update(contactId, { properties });
        console.log(`Updated contact: ${contactId}`);
      } else {
        // Create new contact
        const createResponse = await hubspotClient.crm.contacts.basicApi.create({ properties });
        contactId = createResponse.id;
        console.log(`Created contact: ${contactId}`);
      }
    } catch (searchError) {
      // If search fails, try to create (may be first contact)
      const createResponse = await hubspotClient.crm.contacts.basicApi.create({ properties });
      contactId = createResponse.id;
      console.log(`Created contact: ${contactId}`);
    }

    // Optional: Create a deal or note
    // await createFormSubmissionNote(hubspotClient, contactId, body);

    sendResponse({
      statusCode: 200,
      body: {
        success: true,
        contactId: contactId,
        message: 'Form submitted successfully'
      }
    });

  } catch (error) {
    console.log('Error processing form:', error.message);

    // Handle specific HubSpot API errors
    if (error.code === 409) {
      sendResponse({
        statusCode: 409,
        body: { error: 'Contact already exists with different data' }
      });
    } else {
      sendResponse({
        statusCode: 500,
        body: { error: 'Failed to process form submission' }
      });
    }
  }
};

/**
 * Optional: Create a note on the contact with form submission details
 */
async function createFormSubmissionNote(hubspotClient, contactId, formData) {
  const noteBody = `Form Submission:\n${JSON.stringify(formData, null, 2)}`;

  await hubspotClient.crm.objects.notes.basicApi.create({
    properties: {
      hs_note_body: noteBody,
      hs_timestamp: Date.now()
    },
    associations: [{
      to: { id: contactId },
      types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }]
    }]
  });
}
