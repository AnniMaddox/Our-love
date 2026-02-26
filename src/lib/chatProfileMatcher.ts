import type { ChatProfile } from './chatDB';

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countPatternMatches(text: string, pattern: RegExp) {
  let total = 0;
  let matched = pattern.exec(text);
  while (matched) {
    total += 1;
    matched = pattern.exec(text);
  }
  return total;
}

function countAliasHits(content: string, lines: string[], aliases: string[]) {
  let hits = 0;

  for (const alias of aliases) {
    const escapedAlias = escapeRegExp(alias);
    const speakerLinePattern = new RegExp(`^\\s*${escapedAlias}\\s*[：:]`, 'i');
    const bracketLinePattern = new RegExp(`^\\s*【\\s*${escapedAlias}\\s*】`, 'i');
    const jsonSpeakerPattern = new RegExp(`"(?:speaker|name|author|from)"\\s*:\\s*"${escapedAlias}"`, 'gi');

    for (const line of lines) {
      if (speakerLinePattern.test(line)) hits += 3;
      if (bracketLinePattern.test(line)) hits += 3;
    }

    hits += countPatternMatches(content, jsonSpeakerPattern) * 2;
  }

  return hits;
}

export function splitNickAliases(raw: string | undefined, fallback: string) {
  const source = raw?.trim() || fallback;
  const chunks = source
    .split(/[|/,，、\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (!chunks.length) return [fallback];
  return Array.from(new Set(chunks));
}

export function detectBestChatProfileId(content: string, profiles: ChatProfile[]) {
  const normalizedContent = content.trim();
  if (!normalizedContent || profiles.length === 0) return '';
  if (profiles.length === 1) return profiles[0].id;

  const lines = normalizedContent.split(/\r?\n/);
  const scored = profiles
    .map((profile) => {
      const rightAliases = splitNickAliases(profile.rightNick, '你');
      const leftAliases = splitNickAliases(profile.leftNick, 'M');
      const rightHits = countAliasHits(normalizedContent, lines, rightAliases);
      const leftHits = countAliasHits(normalizedContent, lines, leftAliases);
      const score = rightHits + leftHits + (rightHits > 0 && leftHits > 0 ? 4 : 0);

      return { profileId: profile.id, score };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  const second = scored[1];

  if (!best || best.score < 4) return '';
  if (second && best.score - second.score < 2) return '';

  return best.profileId;
}
