/**
 * Map Component
 *
 * Leaflet.js-based map component supporting markers, heat maps, and territories.
 *
 * @module web-viz/components/MapComponent
 * @version 1.0.0
 */

const BaseComponent = require('./BaseComponent');

// Load defaults
let defaults;
try {
  defaults = require('../../../config/web-viz-defaults.json');
} catch {
  defaults = { map: {} };
}

class MapComponent extends BaseComponent {
  /**
   * Create a map component
   * @param {Object} options - Map options
   */
  constructor(options = {}) {
    super('map', options);

    // Map-specific configuration
    this.config = {
      mapType: options.config?.mapType || 'markers', // markers, heatmap, territory
      center: options.config?.center || defaults.map?.center || [39.8283, -98.5795],
      zoom: options.config?.zoom || defaults.map?.zoom || 4,
      tileProvider: options.config?.tileProvider || 'openstreetmap',
      latField: options.config?.latField || 'lat',
      lngField: options.config?.lngField || 'lng',
      valueField: options.config?.valueField || 'value',
      labelField: options.config?.labelField || 'name',
      colorScale: options.config?.colorScale || ['#FEF3C7', '#FDE68A', '#FCD34D', '#F59E0B', '#D97706'],
      ...options.config
    };
  }

  /**
   * Map types
   */
  static MAP_TYPES = ['markers', 'heatmap', 'territory', 'choropleth'];

  /**
   * Set map data
   * @param {Array} data - Array of location objects
   * @param {Object} metadata - Data source metadata
   * @returns {MapComponent}
   */
  setData(data, metadata = {}) {
    if (!Array.isArray(data)) {
      throw new Error('Map data must be an array');
    }

    this.data = data;
    return super.setData(data, metadata);
  }

  /**
   * Get tile URL for provider
   * @private
   */
  _getTileUrl() {
    const tileUrls = defaults.map?.tileUrls || {
      openstreetmap: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
      'cartodb-light': 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
      'cartodb-dark': 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    };
    return tileUrls[this.config.tileProvider] || tileUrls.openstreetmap;
  }

  /**
   * Generate HTML for this map
   * @returns {string}
   */
  generateHTML() {
    const validation = this.validate();
    if (!validation.valid) {
      return `<div class="component-error">Map Error: ${validation.errors.join(', ')}</div>`;
    }

    return `
<div class="viz-component viz-map component-${this.id}" data-component-id="${this.id}" data-component-type="map">
  <div class="component-header">
    <h3 class="component-title">${this._escapeHtml(this.title)}</h3>
    ${this.description ? `<p class="component-description">${this._escapeHtml(this.description)}</p>` : ''}
  </div>
  <div class="component-content">
    <div id="${this.id}-map" class="map-container"></div>
  </div>
  ${this.config.showLegend !== false && this.config.mapType !== 'markers' ? `
  <div class="map-legend" id="${this.id}-legend"></div>
  ` : ''}
  ${this.dataSource ? `
  <div class="component-footer">
    <span class="data-info">${this.dataSource.recordCount || 0} locations</span>
    <span class="data-source">${this.dataSource.type || 'data'}</span>
  </div>
  ` : ''}
</div>`;
  }

  /**
   * Generate CSS for this map
   * @returns {string}
   */
  generateCSS() {
    return `
${super.generateCSS()}

.component-${this.id} .map-container {
  height: 400px;
  border-radius: var(--radius-md);
  overflow: hidden;
  z-index: 1;
}

.component-${this.id} .map-legend {
  margin-top: var(--spacing-md);
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  font-size: 12px;
}

.component-${this.id} .legend-gradient {
  height: 12px;
  width: 150px;
  border-radius: 2px;
}

.component-${this.id} .legend-labels {
  display: flex;
  justify-content: space-between;
  width: 150px;
  font-size: 11px;
  color: var(--color-text-muted);
}

.component-${this.id} .leaflet-popup-content-wrapper {
  border-radius: var(--radius-md);
}

.component-${this.id} .marker-popup {
  font-size: 13px;
}

.component-${this.id} .marker-popup strong {
  display: block;
  margin-bottom: 4px;
}
`;
  }

