# Manifest Parsing

Use XML parsers for `package.xml` and avoid positional grep assumptions.
Preserve namespace handling and member ordering semantics.

## Why grep/sed is Insufficient

`package.xml` uses an XML namespace (`xmlns="http://soap.sforce.com/2006/04/metadata"`). Positional grep breaks when:
- Salesforce CLI regenerates the file with different whitespace or element ordering.
- Members span multiple lines.
- XML comments are present.
- The file uses UTF-8 BOM.

Always use a proper XML tool.

## Recommended Parsers by Context

| Context | Tool | Example |
|---------|------|---------|
| Shell scripts | `xmllint` (libxml2) | `xmllint --xpath '//members/text()' package.xml` |
| Python scripts | `xml.etree.ElementTree` | Standard library, no deps |
| Node scripts | `fast-xml-parser` or `xmldom` | Lightweight, no native deps |
| Validation | `xmllint --schema` | Validate against XSD |

## xmllint Patterns

```bash
# Check well-formedness (first gate before any parse)
xmllint --noout package.xml || { echo "Malformed XML"; exit 1; }

# List all metadata type names
xmllint --xpath '//*[local-name()="name"]/text()' package.xml 2>/dev/null

# List all members for a specific type (Flow)
xmllint --xpath '//*[local-name()="types"][*[local-name()="name"]="Flow"]/*[local-name()="members"]/text()' \
  package.xml 2>/dev/null

# Count total components
xmllint --xpath 'count(//*[local-name()="members"])' package.xml 2>/dev/null

# Extract API version
xmllint --xpath '//*[local-name()="version"]/text()' package.xml 2>/dev/null
```

## Python Parsing Pattern

```python
import xml.etree.ElementTree as ET

NS = 'http://soap.sforce.com/2006/04/metadata'

def parse_manifest(path):
    tree = ET.parse(path)
    root = tree.getroot()
    result = {}
    for types_el in root.findall(f'{{{NS}}}types'):
        name_el = types_el.find(f'{{{NS}}}name')
        if name_el is None:
            continue
        type_name = name_el.text
        members = [m.text for m in types_el.findall(f'{{{NS}}}members')]
        result[type_name] = members
    return result

manifest = parse_manifest('package.xml')
print(manifest.get('Flow', []))   # ['My_Flow_1', 'My_Flow_2']
```

## Namespace Preservation on Write

When writing back a modified manifest, preserve the namespace declaration:

```python
ET.register_namespace('', NS)   # suppress 'ns0:' prefix
tree.write('package.xml', xml_declaration=True, encoding='UTF-8')
```

## Member Ordering Semantics

Salesforce deploys within a `<types>` block in the order members appear. For dependent components (e.g., fields before layouts), order matters. Sort deterministically:

```python
for types_el in root.findall(f'{{{NS}}}types'):
    members = types_el.findall(f'{{{NS}}}members')
    sorted_members = sorted(members, key=lambda m: m.text)
    for m in members:
        types_el.remove(m)
    for m in sorted_members:
        types_el.append(m)
```

## Wildcard Members

`<members>*</members>` retrieves all components of a type. Do not use wildcards in production manifests — the result is non-deterministic across orgs. Always enumerate explicitly.

## API Version Validation

```bash
# Ensure manifest API version matches project sfdx-project.json
MANIFEST_VERSION=$(xmllint --xpath '//*[local-name()="version"]/text()' package.xml 2>/dev/null)
PROJECT_VERSION=$(jq -r '.sourceApiVersion' sfdx-project.json)

if [[ "$MANIFEST_VERSION" != "$PROJECT_VERSION" ]]; then
  echo "WARNING: Manifest API version ($MANIFEST_VERSION) differs from project ($PROJECT_VERSION)"
fi
```
