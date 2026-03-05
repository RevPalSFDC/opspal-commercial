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
**Organization:** <%= org %>
<% } %>

<% if (scope) { %>
**Integration Scope:** <%= scope %>
<% } %>

<% if (platforms && platforms.length > 0) { %>
**Platforms:** <%= platforms.join(' + ') %>
<% } %>

<% if (author) { %>
**Prepared By:** <%= author %>
<% } else { %>
**Prepared By:** RevPal Integration Team
<% } %>

**Assessment Date:** <%= formatDate(date, 'long') %>

**Version:** <%= version %>

</div>

<div class="cover-focus-areas">

**Focus Areas:**
- Data synchronization patterns
- API integration health
- Workflow orchestration
- Error handling and monitoring

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
