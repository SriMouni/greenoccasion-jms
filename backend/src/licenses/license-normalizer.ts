export type LicensePolicy =
  | 'auto_allowed'
  | 'conditional_review'
  | 'unknown_review'
  | 'blocked';

export type NormalizeLicenseInput = {
  licenseUrl?: string | null;
  licenseText?: string | null;
};

export type NormalizedLicense = {
  canonicalName:
    | 'CC0'
    | 'CC BY'
    | 'CC BY-SA'
    | 'CC BY-ND'
    | 'CC BY-NC'
    | 'CC BY-NC-SA'
    | 'CC BY-NC-ND'
    | 'Unknown'
    | 'All rights reserved';
  policy: LicensePolicy;
  reason: string;
};

const normalizeValue = (value?: string | null) => {
  if (!value) return '';

  try {
    return decodeURIComponent(value)
      .trim()
      .toLowerCase()
      .replace(/_/g, '-')
      .replace(/\s+/g, ' ')
      .replace(/\/+$/, '');
  } catch {
    return value
      .trim()
      .toLowerCase()
      .replace(/_/g, '-')
      .replace(/\s+/g, ' ')
      .replace(/\/+$/, '');
  }
};

const buildSearchText = (input: NormalizeLicenseInput) => {
  return [normalizeValue(input.licenseUrl), normalizeValue(input.licenseText)]
    .filter(Boolean)
    .join(' ');
};

const isMissingLicense = (text: string) => {
  return text.length === 0 || text === 'unknown' || text === 'missing' || text === 'no license';
};

export const normalizeLicense = (input: NormalizeLicenseInput): NormalizedLicense => {
  const text = buildSearchText(input);

  if (isMissingLicense(text)) {
    return {
      canonicalName: 'Unknown',
      policy: 'unknown_review',
      reason: 'License is missing or unknown.',
    };
  }

  if (
    text.includes('all rights reserved') ||
    text.includes('copyright reserved') ||
    text.includes('no redistribution')
  ) {
    return {
      canonicalName: 'All rights reserved',
      policy: 'blocked',
      reason: 'License is restrictive and cannot be auto-ingested.',
    };
  }

  if (
    text.includes('creativecommons.org/publicdomain/zero') ||
    text.includes('creativecommons.org/public-domain/cc0') ||
    text.includes('cc0') ||
    text.includes('public domain dedication')
  ) {
    return {
      canonicalName: 'CC0',
      policy: 'auto_allowed',
      reason: 'CC0 is auto-allowed under current policy.',
    };
  }

  if (
    text.includes('creativecommons.org/licenses/by-nc-nd') ||
    text.includes('cc by-nc-nd') ||
    text.includes('cc-by-nc-nd')
  ) {
    return {
      canonicalName: 'CC BY-NC-ND',
      policy: 'conditional_review',
      reason: 'Non-commercial and no-derivatives terms require manual review.',
    };
  }

  if (
    text.includes('creativecommons.org/licenses/by-nc-sa') ||
    text.includes('cc by-nc-sa') ||
    text.includes('cc-by-nc-sa')
  ) {
    return {
      canonicalName: 'CC BY-NC-SA',
      policy: 'conditional_review',
      reason: 'Non-commercial and share-alike terms require manual review.',
    };
  }

  if (
    text.includes('creativecommons.org/licenses/by-nc') ||
    text.includes('cc by-nc') ||
    text.includes('cc-by-nc')
  ) {
    return {
      canonicalName: 'CC BY-NC',
      policy: 'conditional_review',
      reason: 'Non-commercial terms require manual review.',
    };
  }

  if (
    text.includes('creativecommons.org/licenses/by-nd') ||
    text.includes('cc by-nd') ||
    text.includes('cc-by-nd')
  ) {
    return {
      canonicalName: 'CC BY-ND',
      policy: 'conditional_review',
      reason: 'No-derivatives terms require manual review.',
    };
  }

  if (
    text.includes('creativecommons.org/licenses/by-sa') ||
    text.includes('cc by-sa') ||
    text.includes('cc-by-sa')
  ) {
    return {
      canonicalName: 'CC BY-SA',
      policy: 'conditional_review',
      reason: 'Share-alike terms require manual review.',
    };
  }

  if (
    text.includes('creativecommons.org/licenses/by') ||
    text.includes('cc by') ||
    text.includes('cc-by')
  ) {
    return {
      canonicalName: 'CC BY',
      policy: 'auto_allowed',
      reason: 'CC BY is auto-allowed with attribution.',
    };
  }

  return {
    canonicalName: 'Unknown',
    policy: 'unknown_review',
    reason: 'License could not be mapped to a canonical policy.',
  };
};