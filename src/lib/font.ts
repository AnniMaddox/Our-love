export const APP_CUSTOM_FONT_FAMILY = '__memorial_custom_font__';
export const SETTINGS_PREVIEW_FONT_FAMILY = '__settings_preview_font__';
export const LETTER_CUSTOM_FONT_FAMILY = '__memorial_letter_font__';
export const DIARY_CUSTOM_FONT_FAMILY = '__memorial_diary_font__';
export const SOULMATE_CUSTOM_FONT_FAMILY = '__memorial_soulmate_font__';
export const ARCHIVE_CUSTOM_FONT_FAMILY = '__memorial_archive_font__';
export const NOTES_CUSTOM_FONT_FAMILY = '__memorial_notes_font__';
export const HEALING_CAMPFIRE_CUSTOM_FONT_FAMILY = '__memorial_healing_campfire_font__';

function escapeCssString(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function detectFontFormat(url: string) {
  const path = url.split('#')[0]?.split('?')[0]?.toLowerCase() ?? '';

  if (path.endsWith('.woff2')) {
    return " format('woff2')";
  }

  if (path.endsWith('.woff')) {
    return " format('woff')";
  }

  if (path.endsWith('.otf')) {
    return " format('opentype')";
  }

  if (path.endsWith('.ttf')) {
    return " format('truetype')";
  }

  return '';
}

export function buildFontFaceRule(fontFamily: string, fontUrl: string) {
  const escapedFamily = escapeCssString(fontFamily);
  const escapedUrl = escapeCssString(fontUrl.trim());
  const formatHint = detectFontFormat(fontUrl);

  return `@font-face { font-family: '${escapedFamily}'; src: url('${escapedUrl}')${formatHint}; font-display: swap; }`;
}
