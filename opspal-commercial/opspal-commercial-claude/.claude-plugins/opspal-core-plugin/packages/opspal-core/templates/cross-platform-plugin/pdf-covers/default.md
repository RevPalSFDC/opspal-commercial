<div class="cover-page">

<% if (logoPath) { %>
<div class="cover-logo">
<img src="<%= logoPath %>" alt="Logo" />
</div>
<% } %>

# <%= title %>

<% if (subtitle) { %>
<p class="cover-subtitle"><%= subtitle %></p>
<% } %>

<div class="cover-divider"></div>

<div class="cover-metadata">
<% if (org) { %>
<p><strong>Organization:</strong> <%= org %></p>
<% } %>
<% if (author) { %>
<p><strong>Author:</strong> <%= author %></p>
<% } %>
<p><strong>Generated:</strong> <%= formatDate(date, 'long') %></p>
<p><strong>Version:</strong> <%= version %></p>
</div>

<div class="cover-footer">
<p class="cover-branding"><em>Analysis generated with <strong>OpsPal</strong> by RevPal</em></p>
<p class="cover-disclaimer"><strong>Disclaimer:</strong> This report includes analysis and insights generated with the assistance of OpsPal, by RevPal. While every effort has been made to ensure accuracy, results may include inaccuracies or omissions. Please validate findings before relying on them for business decisions.</p>
</div>

</div>
