<div class="cover-page">

<% if (logoPath) { %>
<div class="cover-logo">
<img src="<%= logoPath %>" alt="Logo" />
</div>
<% } %>

<div class="cover-report-type">Salesforce Automation Audit</div>

# <%= title %>

<% if (subtitle) { %>
<p class="cover-subtitle"><%= subtitle %></p>
<% } else { %>
<p class="cover-subtitle">Comprehensive analysis of automation health, conflicts, and remediation opportunities</p>
<% } %>

<div class="cover-divider"></div>

<div class="cover-metadata">

<% if (org) { %>
<p><strong>Organization:</strong> <%= org %></p>
<% } %>

<% if (sandboxName) { %>
<p><strong>Environment:</strong> <%= sandboxName %></p>
<% } %>

<p><strong>Generated:</strong> <%= formatDate(date, 'long') %></p>

<p><strong>Version:</strong> <%= version %></p>

<% if (scope) { %>
<p><strong>Scope:</strong> <%= scope %></p>
<% } %>

</div>

<div class="cover-footer">

<div class="cover-disclaimer">
<strong>Disclaimer:</strong> This report includes analysis and insights generated with the assistance of OpsPal, by RevPal. While every effort has been made to ensure accuracy, results may include inaccuracies or omissions. Please validate findings before relying on them for business decisions.
</div>

</div>

</div>
