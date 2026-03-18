/**
 * PDF Style Policy
 *
 * Canonical style contract for all PDF outputs.
 * Only two profiles are supported:
 * - cover-toc: includes cover page and table of contents
 * - simple: no cover page and no table of contents
 */

const STYLE_PROFILES = Object.freeze({
  COVER_TOC: 'cover-toc',
  SIMPLE: 'simple'
});

const ALLOWED_STYLE_PROFILES = Object.freeze([
  STYLE_PROFILES.COVER_TOC,
  STYLE_PROFILES.SIMPLE
]);

const DEFAULT_STYLE_PROFILE = STYLE_PROFILES.COVER_TOC;
const CANONICAL_THEME = 'revpal-brand';

function isAllowedStyleProfile(profile) {
  return ALLOWED_STYLE_PROFILES.includes(profile);
}

function resolveStyleProfile(profile) {
  if (profile === undefined || profile === null || profile === '') {
    return DEFAULT_STYLE_PROFILE;
  }

  if (!isAllowedStyleProfile(profile)) {
    throw new Error(
      `Invalid PDF profile "${profile}". Supported profiles: ${ALLOWED_STYLE_PROFILES.join(', ')}`
    );
  }

  return profile;
}

function detectLegacyStyleOverrides(options = {}) {
  const overrides = [];

  if (options.theme !== undefined) {
    overrides.push('theme');
  }

  if (options.toc !== undefined) {
    overrides.push('toc');
  }

  if (options.coverPage !== undefined || options.addCoverPage !== undefined) {
    overrides.push('cover');
  }

  if (options.style !== undefined || options.stylesheet !== undefined) {
    overrides.push('style');
  }

  if (options.preset !== undefined) {
    overrides.push('preset');
  }

  return overrides;
}

function assertNoLegacyStyleOverrides(options = {}, allowed = []) {
  const detected = detectLegacyStyleOverrides(options);
  const disallowed = detected.filter((name) => !allowed.includes(name));

  if (disallowed.length === 0) return;

  throw new Error(
    `Legacy PDF style overrides are disabled (${disallowed.join(', ')}). ` +
    `Use --profile ${STYLE_PROFILES.COVER_TOC} or --profile ${STYLE_PROFILES.SIMPLE}.`
  );
}

function getProfileConfig(profile) {
  const resolved = resolveStyleProfile(profile);

  if (resolved === STYLE_PROFILES.SIMPLE) {
    return {
      profile: STYLE_PROFILES.SIMPLE,
      theme: CANONICAL_THEME,
      toc: false,
      features: {
        coverPage: false,
        tableOfContents: 'never',
        headerFooter: true,
        pageNumbers: true,
        renderMermaid: true,
        bookmarks: false
      }
    };
  }

  return {
    profile: STYLE_PROFILES.COVER_TOC,
    theme: CANONICAL_THEME,
    toc: true,
    features: {
      coverPage: true,
      tableOfContents: 'always',
      headerFooter: true,
      pageNumbers: true,
      renderMermaid: true,
      bookmarks: false
    }
  };
}

module.exports = {
  STYLE_PROFILES,
  ALLOWED_STYLE_PROFILES,
  DEFAULT_STYLE_PROFILE,
  CANONICAL_THEME,
  isAllowedStyleProfile,
  resolveStyleProfile,
  detectLegacyStyleOverrides,
  assertNoLegacyStyleOverrides,
  getProfileConfig
};
