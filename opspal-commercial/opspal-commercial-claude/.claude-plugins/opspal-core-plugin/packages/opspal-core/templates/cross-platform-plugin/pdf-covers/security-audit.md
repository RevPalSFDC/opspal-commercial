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
**Organization:** <%= org %>
<% } %>

<% if (confidentiality) { %>
**Confidentiality:** <%= confidentiality %>
<% } else { %>
**Confidentiality:** Internal Use Only
<% } %>

<% if (author) { %>
**Prepared By:** <%= author %>
<% } else { %>
**Prepared By:** RevPal Security Team
<% } %>

**Audit Date:** <%= formatDate(date, 'long') %>

**Report Version:** <%= version %>

<% if (complianceFrameworks && complianceFrameworks.length > 0) { %>
**Compliance Frameworks:** <%= complianceFrameworks.join(', ') %>
<% } %>

<% if (riskLevel) { %>
**Overall Risk Level:** <%= riskLevel %>
<% } %>

</div>

<div class="cover-focus-areas">

**Assessment Areas:**
- Access control and permissions
- Data security and encryption
- Compliance framework alignment
- Vulnerability identification
- Risk mitigation strategies

</div>

<div class="cover-footer">

<div class="cover-branding">
<em>Analysis generated with <strong>OpsPal</strong> by RevPal</em>
</div>

<div class="cover-disclaimer">
**CONFIDENTIAL**: This security audit report contains sensitive information about organizational security posture. Distribution should be limited to authorized personnel only.

<strong>Disclaimer:</strong> This report includes analysis and insights generated with the assistance of OpsPal, by RevPal. While every effort has been made to ensure accuracy, results may include inaccuracies or omissions. Please validate findings before relying on them for business decisions.
</div>

</div>

</div>

---
