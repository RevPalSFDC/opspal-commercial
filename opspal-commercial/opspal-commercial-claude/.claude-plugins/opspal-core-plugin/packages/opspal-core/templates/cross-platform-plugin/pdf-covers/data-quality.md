<div class="cover-page">

<% if (logoPath) { %>
<div class="cover-logo">
<img src="<%= logoPath %>" alt="Logo" />
</div>
<% } %>

<div class="cover-report-type">Data Quality Assessment</div>

# <%= title %>

<% if (subtitle) { %>
<p class="cover-subtitle"><%= subtitle %></p>
<% } else { %>
<p class="cover-subtitle">Comprehensive analysis of data integrity, duplicate records, and remediation strategies</p>
<% } %>

<div class="cover-divider"></div>

<div class="cover-metadata">

<% if (org) { %>
**Organization:** <%= org %>
<% } %>

<% if (scope) { %>
**Scope:** <%= scope %>
<% } else { %>
**Scope:** Cross-platform Company/Account deduplication and data hygiene assessment
<% } %>

<% if (author) { %>
**Prepared By:** <%= author %>
<% } else { %>
**Prepared By:** RevPal Data Quality Team
<% } %>

**Assessment Date:** <%= formatDate(date, 'long') %>

**Version:** <%= version %>

<% if (recordsAnalyzed) { %>
**Records Analyzed:** <%= number(recordsAnalyzed) %>
<% } %>

<% if (qualityScore) { %>
**Overall Quality Score:** <%= qualityScore %>%
<% } %>

</div>

<div class="cover-footer">

<div class="cover-branding">
<em>Analysis generated with <strong>OpsPal</strong> by RevPal</em>
</div>

<div class="cover-disclaimer">
<strong>Disclaimer:</strong> This report includes analysis and insights generated with the assistance of OpsPal, by RevPal. While every effort has been made to ensure accuracy, results may include inaccuracies or omissions. Please validate findings before relying on them for business decisions.
</div>

</div>

</div>

---
