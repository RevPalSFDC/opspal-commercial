/**
 * POST_FETCH_OPTIONS Function Template
 *
 * This function runs AFTER fetching options from your optionsUrl.
 * Use it to:
 * - Transform external API responses to HubSpot format
 * - Filter or sort options
 * - Add descriptions or metadata
 * - Handle nested/complex response structures
 *
 * INPUT (event object):
 * {
 *   options: [
 *     // Raw response from your optionsUrl
 *     // Could be any format depending on your API
 *   ],
 *   fieldDefinition: {
 *     name: "data_source",
 *     type: "enumeration"
 *   },
 *   object: {
 *     objectType: "CONTACT",
 *     objectId: "12345"
 *   }
 * }
 *
 * OUTPUT:
 * Return array of options in HubSpot format:
 * [
 *   {
 *     label: "Display Name",      // Required: shown in dropdown
 *     value: "unique_value",      // Required: stored value
 *     description: "Help text",   // Optional: shown as hint
 *     displayOrder: 1             // Optional: sort order
 *   }
 * ]
 *
 * EXAMPLES:
 * - See templates below for common patterns
 */

// ============================================================
// TEMPLATE 1: Simple Transformation
// ============================================================
exports.main = async (event) => {
  const { options } = event;

  // Transform array of objects to HubSpot format
  return options.map((item, index) => ({
    label: item.name || item.title || item.label,
    value: item.id || item.code || item.value,
    description: item.description,
    displayOrder: index + 1,
  }));
};

// ============================================================
// TEMPLATE 2: Nested Response Handling
// ============================================================
/*
exports.main = async (event) => {
  const { options } = event;

  // Handle nested API response structure
  // e.g., { data: { items: [...] } }
  const items = options.data?.items || options.results || options || [];

  return items.map((item, index) => ({
    label: item.name,
    value: String(item.id),
    description: `${item.category} - ${item.status}`,
    displayOrder: index + 1,
  }));
};
*/

// ============================================================
// TEMPLATE 3: Filtering and Sorting
// ============================================================
/*
exports.main = async (event) => {
  const { options, object } = event;

  // Filter options based on context
  const filteredOptions = options
    .filter((item) => {
      // Only show active items
      if (!item.active) return false;
      // Filter by record type if applicable
      if (item.supported_types && !item.supported_types.includes(object?.objectType)) {
        return false;
      }
      return true;
    })
    // Sort alphabetically
    .sort((a, b) => a.name.localeCompare(b.name));

  return filteredOptions.map((item, index) => ({
    label: item.name,
    value: item.id,
    displayOrder: index + 1,
  }));
};
*/

// ============================================================
// TEMPLATE 4: Grouped Options with Descriptions
// ============================================================
/*
exports.main = async (event) => {
  const { options } = event;

  // Create grouped/categorized options
  const result = [];
  let order = 1;

  // Group by category
  const grouped = {};
  options.forEach((item) => {
    const category = item.category || 'Other';
    if (!grouped[category]) grouped[category] = [];
    grouped[category].push(item);
  });

  // Flatten with category prefixes
  Object.entries(grouped).forEach(([category, items]) => {
    items.forEach((item) => {
      result.push({
        label: `[${category}] ${item.name}`,
        value: item.id,
        description: item.description || `Category: ${category}`,
        displayOrder: order++,
      });
    });
  });

  return result;
};
*/

// ============================================================
// TEMPLATE 5: Add Default/All Option
// ============================================================
/*
exports.main = async (event) => {
  const { options } = event;

  const transformedOptions = options.map((item, index) => ({
    label: item.name,
    value: item.id,
    displayOrder: index + 2, // Start at 2 for "All" option
  }));

  // Add "All" option at the beginning
  return [
    {
      label: 'All (Default)',
      value: 'all',
      description: 'Apply to all items',
      displayOrder: 1,
    },
    ...transformedOptions,
  ];
};
*/

// ============================================================
// TEMPLATE 6: Error Handling and Fallback
// ============================================================
/*
exports.main = async (event) => {
  const { options } = event;

  // Handle various error cases
  if (!options || !Array.isArray(options)) {
    return [
      {
        label: 'No options available',
        value: '_none',
        description: 'Options could not be loaded',
        displayOrder: 1,
      },
    ];
  }

  if (options.length === 0) {
    return [
      {
        label: 'No options found',
        value: '_empty',
        description: 'No options match current criteria',
        displayOrder: 1,
      },
    ];
  }

  // Handle error response from API
  if (options.error) {
    return [
      {
        label: 'Error loading options',
        value: '_error',
        description: options.error.message || 'Unknown error',
        displayOrder: 1,
      },
    ];
  }

  // Normal transformation
  return options.map((item, index) => ({
    label: item.name,
    value: item.id,
    displayOrder: index + 1,
  }));
};
*/

// ============================================================
// TEMPLATE 7: Status Indicators
// ============================================================
/*
exports.main = async (event) => {
  const { options } = event;

  // Add status indicators to labels
  const statusEmoji = {
    active: '✅',
    pending: '⏳',
    inactive: '❌',
    deprecated: '⚠️',
  };

  return options.map((item, index) => {
    const emoji = statusEmoji[item.status] || '';
    return {
      label: `${emoji} ${item.name}`,
      value: item.id,
      description: `Status: ${item.status}`,
      displayOrder: index + 1,
    };
  });
};
*/
