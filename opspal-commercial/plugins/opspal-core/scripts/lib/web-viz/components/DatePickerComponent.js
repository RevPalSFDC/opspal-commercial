/**
 * Date Picker Component
 *
 * Interactive date picker with fiscal year awareness, quarter shortcuts,
 * and flexible date formatting. Perfect for deal close dates.
 *
 * @module web-viz/components/DatePickerComponent
 * @version 1.0.0
 */

const BaseComponent = require('./BaseComponent');

class DatePickerComponent extends BaseComponent {
  /**
   * Create a date picker component
   * @param {Object} options - Date picker options
   */
  constructor(options = {}) {
    super('date-picker', options);

    this.config = {
      defaultValue: options.config?.defaultValue || null, // ISO date string or Date
      minDate: options.config?.minDate || null,
      maxDate: options.config?.maxDate || null,
      format: options.config?.format || 'YYYY-MM-DD', // Display format
      locale: options.config?.locale || 'en-US',
      label: options.config?.label || options.title || '',
      placeholder: options.config?.placeholder || 'Select a date',
      required: options.config?.required ?? false,
      disabled: options.config?.disabled ?? false,
      clearable: options.config?.clearable ?? true,
      showQuarters: options.config?.showQuarters ?? true, // Fiscal quarter shortcuts
      showToday: options.config?.showToday ?? true,
      fiscalYearStart: options.config?.fiscalYearStart || 1, // Month (1-12), 1 = Jan
      weekStartsOn: options.config?.weekStartsOn ?? 0, // 0 = Sunday
      onChange: options.config?.onChange || null,
      helpText: options.config?.helpText || '',
      size: options.config?.size || 'medium',
      ...options.config
    };

    // Current date state
    const defaultDate = this._parseDate(this.config.defaultValue);
    this.data = {
      selectedDate: defaultDate,
      viewYear: defaultDate ? defaultDate.getFullYear() : new Date().getFullYear(),
      viewMonth: defaultDate ? defaultDate.getMonth() : new Date().getMonth(),
      isOpen: false
    };
  }