  /**
   * Generate JavaScript for this map
   * @returns {string}
   */
  generateJS() {
    const tileUrl = this._getTileUrl();
    const attribution = defaults.map?.attribution || '&copy; OpenStreetMap contributors';

    return `
(function() {
  const mapId = '${this.id}';
  const mapContainer = document.getElementById(mapId + '-map');
  if (!mapContainer) return;

  // Wait for Leaflet to load
  if (typeof L === 'undefined') {
    console.error('Leaflet not loaded');
    mapContainer.innerHTML = '<div class="component-error">Map library not loaded</div>';
    return;
  }

  const data = ${JSON.stringify(this.data)};
  const config = ${JSON.stringify(this.config)};

  // Initialize map
  const map = L.map(mapId + '-map').setView(config.center, config.zoom);

  // Add tile layer
  L.tileLayer('${tileUrl}', {
    attribution: '${attribution}',
    maxZoom: 18
  }).addTo(map);

  // Store reference
  window.VIZ_MAPS = window.VIZ_MAPS || {};
  window.VIZ_MAPS[mapId] = map;

  ${this._generateMapTypeJS()}

  // Fit bounds if data exists
  if (data.length > 0) {
    const bounds = [];
    data.forEach(item => {
      const lat = item[config.latField];
      const lng = item[config.lngField];
      if (lat != null && lng != null) {
        bounds.push([lat, lng]);
      }
    });
    if (bounds.length > 0) {
      map.fitBounds(bounds, { padding: [20, 20] });
    }
  }
})();
`;
  }

  /**
   * Generate map type-specific JavaScript
   * @private
   */
  _generateMapTypeJS() {
    switch (this.config.mapType) {
      case 'markers':
        return this._generateMarkersJS();
      case 'heatmap':
        return this._generateHeatmapJS();
      case 'territory':
      case 'choropleth':
        return this._generateChoroplethJS();
      default:
        return this._generateMarkersJS();
    }
  }

  /**
   * Generate markers JavaScript
   * @private
   */
  _generateMarkersJS() {
    return `
  // Add markers
  const markers = [];
  data.forEach(item => {
    const lat = item[config.latField];
    const lng = item[config.lngField];
    if (lat == null || lng == null) return;

    const label = item[config.labelField] || '';
    const value = item[config.valueField];

    const marker = L.marker([lat, lng]).addTo(map);

    // Popup content
    let popupContent = '<div class="marker-popup">';
    if (label) popupContent += '<strong>' + escapeHtml(label) + '</strong>';
    if (value != null) popupContent += '<span>Value: ' + formatValue(value) + '</span>';
    popupContent += '</div>';

    marker.bindPopup(popupContent);
    markers.push(marker);
  });

  // Helper functions
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatValue(val) {
    if (typeof val === 'number') {
      return val.toLocaleString();
    }
    return val;
  }
`;
  }

  /**
   * Generate heatmap JavaScript
   * @private
   */
  _generateHeatmapJS() {
    return `
  // Prepare heat data
  const heatData = [];
  let maxValue = 0;

  data.forEach(item => {
    const lat = item[config.latField];
    const lng = item[config.lngField];
    const value = parseFloat(item[config.valueField]) || 1;

    if (lat != null && lng != null) {
      heatData.push([lat, lng, value]);
      maxValue = Math.max(maxValue, value);
    }
  });

  // Check if heatmap plugin loaded
  if (typeof L.heatLayer !== 'undefined') {
    L.heatLayer(heatData, {
      radius: 25,
      blur: 15,
      maxZoom: 17,
      max: maxValue,
      gradient: {
        0.0: '${this.config.colorScale[0]}',
        0.25: '${this.config.colorScale[1]}',
        0.5: '${this.config.colorScale[2]}',
        0.75: '${this.config.colorScale[3]}',
        1.0: '${this.config.colorScale[4]}'
      }
    }).addTo(map);

    // Add legend
    const legendEl = document.getElementById(mapId + '-legend');
    if (legendEl) {
      legendEl.innerHTML = \`
        <span>Low</span>
        <div class="legend-gradient" style="background: linear-gradient(to right, ${this.config.colorScale.join(', ')})"></div>
        <span>High</span>
      \`;
    }
  } else {
    // Fallback to sized markers if heatmap plugin not loaded
    data.forEach(item => {
      const lat = item[config.latField];
      const lng = item[config.lngField];
      const value = parseFloat(item[config.valueField]) || 1;

      if (lat != null && lng != null) {
        const radius = Math.max(5, Math.min(30, (value / maxValue) * 30));
        L.circleMarker([lat, lng], {
          radius: radius,
          fillColor: '${this.config.colorScale[2]}',
          fillOpacity: 0.6,
          stroke: false
        }).addTo(map);
      }
    });
  }
`;
  }

