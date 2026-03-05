# OpsPal Core Architecture

```mermaid
flowchart TD
  subgraph CommercialRepo["Commercial Repo"]
    subgraph LegacyPlugins["Legacy Interfaces (compatibility layer)"]
      LP_Salesforce["salesforce-plugin"]
      LP_Hubspot["hubspot-plugin"]
      LP_Marketo["marketo-plugin"]
      LP_Monday["monday-plugin"]
      LP_GTM["gtm-planning-plugin"]
      LP_DataHygiene["data-hygiene-plugin"]
      LP_AI["ai-consult-plugin"]
      LP_Cross["cross-platform-plugin"]
      LP_DevTools["developer-tools-plugin"]
    end

    subgraph OpsPalCorePlugin["opspal-core-plugin (product)"]
      subgraph Packages["packages/ (authoritative)"]
        CorePkg["opspal-core (shared core)"]
        subgraph DomainPkgs["domains/"]
          D_Salesforce["salesforce"]
          D_Hubspot["hubspot"]
          D_Marketo["marketo"]
          D_Monday["monday"]
          D_GTM["gtm-planning"]
          D_DataHygiene["data-hygiene"]
          D_AI["ai-consult"]
        end
      end
    end
  end

  %% Dependency direction
  D_Salesforce --> CorePkg
  D_Hubspot --> CorePkg
  D_Marketo --> CorePkg
  D_Monday --> CorePkg
  D_GTM --> CorePkg
  D_DataHygiene --> CorePkg
  D_AI --> CorePkg

  %% Legacy compatibility mappings
  LP_Salesforce -. "compat shim" .-> D_Salesforce
  LP_Hubspot -. "compat shim" .-> D_Hubspot
  LP_Marketo -. "compat shim" .-> D_Marketo
  LP_Monday -. "compat shim" .-> D_Monday
  LP_GTM -. "compat shim" .-> D_GTM
  LP_DataHygiene -. "compat shim" .-> D_DataHygiene
  LP_AI -. "compat shim" .-> D_AI
  LP_Cross -. "legacy source assets" .-> CorePkg
  LP_DevTools -. "legacy source assets" .-> CorePkg

  classDef legacy fill:#f6f6f6,stroke:#999,stroke-dasharray:3 3;
  classDef core fill:#dfefff,stroke:#2b6cb0;
  classDef domain fill:#e7ffe7,stroke:#2f855a;
  class LP_Salesforce,LP_Hubspot,LP_Marketo,LP_Monday,LP_GTM,LP_DataHygiene,LP_AI,LP_Cross,LP_DevTools legacy;
  class CorePkg core;
  class D_Salesforce,D_Hubspot,D_Marketo,D_Monday,D_GTM,D_DataHygiene,D_AI domain;
```

## Compatibility Shims (Package-Local)
- `opspal-core/cross-platform-plugin` and `opspal-core/developer-tools-plugin` provide root-style layouts with symlinks to package assets.
- Domain packages include symlinks back to these roots to satisfy legacy relative imports without changing runtime behavior.