  /**
   * Parse various date inputs to Date object
   * @private
   */
  _parseDate(value) {
    if (!value) return null;
    if (value instanceof Date) return value;
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  /**
   * Set the selected date
   * @param {Date|string} date
   * @returns {DatePickerComponent}
   */
  setDate(date) {
    const parsed = this._parseDate(date);
    this.data.selectedDate = parsed;
    if (parsed) {
      this.data.viewYear = parsed.getFullYear();
      this.data.viewMonth = parsed.getMonth();
    }
    this.updated = new Date().toISOString();
    return this;
  }

  /**
   * Format date for display
   * @param {Date} date
   * @returns {string}
   */
  formatDate(date) {
    if (!date) return '';

    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    const d = date.getDate();

    // Simple format replacement
    return this.config.format
      .replace('YYYY', y)
      .replace('YY', String(y).slice(-2))
      .replace('MM', String(m).padStart(2, '0'))
      .replace('M', m)
      .replace('DD', String(d).padStart(2, '0'))
      .replace('D', d);
  }

  /**
   * Format date as ISO string (for data)
   * @param {Date} date
   * @returns {string}
   */
  toISODate(date) {
    if (!date) return null;
    return date.toISOString().split('T')[0];
  }

  /**
   * Get fiscal quarter info for a date
   * @param {Date} date
   * @returns {Object}
   */
  getFiscalQuarter(date) {
    if (!date) return null;

    const month = date.getMonth() + 1; // 1-12
    const fyStart = this.config.fiscalYearStart;

    // Calculate fiscal month (1-12 from fiscal year start)
    let fiscalMonth = month - fyStart + 1;
    if (fiscalMonth <= 0) fiscalMonth += 12;

    const quarter = Math.ceil(fiscalMonth / 3);
    const fiscalYear = month >= fyStart ? date.getFullYear() : date.getFullYear() - 1;

    return {
      quarter,
      fiscalYear,
      label: `Q${quarter} FY${String(fiscalYear).slice(-2)}`
    };
  }

  /**
   * Get quarter end dates for shortcuts
   * @returns {Array}
   */
  getQuarterDates() {
    const today = new Date();
    const currentYear = today.getFullYear();
    const fyStart = this.config.fiscalYearStart;

    const quarters = [];
    for (let i = 0; i < 4; i++) {
      // Quarter end month (0-indexed)
      const endMonth = ((fyStart - 1) + (i + 1) * 3) % 12;
      const year = endMonth < fyStart - 1 ? currentYear + 1 : currentYear;

      // Last day of the quarter end month
      const lastDay = new Date(year, endMonth + 1, 0);

      const q = this.getFiscalQuarter(lastDay);
      quarters.push({
        label: `End of Q${i + 1}`,
        sublabel: q.label,
        date: lastDay
      });
    }

    return quarters;
  }

  /**
   * Generate calendar days for a month
   * @private
   */
  _generateCalendarDays(year, month) {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();

    // Start offset based on week start config
    let startOffset = firstDay.getDay() - this.config.weekStartsOn;
    if (startOffset < 0) startOffset += 7;

    const days = [];

    // Previous month days (grayed out)
    const prevMonthLast = new Date(year, month, 0);
    for (let i = startOffset - 1; i >= 0; i--) {
      days.push({
        day: prevMonthLast.getDate() - i,
        month: month - 1,
        year: month === 0 ? year - 1 : year,
        isCurrentMonth: false
      });
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      days.push({
        day: d,
        month,
        year,
        isCurrentMonth: true
      });
    }

    // Next month days to fill grid
    const remaining = 42 - days.length; // 6 rows × 7 days
    for (let d = 1; d <= remaining; d++) {
      days.push({
        day: d,
        month: month + 1,
        year: month === 11 ? year + 1 : year,
        isCurrentMonth: false
      });
    }

    return days;
  }

  /**
   * Check if a date is within allowed range
   * @private
   */
  _isDateInRange(date) {
    if (this.config.minDate) {
      const min = this._parseDate(this.config.minDate);
      if (min && date < min) return false;
    }
    if (this.config.maxDate) {
      const max = this._parseDate(this.config.maxDate);
      if (max && date > max) return false;
    }
    return true;
  }

  /**
   * Generate HTML for this date picker
   * @returns {string}
   */
  generateHTML() {
    const sizeClass = `size-${this.config.size}`;
    const displayValue = this.data.selectedDate
      ? this.formatDate(this.data.selectedDate)
      : '';

    const weekDays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
    const orderedDays = [
      ...weekDays.slice(this.config.weekStartsOn),
      ...weekDays.slice(0, this.config.weekStartsOn)
    ];

    return `
<div class="viz-component viz-date-picker component-${this.id} ${sizeClass}"
     data-component-id="${this.id}"
     data-component-type="date-picker">
  <div class="component-header">
    ${this.config.label ? `
    <label class="datepicker-label" for="${this.id}-input">
      ${this._escapeHtml(this.config.label)}
      ${this.config.required ? '<span class="required-indicator">*</span>' : ''}
    </label>
    ` : ''}
    ${this.description ? `<p class="component-description">${this._escapeHtml(this.description)}</p>` : ''}
  </div>

  <div class="component-content">
    <div class="datepicker-container" id="${this.id}-container">
      <div class="datepicker-input-wrapper">
        <input type="text"
               id="${this.id}-input"
               class="datepicker-input"
               value="${displayValue}"
               placeholder="${this._escapeHtml(this.config.placeholder)}"
               ${this.config.disabled ? 'disabled' : ''}
               ${this.config.required ? 'required' : ''}
               readonly
        />
        <svg class="datepicker-icon" width="18" height="18" viewBox="0 0 18 18" fill="none">
          <rect x="2" y="3" width="14" height="13" rx="2" stroke="currentColor" stroke-width="1.5"/>
          <path d="M2 7h14" stroke="currentColor" stroke-width="1.5"/>
          <path d="M6 1v3M12 1v3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        ${this.config.clearable && this.data.selectedDate ? `
        <button type="button" class="datepicker-clear" aria-label="Clear date">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
        ` : ''}
      </div>

      <div class="datepicker-popup" id="${this.id}-popup">
        ${this.config.showQuarters ? `
        <div class="datepicker-shortcuts">
          ${this.config.showToday ? `
          <button type="button" class="datepicker-shortcut" data-shortcut="today">
            <span class="shortcut-label">Today</span>
          </button>
          ` : ''}
          ${this.getQuarterDates().map((q, i) => `
          <button type="button" class="datepicker-shortcut" data-shortcut="q${i + 1}">
            <span class="shortcut-label">${q.label}</span>
            <span class="shortcut-sublabel">${q.sublabel}</span>
          </button>
          `).join('')}
        </div>
        ` : ''}

        <div class="datepicker-calendar">
          <div class="calendar-header">
            <button type="button" class="calendar-nav prev-month" aria-label="Previous month">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M10 4l-4 4 4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <div class="calendar-title">
              <select class="month-select" id="${this.id}-month-select">
                ${['January', 'February', 'March', 'April', 'May', 'June',
                   'July', 'August', 'September', 'October', 'November', 'December']
                  .map((m, i) => `<option value="${i}">${m}</option>`).join('')}
              </select>
              <select class="year-select" id="${this.id}-year-select">
                ${Array.from({ length: 20 }, (_, i) => {
                  const year = new Date().getFullYear() - 5 + i;
                  return `<option value="${year}">${year}</option>`;
                }).join('')}
              </select>
            </div>
            <button type="button" class="calendar-nav next-month" aria-label="Next month">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </div>

          <div class="calendar-weekdays">
            ${orderedDays.map(d => `<div class="weekday">${d}</div>`).join('')}
          </div>

          <div class="calendar-days" id="${this.id}-days">
            <!-- Days populated by JS -->
          </div>
        </div>
      </div>
    </div>

    ${this.config.helpText ? `
    <p class="datepicker-help">${this._escapeHtml(this.config.helpText)}</p>
    ` : ''}
  </div>
</div>`;
  }

  /**
   * Generate CSS for this date picker
   * @returns {string}
   */
  generateCSS() {
    return `
${super.generateCSS()}

.component-${this.id} .datepicker-label {
  font-weight: 600;
  font-size: 14px;
  color: var(--color-text);
  display: block;
  margin-bottom: var(--spacing-sm);
}

.component-${this.id} .required-indicator {
  color: var(--color-danger, #EF4444);
  margin-left: 4px;
}

.component-${this.id} .datepicker-container {
  position: relative;
}

.component-${this.id} .datepicker-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.component-${this.id} .datepicker-input {
  width: 100%;
  padding: var(--spacing-sm) var(--spacing-md);
  padding-left: 40px;
  border: 1px solid var(--color-border, #E5E7EB);
  border-radius: var(--radius-md);
  font-size: 14px;
  color: var(--color-text);
  background: white;
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.component-${this.id} .datepicker-input:hover:not(:disabled) {
  border-color: var(--color-primary);
}

.component-${this.id} .datepicker-input:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.component-${this.id} .datepicker-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.component-${this.id} .datepicker-icon {
  position: absolute;
  left: 12px;
  color: var(--color-text-muted);
  pointer-events: none;
}

.component-${this.id} .datepicker-clear {
  position: absolute;
  right: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  background: none;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: background 0.15s ease;
}

.component-${this.id} .datepicker-clear:hover {
  background: var(--color-surface);
  color: var(--color-text);
}

.component-${this.id} .datepicker-popup {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 1000;
  margin-top: 4px;
  background: white;
  border: 1px solid var(--color-border, #E5E7EB);
  border-radius: var(--radius-md);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  display: flex;
  opacity: 0;
  visibility: hidden;
  transform: translateY(-8px);
  transition: opacity 0.15s ease, transform 0.15s ease, visibility 0.15s;
}

.component-${this.id} .datepicker-container.open .datepicker-popup {
  opacity: 1;
  visibility: visible;
  transform: translateY(0);
}

.component-${this.id} .datepicker-shortcuts {
  width: 130px;
  padding: var(--spacing-sm);
  border-right: 1px solid var(--color-border, #E5E7EB);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.component-${this.id} .datepicker-shortcut {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: var(--spacing-xs) var(--spacing-sm);
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  text-align: left;
  transition: background 0.1s ease;
}

.component-${this.id} .datepicker-shortcut:hover {
  background: var(--color-surface-hover, #F3F4F6);
}

.component-${this.id} .shortcut-label {
  font-size: 13px;
  color: var(--color-text);
  font-weight: 500;
}

.component-${this.id} .shortcut-sublabel {
  font-size: 11px;
  color: var(--color-text-muted);
}

.component-${this.id} .datepicker-calendar {
  padding: var(--spacing-sm);
  width: 280px;
}

.component-${this.id} .calendar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--spacing-sm);
}

.component-${this.id} .calendar-nav {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: background 0.1s ease;
}

.component-${this.id} .calendar-nav:hover {
  background: var(--color-surface);
  color: var(--color-text);
}

.component-${this.id} .calendar-title {
  display: flex;
  gap: var(--spacing-xs);
}

.component-${this.id} .month-select,
.component-${this.id} .year-select {
  padding: 4px 8px;
  border: 1px solid var(--color-border, #E5E7EB);
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text);
  background: white;
  cursor: pointer;
}

.component-${this.id} .calendar-weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
  margin-bottom: 4px;
}

.component-${this.id} .weekday {
  text-align: center;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-text-muted);
  padding: 4px;
}

.component-${this.id} .calendar-days {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
}

.component-${this.id} .calendar-day {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  font-size: 13px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: background 0.1s ease;
}

.component-${this.id} .calendar-day:hover:not(.disabled):not(.selected) {
  background: var(--color-surface-hover, #F3F4F6);
}

.component-${this.id} .calendar-day.other-month {
  color: var(--color-text-muted);
  opacity: 0.5;
}

.component-${this.id} .calendar-day.today {
  font-weight: 600;
  color: var(--color-primary);
}

.component-${this.id} .calendar-day.selected {
  background: var(--color-primary);
  color: white;
  font-weight: 600;
}

.component-${this.id} .calendar-day.disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.component-${this.id} .datepicker-help {
  font-size: 12px;
  color: var(--color-text-muted);
  margin-top: var(--spacing-xs);
  margin-bottom: 0;
}

/* Size variants */
.component-${this.id}.size-small .datepicker-input {
  padding: 6px var(--spacing-sm);
  padding-left: 36px;
  font-size: 13px;
}

.component-${this.id}.size-large .datepicker-input {
  padding: var(--spacing-md);
  padding-left: 44px;
  font-size: 16px;
}
`;
  }

  /**
   * Generate JavaScript for this date picker
   * @returns {string}
   */
  generateJS() {
    const onChange = this.config.onChange;
    const quarterDates = JSON.stringify(this.getQuarterDates().map(q => ({
      ...q,
      date: q.date.toISOString()
    })));

    return `
(function() {
  const pickerId = '${this.id}';
  const container = document.getElementById(pickerId + '-container');
  const input = document.getElementById(pickerId + '-input');
  const popup = document.getElementById(pickerId + '-popup');
  const daysContainer = document.getElementById(pickerId + '-days');
  const monthSelect = document.getElementById(pickerId + '-month-select');
  const yearSelect = document.getElementById(pickerId + '-year-select');
  const clearBtn = container.querySelector('.datepicker-clear');
  const prevBtn = container.querySelector('.prev-month');
  const nextBtn = container.querySelector('.next-month');

  if (!container || !input || !popup) return;

  const config = {
    format: '${this.config.format}',
    minDate: ${this.config.minDate ? `new Date('${this.config.minDate}')` : 'null'},
    maxDate: ${this.config.maxDate ? `new Date('${this.config.maxDate}')` : 'null'},
    weekStartsOn: ${this.config.weekStartsOn}
  };

  const quarterDates = ${quarterDates}.map(q => ({ ...q, date: new Date(q.date) }));

  let selectedDate = ${this.data.selectedDate ? `new Date('${this.toISODate(this.data.selectedDate)}')` : 'null'};
  let viewYear = ${this.data.viewYear};
  let viewMonth = ${this.data.viewMonth};
  let isOpen = false;

  function formatDate(date) {
    if (!date) return '';
    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    const d = date.getDate();
    return config.format
      .replace('YYYY', y)
      .replace('YY', String(y).slice(-2))
      .replace('MM', String(m).padStart(2, '0'))
      .replace('M', m)
      .replace('DD', String(d).padStart(2, '0'))
      .replace('D', d);
  }

  function toISO(date) {
    if (!date) return null;
    return date.toISOString().split('T')[0];
  }

  function isDateInRange(date) {
    if (config.minDate && date < config.minDate) return false;
    if (config.maxDate && date > config.maxDate) return false;
    return true;
  }

  function isSameDay(d1, d2) {
    if (!d1 || !d2) return false;
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
  }

  function renderCalendar() {
    monthSelect.value = viewMonth;
    yearSelect.value = viewYear;

    const firstDay = new Date(viewYear, viewMonth, 1);
    const lastDay = new Date(viewYear, viewMonth + 1, 0);
    const daysInMonth = lastDay.getDate();
    const today = new Date();

    let startOffset = firstDay.getDay() - config.weekStartsOn;
    if (startOffset < 0) startOffset += 7;

    let html = '';

    // Previous month days
    const prevMonthLast = new Date(viewYear, viewMonth, 0);
    for (let i = startOffset - 1; i >= 0; i--) {
      const day = prevMonthLast.getDate() - i;
      const date = new Date(viewYear, viewMonth - 1, day);
      html += renderDay(date, false);
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(viewYear, viewMonth, d);
      html += renderDay(date, true);
    }

    // Next month days
    const remaining = 42 - (startOffset + daysInMonth);
    for (let d = 1; d <= remaining; d++) {
      const date = new Date(viewYear, viewMonth + 1, d);
      html += renderDay(date, false);
    }

    daysContainer.innerHTML = html;
  }

  function renderDay(date, isCurrentMonth) {
    const today = new Date();
    const isToday = isSameDay(date, today);
    const isSelected = isSameDay(date, selectedDate);
    const isDisabled = !isDateInRange(date);

    const classes = ['calendar-day'];
    if (!isCurrentMonth) classes.push('other-month');
    if (isToday) classes.push('today');
    if (isSelected) classes.push('selected');
    if (isDisabled) classes.push('disabled');

    return '<div class="' + classes.join(' ') + '" data-date="' + toISO(date) + '">' +
           date.getDate() +
           '</div>';
  }

  function selectDate(date) {
    selectedDate = date;
    input.value = formatDate(date);
    viewYear = date.getFullYear();
    viewMonth = date.getMonth();
    renderCalendar();
    close();
    emitChange();
  }

  function clearDate() {
    selectedDate = null;
    input.value = '';
    emitChange();
  }

  function open() {
    if (isOpen) return;
    isOpen = true;
    container.classList.add('open');
    renderCalendar();
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    container.classList.remove('open');
  }

  function emitChange() {
    const event = new CustomEvent('date-change', {
      detail: { componentId: pickerId, date: selectedDate, iso: toISO(selectedDate) },
      bubbles: true
    });
    container.dispatchEvent(event);

    ${onChange ? `
    if (typeof window['${onChange}'] === 'function') {
      window['${onChange}'](selectedDate, toISO(selectedDate), pickerId);
    }
    ` : ''}
  }

  // Event handlers
  input.addEventListener('click', function() {
    if (isOpen) close();
    else open();
  });

  if (clearBtn) {
    clearBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      clearDate();
    });
  }

  prevBtn.addEventListener('click', function() {
    viewMonth--;
    if (viewMonth < 0) {
      viewMonth = 11;
      viewYear--;
    }
    renderCalendar();
  });

  nextBtn.addEventListener('click', function() {
    viewMonth++;
    if (viewMonth > 11) {
      viewMonth = 0;
      viewYear++;
    }
    renderCalendar();
  });

  monthSelect.addEventListener('change', function() {
    viewMonth = parseInt(this.value);
    renderCalendar();
  });

  yearSelect.addEventListener('change', function() {
    viewYear = parseInt(this.value);
    renderCalendar();
  });

  daysContainer.addEventListener('click', function(e) {
    const dayEl = e.target.closest('.calendar-day');
    if (dayEl && !dayEl.classList.contains('disabled')) {
      const dateStr = dayEl.dataset.date;
      selectDate(new Date(dateStr + 'T00:00:00'));
    }
  });

  // Shortcuts
  const shortcuts = container.querySelectorAll('.datepicker-shortcut');
  shortcuts.forEach(btn => {
    btn.addEventListener('click', function() {
      const shortcut = this.dataset.shortcut;
      if (shortcut === 'today') {
        selectDate(new Date());
      } else if (shortcut.startsWith('q')) {
        const qIndex = parseInt(shortcut.slice(1)) - 1;
        if (quarterDates[qIndex]) {
          selectDate(quarterDates[qIndex].date);
        }
      }
    });
  });

  // Close on outside click
  document.addEventListener('click', function(e) {
    if (!container.contains(e.target)) {
      close();
    }
  });

  // Close on escape
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && isOpen) {
      close();
    }
  });

  // Initial render
  if (selectedDate) {
    input.value = formatDate(selectedDate);
  }

  // Store reference
  window.VIZ_DATEPICKERS = window.VIZ_DATEPICKERS || {};
  window.VIZ_DATEPICKERS[pickerId] = {
    getDate: () => selectedDate,
    setDate: (date) => {
      const d = typeof date === 'string' ? new Date(date) : date;
      selectDate(d);
    },
    getISO: () => toISO(selectedDate),
    clear: clearDate,
    open: open,
    close: close
  };
})();
`;
  }

  /**
   * Escape HTML entities
   * @private
   */
  _escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Validate date picker is ready to render
   * @returns {Object}
   */
  validate() {
    const base = super.validate();

    // Date picker doesn't require data like other components
    base.errors = base.errors.filter(e => !e.includes('data is required'));

    if (this.config.minDate && this.config.maxDate) {
      const min = this._parseDate(this.config.minDate);
      const max = this._parseDate(this.config.maxDate);
      if (min && max && min >= max) {
        base.errors.push('Date picker minDate must be before maxDate');
        base.valid = false;
      }
    }

    return base;
  }

  /**
   * Create from serialized state
   * @param {Object} json
   * @returns {DatePickerComponent}
   */
  static deserialize(json) {
    const component = new DatePickerComponent({
      id: json.id,
      title: json.title,
      description: json.description,
      position: json.position,
      config: json.config,
      filters: json.filters
    });
    component.data = json.data;
    if (component.data.selectedDate) {
      component.data.selectedDate = new Date(component.data.selectedDate);
    }
    component.created = json.created;
    component.updated = json.updated;
    return component;
  }
}

module.exports = DatePickerComponent;