  /**
   * Generate choropleth JavaScript
   * @private
   */
  _generateChoroplethJS() {
    return `
  // For choropleth, expect GeoJSON in data or a regions field
  const geoData = config.geoJSON || (data[0] && data[0].type === 'FeatureCollection' ? data[0] : null);

  if (geoData) {
    // Create value lookup
    const valueLookup = {};
    if (!geoData.type) {
      data.forEach(item => {
        const key = item[config.regionField || 'region'];
        valueLookup[key] = item[config.valueField];
      });
    }

    // Color scale function
    const colorScale = ${JSON.stringify(this.config.colorScale)};
    let minVal = Infinity, maxVal = -Infinity;

    if (geoData.features) {
      geoData.features.forEach(f => {
        const val = f.properties[config.valueField] || valueLookup[f.properties.name] || 0;
        minVal = Math.min(minVal, val);
        maxVal = Math.max(maxVal, val);
      });
    }

    function getColor(value) {
      if (maxVal === minVal) return colorScale[2];
      const ratio = (value - minVal) / (maxVal - minVal);
      const index = Math.floor(ratio * (colorScale.length - 1));
      return colorScale[Math.min(index, colorScale.length - 1)];
    }

    // Add GeoJSON layer
    L.geoJSON(geoData, {
      style: function(feature) {
        const value = feature.properties[config.valueField] || valueLookup[feature.properties.name] || 0;
        return {
          fillColor: getColor(value),
          weight: 1,
          opacity: 1,
          color: 'white',
          fillOpacity: 0.7
        };
      },
      onEachFeature: function(feature, layer) {
        const name = feature.properties.name || feature.properties[config.labelField] || '';
        const value = feature.properties[config.valueField] || valueLookup[feature.properties.name] || 0;
        layer.bindPopup('<div class="marker-popup"><strong>' + name + '</strong><br>Value: ' + value.toLocaleString() + '</div>');
      }
    }).addTo(map);

    // Add legend
    const legendEl = document.getElementById(mapId + '-legend');
    if (legendEl) {
      legendEl.innerHTML = \`
        <span>\${minVal.toLocaleString()}</span>
        <div class="legend-gradient" style="background: linear-gradient(to right, ${this.config.colorScale.join(', ')})"></div>
        <span>\${maxVal.toLocaleString()}</span>
      \`;
    }
  } else {
    // Fallback to markers if no GeoJSON
    ${this._generateMarkersJS()}
  }
`;
  }

  /**
   * Escape HTML entities
   * @private
   */
  _escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Validate map is ready to render
   * @returns {Object}
   */
  validate() {
    const base = super.validate();

    if (this.data && !Array.isArray(this.data)) {
      base.errors.push('Map data must be an array');
      base.valid = false;
    }

    if (!MapComponent.MAP_TYPES.includes(this.config.mapType)) {
      base.errors.push(`Unsupported map type: ${this.config.mapType}`);
      base.valid = false;
    }

    return base;
  }

  /**
   * Create from serialized state
   * @param {Object} json - Serialized map
   * @returns {MapComponent}
   */
  static deserialize(json) {
    const component = new MapComponent({
      id: json.id,
      title: json.title,
      description: json.description,
      position: json.position,
      config: json.config,
      filters: json.filters
    });
    component.data = json.data;
    component.dataSource = json.dataSource;
    component.created = json.created;
    component.updated = json.updated;
    return component;
  }
}

module.exports = MapComponent;
