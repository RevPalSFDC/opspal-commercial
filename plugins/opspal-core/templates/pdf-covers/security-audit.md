<div class="cover-page">

<% if (logoPath) { %>
<div class="cover-logo">
<img src="<%= logoPath %>" alt="Logo" />
</div>
<% } %>

<div class="cover-report-type">Security & Compliance Audit</div>

# <%= title %>

<% if (subtitle) { %>
<p class="cover-subtitle"><%= subtitle %></p>
<% } else { %>
<p class="cover-subtitle">Comprehensive assessment of security posture, compliance requirements, and remediation recommendations</p>
<% } %>

<div class="cover-divider"></div>

<div class="cover-metadata">

<% if (org) { %>
<p><strong>Organization:</strong> <%= org %></p>
<% } %>

<% if (confidentiality) { %>
<p><strong>Confidentiality:</strong> <%= confidentiality %></p>
<% } else { %>
<p><strong>Confidentiality:</strong> Internal Use Only</p>
<% } %>

<% if (author) { %>
<p><strong>Prepared By:</strong> <%= author %></p>
<% } else { %>
<p><strong>Prepared By:</strong> RevPal Security Team</p>
<% } %>

<p><strong>Audit Date:</strong> <%= formatDate(date, 'long') %></p>

<p><strong>Report Version:</strong> <%= version %></p>

<% if (complianceFrameworks && complianceFrameworks.length > 0) { %>
<p><strong>Compliance Frameworks:</strong> <%= complianceFrameworks.join(', ') %></p>
<% } %>

<% if (riskLevel) { %>
<p><strong>Overall Risk Level:</strong> <%= riskLevel %></p>
<% } %>

</div>

<div class="cover-focus-areas">

<p><strong>Assessment Areas:</strong></p>
<ul>
  <li>Access control and permissions</li>
  <li>Data security and encryption</li>
  <li>Compliance framework alignment</li>
  <li>Vulnerability identification</li>
  <li>Risk mitigation strategies</li>
</ul>

</div>

<div class="cover-footer">

<div class="cover-disclaimer">
**CONFIDENTIAL**: This security audit report contains sensitive information about organizational security posture. Distribution should be limited to authorized personnel only.

<strong>Disclaimer:</strong> This report includes analysis and insights generated with the assistance of OpsPal, by RevPal. While every effort has been made to ensure accuracy, results may include inaccuracies or omissions. Please validate findings before relying on them for business decisions.
</div>

</div>

</div>
