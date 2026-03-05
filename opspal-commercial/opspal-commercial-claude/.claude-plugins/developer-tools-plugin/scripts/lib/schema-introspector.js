/**
 * Schema Introspector
 * Automatically retrieves schema definitions from various database systems
 *
 * Part of: Universal Schema Validator Implementation
 * ROI: $9,200/year | Effort: 13 hours | Payback: 4 weeks
 */

const { createClient } = require('@supabase/supabase-js');

class SchemaIntrospector {
  /**
   * Get schema definition from Supabase table
   * @param {Object} config - Supabase configuration
   * @param {string} tableName - Table name
   * @returns {Promise<Object>} Schema definition in JSON Schema format
   */
  async getSupabaseSchema(config, tableName) {
    const { url, serviceRoleKey } = config;

    if (!url || !serviceRoleKey) {
      throw new Error('Supabase URL and service role key required for schema introspection');
    }

    const supabase = createClient(url, serviceRoleKey);

    // Query information_schema to get table structure
    const { data: columns, error: columnsError } = await supabase
      .rpc('get_table_schema', { table_name: tableName });

    if (columnsError) {
      throw new Error(`Failed to fetch schema for ${tableName}: ${columnsError.message}`);
    }

    // Query constraints
    const { data: constraints, error: constraintsError } = await supabase
      .rpc('get_table_constraints', { table_name: tableName });

    if (constraintsError) {
      console.warn(`Could not fetch constraints for ${tableName}: ${constraintsError.message}`);
    }

    return this.buildSchemaFromPostgres(tableName, columns, constraints || []);
  }

  /**
   * Build JSON Schema from PostgreSQL information_schema data
   * @param {string} tableName - Table name
   * @param {Array} columns - Column definitions
   * @param {Array} constraints - Constraint definitions
   * @returns {Object} JSON Schema definition
   */
  buildSchemaFromPostgres(tableName, columns, constraints) {
    const schema = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      title: tableName,
      properties: {},
      required: [],
      unique: [],
      foreignKeys: [],
      checks: []
    };

    // Process columns
    columns.forEach(col => {
      const property = {
        type: this.mapPostgresType(col.data_type),
        nullable: col.is_nullable === 'YES'
      };

      // Add constraints
      if (col.character_maximum_length) {
        property.maxLength = col.character_maximum_length;
      }

      if (col.column_default) {
        property.default = this.parseDefaultValue(col.column_default);
      }

      // Format hints
      if (col.data_type === 'uuid') {
        property.format = 'uuid';
      } else if (col.data_type.includes('timestamp')) {
        property.format = 'date-time';
      }

      schema.properties[col.column_name] = property;

      // Required fields (NOT NULL without default)
      if (col.is_nullable === 'NO' && !col.column_default) {
        schema.required.push(col.column_name);
      }
    });

    // Process constraints
    constraints.forEach(constraint => {
      switch (constraint.constraint_type) {
        case 'UNIQUE':
          if (constraint.column_name) {
            schema.unique.push(constraint.column_name);
          }
          break;

        case 'FOREIGN KEY':
          schema.foreignKeys.push({
            field: constraint.column_name,
            references: {
              table: constraint.foreign_table_name,
              field: constraint.foreign_column_name
            }
          });
          break;

        case 'CHECK':
          schema.checks.push({
            name: constraint.constraint_name,
            expression: constraint.check_clause
          });
          break;
      }
    });

