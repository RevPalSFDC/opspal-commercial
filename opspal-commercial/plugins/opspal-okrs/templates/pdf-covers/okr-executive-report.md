<div class="cover-page">

<% if (logoPath) { %>
<div class="cover-logo">
<img src="<%= logoPath %>" alt="Logo" />
</div>
<% } %>

<div class="cover-report-type">OKR Cycle Report</div>

# <%= title %>

<% if (subtitle) { %>
<p class="cover-subtitle"><%= subtitle %></p>
<% } else { %>
<p class="cover-subtitle">Objectives & Key Results — Cycle Performance and Strategic Alignment</p>
<% } %>

<div class="cover-divider"></div>

<div class="cover-metadata">

<% if (org) { %>
<p><strong>Company:</strong> <%= org %></p>
<% } %>

<% if (cycle) { %>
<p><strong>OKR Cycle:</strong> <%= cycle %></p>
<% } %>

<% if (stance) { %>
<p><strong>Stance:</strong> <%= stance %></p>
<% } %>

<p><strong>Generated:</strong> <%= formatDate(date, 'long') %></p>

<p><strong>Version:</strong> <%= version %></p>

<% if (classification) { %>
<p><strong>Classification:</strong> <%= classification %></p>
<% } %>

</div>

<div class="cover-footer">

<div class="cover-disclaimer">
<strong>Disclaimer:</strong> This report includes analysis and insights generated with the assistance of OpsPal, by RevPal. While every effort has been made to ensure accuracy, results may include inaccuracies or omissions. Please validate findings before relying on them for business decisions.
</div>

</div>

</div>
