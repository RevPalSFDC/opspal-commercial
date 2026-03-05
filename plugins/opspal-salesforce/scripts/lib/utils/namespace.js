function withNamespace(name, namespacePrefix) {
    return namespacePrefix ? `${namespacePrefix}__${name}` : name;
}

function layoutMember(objectApiName, layoutLabel) {
    return `${objectApiName}-${layoutLabel}`;
}

function assertLayoutNotNamespaced(member) {
    const [objectPart] = member.split('-', 1);
    if (objectPart && objectPart.includes('__')) {
        throw new Error(`Layouts are not namespaced; received "${member}". Use the object API name without the namespace prefix.`);
    }
}

module.exports = {
    withNamespace,
    layoutMember,
    assertLayoutNotNamespaced
};
