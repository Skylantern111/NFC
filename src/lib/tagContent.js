// Shared model for tagProfiles/{tagId} — what a tap on the sticker shows
// (NFC_WRITE_DATA_ADMIN_PLAN.md). Used by the owner editor
// (dashboard/NfcSetup.jsx), the admin editor (admin/TagContent.jsx), and
// the public page (public/NfcLanding.jsx), so all three agree on the field
// set and validation. The sticker itself only ever holds tagUrl(tagId).

export const LANDING_MODES = [
  {
    value: 'lostfound',
    label: 'Lost & Found',
    description: 'Item page with the found-item report form and anonymous chat.',
  },
  {
    value: 'profile',
    label: 'Profile card',
    description: 'Name, short bio, social links and contact link — a digital card.',
  },
  {
    value: 'redirect',
    label: 'Redirect',
    description: 'Opens a URL of your choice. Change it any time without rewriting the sticker.',
  },
];

// Social link fields, in display order. Icons live in components/TagContent.jsx.
export const LINK_KEYS = ['website', 'instagram', 'facebook', 'tiktok', 'linkedin', 'youtube'];
export const LINK_LABELS = {
  website: 'Website',
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
};

const URL_KEYS = [...LINK_KEYS, 'contactUrl', 'redirectUrl'];
const TEXT_KEYS = ['displayName', 'bio'];

// Mirrors firestore.rules#publicProfileFieldsOnly.
export const DISPLAY_NAME_MAX = 60;
export const BIO_MAX = 160;

export const EMPTY_PROFILE = {
  landingMode: 'lostfound',
  displayName: '',
  bio: '',
  website: '',
  instagram: '',
  facebook: '',
  tiktok: '',
  linkedin: '',
  youtube: '',
  contactUrl: '',
  contactEnabled: false,
  redirectUrl: '',
  lostFoundEnabled: true,
};

export function isHttpsUrl(value) {
  return /^https:\/\/.+/.test(value || '');
}

// Loads a saved doc into form state: every known field present, and nothing
// else (drops updatedAt/updatedBy so they're never echoed back on save).
export function profileToForm(saved) {
  const form = { ...EMPTY_PROFILE };
  for (const key of Object.keys(EMPTY_PROFILE)) {
    if (saved && saved[key] !== undefined && saved[key] !== null) form[key] = saved[key];
  }
  return form;
}

// Returns { [field]: message } — empty object when valid.
export function validateProfile(profile) {
  const errors = {};
  for (const key of URL_KEYS) {
    const value = profile[key]?.trim();
    if (value && !isHttpsUrl(value)) errors[key] = 'Enter a valid https:// URL, or leave blank.';
  }
  if ((profile.displayName || '').trim().length > DISPLAY_NAME_MAX) {
    errors.displayName = `Keep it under ${DISPLAY_NAME_MAX} characters.`;
  }
  if ((profile.bio || '').trim().length > BIO_MAX) errors.bio = `Keep it under ${BIO_MAX} characters.`;
  if (profile.landingMode === 'redirect' && !profile.redirectUrl?.trim()) {
    errors.redirectUrl = 'Redirect mode needs a URL.';
  }
  return errors;
}

// Form state -> the document to write. Blank URL/text fields are dropped
// rather than written as '' — the rules' https check only passes when a
// URL field is absent or a real https URL.
export function formToProfile(profile) {
  const out = {};
  for (const [key, value] of Object.entries(profile)) {
    if (!(key in EMPTY_PROFILE)) continue;
    const v = typeof value === 'string' ? value.trim() : value;
    if ((URL_KEYS.includes(key) || TEXT_KEYS.includes(key)) && !v) continue;
    out[key] = v;
  }
  return out;
}

// What a tap resolves to, given the saved profile and item. Order matters:
// a lost item ALWAYS shows the lost & found page, whatever the mode says —
// otherwise a finder tapping a redirect sticker would never see the report
// form (NFC_WRITE_DATA_ADMIN_PLAN.md §1 safety override).
export function resolveLanding(profile, item) {
  if (item?.isLostMode) return 'lostfound';
  const mode = profile?.landingMode || 'lostfound';
  if (mode === 'redirect' && isHttpsUrl(profile?.redirectUrl)) return 'redirect';
  if (mode === 'profile') return 'profile';
  return 'lostfound';
}

// A tag an admin has set to profile/redirect before anyone claimed it is
// company-managed content, not stock waiting for an owner. Matches the
// claim guard in firestore.rules (tags#update claim clause).
export function isAdminManaged(profile) {
  return !!profile && (profile.landingMode || 'lostfound') !== 'lostfound';
}

export function visibleLinks(profile) {
  return LINK_KEYS.filter((k) => isHttpsUrl(profile?.[k]?.trim()));
}

// Short human label for what a tap shows — admin tables. No profile doc =
// the default, lost & found.
export function contentLabel(profile) {
  const mode = profile?.landingMode || 'lostfound';
  if (mode === 'profile') return profile.displayName ? `Profile · ${profile.displayName}` : 'Profile card';
  if (mode === 'redirect') {
    try {
      return `Redirect · ${new URL(profile.redirectUrl).hostname}`;
    } catch {
      return 'Redirect';
    }
  }
  return 'Lost & Found';
}

// True when LinkPills would render anything.
export function hasVisibleLinks(profile) {
  return (
    visibleLinks(profile).length > 0 || (!!profile?.contactEnabled && isHttpsUrl(profile?.contactUrl?.trim()))
  );
}

function escapeVcard(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
}

// vCard 3.0 text for the profile card's "Save contact" button. Built only
// from the public profile fields — never from users/{uid}.
export function buildVcard(profile) {
  const name = profile.displayName?.trim() || 'TagBack contact';
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${escapeVcard(name)}`, `N:${escapeVcard(name)};;;;`];
  if (profile.bio?.trim()) lines.push(`NOTE:${escapeVcard(profile.bio.trim())}`);
  for (const key of visibleLinks(profile)) {
    lines.push(`URL;TYPE=${key}:${profile[key].trim()}`);
  }
  if (profile.contactEnabled && isHttpsUrl(profile.contactUrl?.trim())) {
    lines.push(`URL;TYPE=contact:${profile.contactUrl.trim()}`);
  }
  lines.push('END:VCARD');
  return lines.join('\r\n') + '\r\n';
}