    return schema;
  }

  /**
   * Map PostgreSQL type to JSON Schema type
   */
  mapPostgresType(pgType) {
    const typeMap = {
      'integer': 'integer',
      'bigint': 'integer',
      'smallint': 'integer',
      'numeric': 'number',
      'real': 'number',
      'double precision': 'number',
      'character varying': 'string',
      'varchar': 'string',
      'text': 'string',
      'char': 'string',
      'uuid': 'string',
      'boolean': 'boolean',
      'timestamp': 'string',
      'timestamp with time zone': 'string',
      'timestamp without time zone': 'string',
      'date': 'string',
      'time': 'string',
      'json': 'object',
      'jsonb': 'object',
      'array': 'array',
      'ARRAY': 'array'
    };

    return typeMap[pgType] || 'string';
  }

  /**
   * Parse PostgreSQL default value
   */
  parseDefaultValue(defaultStr) {
    if (!defaultStr) return undefined;

    // Remove casting (::type)
    const cleaned = defaultStr.split('::')[0].trim();

    // Boolean values
    if (cleaned === 'true') return true;
    if (cleaned === 'false') return false;

    // Numeric values
    if (/^-?\d+$/.test(cleaned)) return parseInt(cleaned);
    if (/^-?\d+\.\d+$/.test(cleaned)) return parseFloat(cleaned);

    // String values (remove quotes)
    if (cleaned.startsWith("'") && cleaned.endsWith("'")) {
      return cleaned.slice(1, -1);
    }

    // Functions (like now(), gen_random_uuid()) - return as-is
    return cleaned;
  }

  /**
   * Get schema from JSON Schema file
   * @param {string} schemaPath - Path to JSON Schema file
   * @returns {Object} Schema definition
   */
  getSchemaFromFile(schemaPath) {
    const fs = require('fs');

    if (!fs.existsSync(schemaPath)) {
      throw new Error(`Schema file not found: ${schemaPath}`);
    }

    try {
      const schemaContent = fs.readFileSync(schemaPath, 'utf8');
      return JSON.parse(schemaContent);
    } catch (error) {
      throw new Error(`Failed to parse schema file ${schemaPath}: ${error.message}`);
    }
  }

  /**
   * Save schema definition to file
   * @param {Object} schema - Schema definition
   * @param {string} outputPath - Output file path
   */
  saveSchemaToFile(schema, outputPath) {
    const fs = require('fs');
    const path = require('path');

    // Ensure directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(outputPath, JSON.stringify(schema, null, 2));
    console.log(`✅ Schema saved to: ${outputPath}`);
  }

  /**
   * CLI entry point for schema introspection
   */
  async introspectCLI() {
    const args = process.argv.slice(2);

    if (args.length < 2) {
      console.log('Usage: node schema-introspector.js <database-type> <table-name> [output-path]');
      console.log('');
      console.log('Examples:');
      console.log('  node schema-introspector.js supabase reflections');
      console.log('  node schema-introspector.js supabase reflections ./schemas/reflections.json');
      console.log('');
      console.log('Environment variables:');
      console.log('  SUPABASE_URL - Supabase project URL');
      console.log('  SUPABASE_SERVICE_ROLE_KEY - Supabase service role key');
      process.exit(1);
    }

    const [dbType, tableName, outputPath] = args;

    try {
      let schema;

      if (dbType === 'supabase') {
        const config = {
          url: process.env.SUPABASE_URL,
          serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY
        };

        console.log(`🔍 Introspecting Supabase table: ${tableName}...`);
        schema = await this.getSupabaseSchema(config, tableName);
      } else {
        throw new Error(`Unsupported database type: ${dbType}`);
      }

      if (outputPath) {
        this.saveSchemaToFile(schema, outputPath);
      } else {
        console.log('\n📋 Schema definition:');
        console.log(JSON.stringify(schema, null, 2));
      }

      console.log('\n✅ Schema introspection complete');

      // Summary
      const propertyCount = Object.keys(schema.properties).length;
      const requiredCount = schema.required.length;
      const uniqueCount = schema.unique.length;
      const fkCount = schema.foreignKeys.length;

      console.log(`\n📊 Schema Summary:`);
      console.log(`  Table: ${tableName}`);
      console.log(`  Properties: ${propertyCount}`);
      console.log(`  Required: ${requiredCount}`);
      console.log(`  Unique: ${uniqueCount}`);
      console.log(`  Foreign Keys: ${fkCount}`);

    } catch (error) {
      console.error(`❌ Schema introspection failed: ${error.message}`);
      process.exit(1);
    }
  }
}

const introspector = new SchemaIntrospector();

// CLI execution
if (require.main === module) {
  introspector.introspectCLI();
}

module.exports = introspector;
