<div class="cover-page">

<% if (logoPath) { %>
<div class="cover-logo">
<img src="<%= logoPath %>" alt="Logo" />
</div>
<% } %>

<div class="cover-report-type">Cross-Platform Integration</div>

# <%= title %>

<% if (subtitle) { %>
<p class="cover-subtitle"><%= subtitle %></p>
<% } else { %>
<p class="cover-subtitle">Comprehensive analysis of Salesforce, HubSpot, and third-party system integrations</p>
<% } %>

<div class="cover-divider"></div>

<div class="cover-metadata">

<% if (org) { %>
<p><strong>Organization:</strong> <%= org %></p>
<% } %>

<% if (scope) { %>
<p><strong>Integration Scope:</strong> <%= scope %></p>
<% } %>

<% if (platforms && platforms.length > 0) { %>
<p><strong>Platforms:</strong> <%= platforms.join(' + ') %></p>
<% } %>

<% if (author) { %>
<p><strong>Prepared By:</strong> <%= author %></p>
<% } else { %>
<p><strong>Prepared By:</strong> RevPal Integration Team</p>
<% } %>

<p><strong>Assessment Date:</strong> <%= formatDate(date, 'long') %></p>

<p><strong>Version:</strong> <%= version %></p>

</div>

<div class="cover-focus-areas">

<p><strong>Focus Areas:</strong></p>
<ul>
  <li>Data synchronization patterns</li>
  <li>API integration health</li>
  <li>Workflow orchestration</li>
  <li>Error handling and monitoring</li>
</ul>

</div>

<div class="cover-footer">

<div class="cover-disclaimer">
<strong>Disclaimer:</strong> This report includes analysis and insights generated with the assistance of OpsPal, by RevPal. While every effort has been made to ensure accuracy, results may include inaccuracies or omissions. Please validate findings before relying on them for business decisions.
</div>

</div>

</div>
