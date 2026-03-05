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
<p><strong>Organization:</strong> <%= org %></p>
<% } %>

<% if (scope) { %>
<p><strong>Scope:</strong> <%= scope %></p>
<% } else { %>
<p><strong>Scope:</strong> Cross-platform Company/Account deduplication and data hygiene assessment</p>
<% } %>

<% if (author) { %>
<p><strong>Prepared By:</strong> <%= author %></p>
<% } else { %>
<p><strong>Prepared By:</strong> RevPal Data Quality Team</p>
<% } %>

<p><strong>Assessment Date:</strong> <%= formatDate(date, 'long') %></p>

<p><strong>Version:</strong> <%= version %></p>

<% if (recordsAnalyzed) { %>
<p><strong>Records Analyzed:</strong> <%= number(recordsAnalyzed) %></p>
<% } %>

<% if (qualityScore) { %>
<p><strong>Overall Quality Score:</strong> <%= qualityScore %>%</p>
<% } %>

</div>

<div class="cover-footer">

<div class="cover-disclaimer">
<strong>Disclaimer:</strong> This report includes analysis and insights generated with the assistance of OpsPal, by RevPal. While every effort has been made to ensure accuracy, results may include inaccuracies or omissions. Please validate findings before relying on them for business decisions.
</div>

</div>

</div>
