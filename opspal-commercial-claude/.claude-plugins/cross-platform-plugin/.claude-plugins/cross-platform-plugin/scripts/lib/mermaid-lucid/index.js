/**
 * Mermaid to Lucid Integration - Entry Point
 *
 * This module provides the main interface for converting Mermaid diagrams
 * to Lucidchart Standard Import JSON format.
 */

const { convertMermaidToLucid } = require('./mermaid-to-lucid-json-converter');
const { detectDiagramType } = require('./mermaid-parser-utils');
const { createDocumentFromJSON, createShareLink, exportDocumentAsPNG } = require('./lucid-import-api-client');

module.exports = {
  // Core converter
  convertMermaidToLucid,

  // Diagram type detection
  detectDiagramType,

  // Lucidchart API operations
  createDocumentFromJSON,
  createShareLink,
  exportDocumentAsPNG,

  // Metadata
  IMPLEMENTATION_COMPLETE: true,
  VERSION: '1.0.0'
};
