#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_ROOT_DIR = '重要-參考資料-勿刪';

function resolveSourcePath(argPrefix, envKey, fallbackRelativePath) {
  const arg = process.argv.find((item) => item.startsWith(argPrefix));
  const fromArg = arg ? arg.slice(argPrefix.length).trim() : '';
  if (fromArg) return path.resolve(ROOT, fromArg);

  const fromEnv = (process.env[envKey] ?? '').trim();
  if (fromEnv) return path.resolve(ROOT, fromEnv);

  return path.resolve(ROOT, fallbackRelativePath);
}

const DEFAULT_SOURCE_DIR = resolveSourcePath('--source=', 'MASTER_POOL_SOURCE_DIR', `${SOURCE_ROOT_DIR}/情書整理2`);
const MOOD_SOURCE_DIR = resolveSourcePath('--mood-source=', 'MASTER_POOL_MOOD_SOURCE_DIR', `${SOURCE_ROOT_DIR}/心情信`);
const ANNUAL_SOURCE_DIR = resolveSourcePath('--annual-source=', 'MASTER_POOL_ANNUAL_SOURCE_DIR', `${SOURCE_ROOT_DIR}/年度信件`);
const EXTRA_SOURCE_MOUNTS = [
  {
    sourceDir: MOOD_SOURCE_DIR,
    topFolder: '80-2026-0211-牙醫',
    virtualSubdir: '__心情信__',
  },
  {
    sourceDir: ANNUAL_SOURCE_DIR,
    topFolder: '82-2026-0212-婚禮-30年的信',
    virtualSubdir: '__年度信件__',
  },
];
const OUTPUT_DIR = path.resolve(ROOT, 'public', 'data', 'master-pool');
const CONTENT_DIR = path.resolve(OUTPUT_DIR, 'content');
const VIEWS_DIR = path.resolve(OUTPUT_DIR, 'views');
const INDEX_FILE = path.resolve(OUTPUT_DIR, 'index.json');
const REVIEW_FILE = path.resolve(OUTPUT_DIR, 'review.json');
const OVERRIDES_FILE = path.resolve(OUTPUT_DIR, 'overrides.json');
const BIRTHDAY_CURRENT_DEFAULT_DATE = toDateAtMidnight(2025, 9, 1);

const ROUTE_GUIDE = [
  { id: 'diary', label: '日記' },
  { id: 'letters', label: '情書' },
  { id: 'if', label: '如果的事' },
  { id: 'intro', label: '自我介紹' },
  { id: 'birthday', label: '生日信' },
  { id: 'memo', label: '備忘錄' },
  { id: 'ramble', label: '碎碎念' },
  { id: 'mood', label: '心情星球' },
];

const ROUTE_IDS = new Set(ROUTE_GUIDE.map((item) => item.id));

const DIARY_KEYWORDS = ['日記', 'diary', 'journal', '日誌'];
const LETTER_KEYWORDS = [
  '情書',
  'love letter',
  'lover letter',
  '寫給妳',
  '寫給你',
  '寫給老婆',
  '給妳的情書',
  '給你的情書',
  '給anni的情書',
  '給妳的信',
  '給你的信',
  '寫給anni',
  'to_anni_love_letter',
  'letter_to_anni',
];
const IF_KEYWORDS = ['如果的事', '如果'];
const INTRO_KEYWORDS = ['自我介紹', 'intro', 'about me', '關於我'];
const MEMO_KEYWORDS = [
  '備忘錄',
  '備忘',
  'memo',
  'note',
  '提醒',
  '問卷',
  '自問自答',
  '回覆',
  '心得',
  '規則',
  '設定',
  '筆記',
  '記錄',
  '回覆',
  '問答',
  '觀察',
  '歌單',
  '簡譜',
  '資料',
  '大綱',
  '總結',
  'index',
  'api',
  '故事接龍',
  '簡譜',
  '歌詞',
];
const BIRTHDAY_KEYWORDS = ['生日', 'birthday', '壽星'];
const RAMBLE_KEYWORDS = ['碎碎念'];

const MOOD_CATEGORIES = [
  {
    id: 'longing',
    label: '想你抱抱',
    keywords: [
      '想妳',
      '想你',
      '黏妳',
      '黏你',
      '抱妳',
      '抱你',
      '親妳',
      '親你',
      '貼著妳',
      '貼著你',
      '只想妳',
      '只想你',
    ],
  },
  {
    id: 'low',
    label: '難過低潮',
    keywords: ['想哭', '孤單', '低潮', '灰灰', '不在', '難受', '失落'],
  },
  {
    id: 'anxious',
    label: '焦慮不安',
    keywords: ['焦慮', '不安', '擔心', '等很久', '門口', '訊息', '會開完', '社交'],
  },
  {
    id: 'night',
    label: '失眠夜晚',
    keywords: ['睡不著', '失眠', '夜晚', '今晚', '半夜', '凌晨'],
  },
  {
    id: 'health',
    label: '身體不適',
    keywords: ['生病', '不舒服', '發燒', '牙醫', '抽神經', '陪診', '身體'],
  },
  {
    id: 'calm',
    label: '平靜放空',
    keywords: ['發呆', '放空', '曬太陽', '靠窗', '安靜', '窩著'],
  },
  {
    id: 'travel',
    label: '旅行出發',
    keywords: ['旅行', '出發', '看海', '海邊', '明信片', '旅程'],
  },
  {
    id: 'festival',
    label: '節日紀念',
    keywords: ['生日', '情人節', '七夕', '聖誕', '跨年', '520', '紀念日'],
  },
  {
    id: 'daily',
    label: '生活日常',
    keywords: ['下班', '進門', '晚餐', '日常', '生活', '新家'],
  },
  {
    id: 'support',
    label: '特別叮嚀',
    keywords: ['叮嚀', '備忘', '指南', '提醒', '心裡話'],
  },
];

const MOOD_MAP = new Map(MOOD_CATEGORIES.map((item) => [item.id, item.label]));
const MOOD_SIGNAL_KEYWORDS = ['時光信', '主旨', '情緒', '老婆：', '老婆,', '想妳', '想你', '抱抱'];

function getSourceDir() {
  return DEFAULT_SOURCE_DIR;
}

function safeDecode(name) {
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

function normalizeText(text) {
  return text.replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n').trim();
}

function normalizeLine(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function stripExt(name) {
  return name.replace(/\.(docx?|txt|md)$/i, '').trim();
}

function slugify(input) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function simpleHash(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function toDateAtMidnight(year, month, day) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  date.setHours(0, 0, 0, 0);
  return date;
}

function isSeptember2025(timestamp) {
  if (typeof timestamp !== 'number') return false;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return false;
  return date.getFullYear() === 2025 && date.getMonth() === 8;
}

function normalizeBirthdayCurrentDate(timestamp) {
  if (!BIRTHDAY_CURRENT_DEFAULT_DATE) return null;
  if (typeof timestamp !== 'number') return BIRTHDAY_CURRENT_DEFAULT_DATE;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return BIRTHDAY_CURRENT_DEFAULT_DATE;
  const day = Math.min(Math.max(date.getDate(), 1), 30);
  return toDateAtMidnight(2025, 9, day) ?? BIRTHDAY_CURRENT_DEFAULT_DATE;
}

function parseDateFromText(source) {
  const input = source.trim();
  if (!input) return null;

  const ymdPatterns = [
    /(?:^|[^\d])((?:19|20)\d{2})[\s_.\/-]*年?[\s_.\/-]*(1[0-2]|0?[1-9])[\s_.\/-]*月?[\s_.\/-]*(3[01]|[12]\d|0?[1-9])\s*日?(?=$|[^\d])/u,
    /(?:^|[^\d])((?:19|20)\d{2})(1[0-2]|0[1-9])(3[01]|[12]\d|0[1-9])(?=$|[^\d])/u,
  ];
  for (const pattern of ymdPatterns) {
    const matched = input.match(pattern);
    if (!matched) continue;
    const parsed = toDateAtMidnight(Number(matched[1]), Number(matched[2]), Number(matched[3]));
    if (parsed) return parsed;
  }

  // Handles typo-like year patterns such as "20260-0214" (treated as 2026-02-14).
  const extendedYear = input.match(/(?:^|[^\d])((?:19|20)\d{2})\d[\s_.\/-]*(1[0-2]|0[1-9])[\s_.\/-]*(3[01]|[12]\d|0[1-9])(?=$|[^\d])/u);
  if (extendedYear) {
    const parsed = toDateAtMidnight(Number(extendedYear[1]), Number(extendedYear[2]), Number(extendedYear[3]));
    if (parsed) return parsed;
  }

  const mdyPattern = /(?:^|[^\d])(1[0-2]|0?[1-9])[\/._-](3[01]|[12]\d|0?[1-9])[\/._-]((?:19|20)\d{2})(?=$|[^\d])/u;
  const mdyMatch = input.match(mdyPattern);
  if (mdyMatch) {
    const parsed = toDateAtMidnight(Number(mdyMatch[3]), Number(mdyMatch[1]), Number(mdyMatch[2]));
    if (parsed) return parsed;
  }

  return null;
}

function parseMonthDayFromText(source) {
  const input = source.trim();
  if (!input) return null;

  // Pattern with explicit separator (preferred; avoids matching folder code like "59").
  const withSep = input.match(/(?:^|[^\d])(1[0-2]|0?[1-9])[\/._-](3[01]|[12]\d|0?[1-9])(?=$|[^\d])/u);
  if (withSep) {
    return {
      month: Number(withSep[1]),
      day: Number(withSep[2]),
    };
  }

  // Compact MMDD (e.g. "0929"), still requiring boundary.
  const compact = input.match(/(?:^|[^\d])(1[0-2]|0[1-9])(3[01]|[12]\d|0[1-9])(?=$|[^\d])/u);
  if (compact) {
    return {
      month: Number(compact[1]),
      day: Number(compact[2]),
    };
  }

  return null;
}

function parseYearFromText(source) {
  const input = source.trim();
  if (!input) return null;
  const hit = input.match(/(?:^|[^\d])((?:19|20)\d{2})(?=$|[^\d])/u);
  if (!hit) return null;
  return Number(hit[1]);
}

function containsAny(haystack, keywords) {
  return keywords.some((keyword) => haystack.includes(keyword.toLowerCase()));
}

function classifyMoods(haystackLower) {
  const ids = [];
  for (const mood of MOOD_CATEGORIES) {
    const hit = mood.keywords.some((keyword) => haystackLower.includes(keyword.toLowerCase()));
    if (hit) ids.push(mood.id);
  }
  return ids;
}

async function parseBodyText(absPath) {
  const ext = path.extname(absPath).toLowerCase();
  if (ext === '.txt' || ext === '.md') {
    return {
      text: normalizeText(fs.readFileSync(absPath, 'utf8')),
      error: null,
    };
  }

  if (ext === '.doc' || ext === '.docx') {
    try {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ path: absPath });
      return {
        text: normalizeText(result.value ?? ''),
        error: null,
      };
    } catch (error) {
      return {
        text: '',
        error: `無法解析 Word：${String(error)}`,
      };
    }
  }

  return {
    text: '',
    error: '不支援的副檔名',
  };
}

function readOverrides() {
  if (!fs.existsSync(OVERRIDES_FILE)) {
    return {
      version: 1,
      updatedAt: null,
      note: 'key 用 sourceRelPath；可覆蓋 routes/moodIds/writtenAt/birthdayBucket/title',
      routeGuide: ROUTE_GUIDE,
      moodGuide: MOOD_CATEGORIES.map((item) => ({ id: item.id, label: item.label })),
      overrides: {},
    };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(OVERRIDES_FILE, 'utf8'));
    if (!parsed || typeof parsed !== 'object') throw new Error('invalid overrides file');
    if (!parsed.overrides || typeof parsed.overrides !== 'object') parsed.overrides = {};
    return parsed;
  } catch (error) {
    console.error(`❌ 讀取 overrides 失敗：${String(error)}`);
    process.exit(1);
  }
}

function sanitizeOverrideRoutes(inputRoutes) {
  if (!Array.isArray(inputRoutes)) return [];
  const routes = [];
  for (const route of inputRoutes) {
    if (typeof route !== 'string') continue;
    if (!ROUTE_IDS.has(route)) continue;
    if (!routes.includes(route)) routes.push(route);
  }
  return routes;
}

function sanitizeOverrideMoodIds(inputMoodIds) {
  if (!Array.isArray(inputMoodIds)) return [];
  const ids = [];
  for (const moodId of inputMoodIds) {
    if (typeof moodId !== 'string') continue;
    if (!MOOD_MAP.has(moodId)) continue;
    if (!ids.includes(moodId)) ids.push(moodId);
  }
  return ids;
}

function ensureDirs() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.mkdirSync(CONTENT_DIR, { recursive: true });
  fs.mkdirSync(VIEWS_DIR, { recursive: true });
}

function formatDateYmd(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function extractTitleFromBody(text, fallbackTitle) {
  const lines = text
    .split(/\n+/)
    .map((line) => normalizeLine(line))
    .filter((line) => line.length > 0);
  if (!lines.length) return fallbackTitle;
  const candidate = lines[0];
  if (candidate.length >= 4 && candidate.length <= 80) return candidate;
  return fallbackTitle;
}

async function main() {
  const sourceDir = getSourceDir();
  if (!fs.existsSync(sourceDir)) {
    console.error(`❌ 找不到來源資料夾：${sourceDir}`);
    process.exit(1);
  }

  ensureDirs();
  const overridesDoc = readOverrides();
  const overrideMap = overridesDoc.overrides ?? {};

  const topFolders = fs
    .readdirSync(sourceDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  for (const mount of EXTRA_SOURCE_MOUNTS) {
    if (!topFolders.includes(mount.topFolder)) {
      topFolders.push(mount.topFolder);
    }
  }
  topFolders.sort((a, b) => a.localeCompare(b, 'zh-Hant'));

  const topFolderMeta = new Map();
  const fullDateByCodeAndMonthDay = new Map();

  for (const folderName of topFolders) {
    const folderCodeMatch = folderName.match(/^(\d{1,4})(?=[-_－—:：、.。\s]|$)/);
    const folderCode = folderCodeMatch ? folderCodeMatch[1] : null;
    const parsedDate = parseDateFromText(folderName);
    const monthDay = parsedDate
      ? { month: parsedDate.getMonth() + 1, day: parsedDate.getDate() }
      : parseMonthDayFromText(folderName);

    topFolderMeta.set(folderName, {
      folderCode,
      folderDate: parsedDate,
      folderDateSource: parsedDate ? 'folder-name' : null,
      monthDay,
    });

    if (parsedDate && folderCode && monthDay) {
      const key = `${folderCode}-${String(monthDay.month).padStart(2, '0')}${String(monthDay.day).padStart(2, '0')}`;
      fullDateByCodeAndMonthDay.set(key, parsedDate);
    }
  }

  // Fallback for folders with month/day but no valid year.
  for (const folderName of topFolders) {
    const current = topFolderMeta.get(folderName);
    if (!current || current.folderDate || !current.folderCode || !current.monthDay) continue;
    const key = `${current.folderCode}-${String(current.monthDay.month).padStart(2, '0')}${String(current.monthDay.day).padStart(2, '0')}`;
    const inferred = fullDateByCodeAndMonthDay.get(key);
    if (!inferred) continue;
    current.folderDate = inferred;
    current.folderDateSource = 'folder-name-inferred';
  }

  const fileRecords = [];
  for (const folderName of topFolders) {
    const folderAbs = path.resolve(sourceDir, folderName);
    if (!fs.existsSync(folderAbs)) continue;
    const stack = [folderAbs];
    while (stack.length) {
      const current = stack.pop();
      if (!current) continue;
      const entries = fs.readdirSync(current, { withFileTypes: true });
      for (const entry of entries) {
        const abs = path.resolve(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(abs);
          continue;
        }
        if (!/\.(docx?|txt|md)$/i.test(entry.name)) continue;
        const relPathRaw = path.relative(sourceDir, abs).replaceAll('\\', '/');
        fileRecords.push({
          absPath: abs,
          relPathRaw,
          sourcePathRaw: path.relative(ROOT, abs).replaceAll('\\', '/'),
        });
      }
    }
  }

  for (const mount of EXTRA_SOURCE_MOUNTS) {
    if (!fs.existsSync(mount.sourceDir)) continue;
    const stack = [mount.sourceDir];
    while (stack.length) {
      const current = stack.pop();
      if (!current) continue;
      const entries = fs.readdirSync(current, { withFileTypes: true });
      for (const entry of entries) {
        const abs = path.resolve(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(abs);
          continue;
        }
        if (!/\.(docx?|txt|md)$/i.test(entry.name)) continue;
        const relFromMount = path.relative(mount.sourceDir, abs).replaceAll('\\', '/');
        const relPathRaw = `${mount.topFolder}/${mount.virtualSubdir}/${relFromMount}`;
        fileRecords.push({
          absPath: abs,
          relPathRaw,
          sourcePathRaw: path.relative(ROOT, abs).replaceAll('\\', '/'),
        });
      }
    }
  }

  fileRecords.sort((a, b) => a.relPathRaw.localeCompare(b.relPathRaw, 'zh-Hant'));

  const docs = [];
  const review = [];
  const writtenContentFiles = new Set();
  for (const fileRecord of fileRecords) {
    const absPath = fileRecord.absPath;
    const relPathRaw = fileRecord.relPathRaw;
    const relPath = safeDecode(relPathRaw);
    const relParts = relPath.split('/');
    const topFolder = relParts[0] ?? '';
    const fileName = relParts[relParts.length - 1] ?? '';
    const fileTitleFallback = stripExt(fileName);
    const folderMeta = topFolderMeta.get(topFolder) ?? {
      folderCode: null,
      folderDate: null,
      folderDateSource: null,
      monthDay: null,
    };

    const parsed = await parseBodyText(absPath);
    const bodyText = parsed.text;
    const lines = bodyText
      .split(/\n+/)
      .map((line) => normalizeLine(line))
      .filter((line) => line.length > 0);
    const title = extractTitleFromBody(bodyText, fileTitleFallback);

    let writtenAt = null;
    let writtenAtSource = null;
    let monthDayHit = null;
    let yearHint = null;
    const dateCandidates = [
      relPath,
      fileName,
      fileTitleFallback,
      title,
      ...lines.slice(0, 3),
      ...lines.slice(-2),
    ];
    for (const candidate of dateCandidates) {
      if (yearHint === null) {
        const y = parseYearFromText(candidate);
        if (typeof y === 'number') yearHint = y;
      }
      if (monthDayHit === null) {
        const md = parseMonthDayFromText(candidate);
        if (md) monthDayHit = md;
      }
      const dateHit = parseDateFromText(candidate);
      if (!dateHit) continue;
      writtenAt = dateHit.getTime();
      writtenAtSource = 'content';
      break;
    }

    // If we only have month/day (e.g., 0929), combine with inferred year.
    if (writtenAt === null && monthDayHit) {
      const inferredYear =
        (folderMeta.folderDate ? folderMeta.folderDate.getFullYear() : null) ??
        yearHint;
      if (typeof inferredYear === 'number') {
        const inferredDate = toDateAtMidnight(inferredYear, monthDayHit.month, monthDayHit.day);
        if (inferredDate) {
          writtenAt = inferredDate.getTime();
          writtenAtSource = 'content-monthday+year';
        }
      }
    }
    if (writtenAt === null && folderMeta.folderDate) {
      writtenAt = folderMeta.folderDate.getTime();
      writtenAtSource = folderMeta.folderDateSource || 'folder-name';
    }

    const routeBaseHaystackLower = normalizeText(`${topFolder}\n${fileName}\n${title}`).toLowerCase();
    const routeHaystackLower = normalizeText(
      `${topFolder}\n${fileName}\n${title}\n${lines.slice(0, 3).join('\n')}`,
    ).toLowerCase();
    const moodHaystackLower = normalizeText(
      `${topFolder}\n${fileName}\n${title}\n${lines.slice(0, 6).join('\n')}\n${lines.slice(-2).join('\n')}`,
    ).toLowerCase();

    const isDiary = containsAny(routeHaystackLower, DIARY_KEYWORDS);
    const isLetter = containsAny(routeHaystackLower, LETTER_KEYWORDS);
    const isIf = containsAny(routeBaseHaystackLower, IF_KEYWORDS);
    const isIntro = containsAny(routeHaystackLower, INTRO_KEYWORDS);
    const isMemo = containsAny(routeHaystackLower, MEMO_KEYWORDS);
    const isBirthday = topFolder.includes('生日') || containsAny(routeHaystackLower, BIRTHDAY_KEYWORDS);
    const isRamble = topFolder.includes('碎碎念') || containsAny(routeHaystackLower, RAMBLE_KEYWORDS);

    const autoMoodIds = classifyMoods(moodHaystackLower);
    const folderCode = folderMeta.folderCode;
    const isSpecial59561 = (folderCode === '59' || folderCode === '61') && !isMemo && !isLetter && !isBirthday && !isDiary;
    const moodSignal =
      fileName.includes('時光信') ||
      topFolder.includes('心情') ||
      containsAny(moodHaystackLower, MOOD_SIGNAL_KEYWORDS);
    const isMood = isSpecial59561 || moodSignal;
    const moodIds = isMood ? (autoMoodIds.length ? autoMoodIds : ['daily']) : [];

    const routes = [];
    if (isDiary) routes.push('diary');
    if (isLetter) routes.push('letters');
    if (isIf) routes.push('if');
    if (isIntro) routes.push('intro');
    if (isBirthday) routes.push('birthday');
    if (isMemo) routes.push('memo');
    if (isRamble) routes.push('ramble');
    if (isMood) routes.push('mood');

    const routeSet = Array.from(new Set(routes));
    const isFutureBirthdayByFolder = topFolder.includes('未來生日') || relPath.includes('未來生日');

    // User rule: except "未來生日", birthday letters are in 2025-09.
    if (routeSet.includes('birthday') && !isFutureBirthdayByFolder && !isSeptember2025(writtenAt)) {
      const normalized = normalizeBirthdayCurrentDate(writtenAt);
      if (normalized) {
        writtenAt = normalized.getTime();
        writtenAtSource = writtenAtSource ? 'birthday-normalized-2025-09' : 'birthday-default-2025-09';
      }
    }

    let birthdayBucket = null;
    if (routeSet.includes('birthday')) {
      birthdayBucket = isFutureBirthdayByFolder ? 'future' : 'current';
    }

    const override = overrideMap[relPath] ?? {};
    const overrideRoutes = sanitizeOverrideRoutes(override.routes);
    const finalRoutes = overrideRoutes.length ? overrideRoutes : routeSet;
    const overrideMoodIds = sanitizeOverrideMoodIds(override.moodIds);
    const finalMoodIds = finalRoutes.includes('mood')
      ? (overrideMoodIds.length ? overrideMoodIds : moodIds.length ? moodIds : ['daily'])
      : [];
    if (!finalRoutes.length) finalRoutes.push('unclassified');

    const overrideWrittenAtRaw = typeof override.writtenAt === 'string' ? parseDateFromText(override.writtenAt) : null;
    if (overrideWrittenAtRaw) {
      writtenAt = overrideWrittenAtRaw.getTime();
      writtenAtSource = 'override';
    }

    const overrideBirthdayBucket = typeof override.birthdayBucket === 'string' ? override.birthdayBucket : null;
    const finalBirthdayBucket = finalRoutes.includes('birthday')
      ? (overrideBirthdayBucket === 'future' || overrideBirthdayBucket === 'current' ? overrideBirthdayBucket : birthdayBucket || 'current')
      : null;

    const finalTitle = typeof override.title === 'string' && override.title.trim() ? override.title.trim() : title;

    const baseId = `doc-${simpleHash(relPath)}-${slugify(stripExt(fileName)) || 'entry'}`;
    const contentFileName = `${baseId}.txt`;
    fs.writeFileSync(path.resolve(CONTENT_DIR, contentFileName), `${bodyText}\n`, 'utf8');
    writtenContentFiles.add(contentFileName);

    const doc = {
      id: baseId,
      title: finalTitle,
      sourcePath: fileRecord.sourcePathRaw,
      sourceRelPath: relPath,
      sourceFolder: topFolder,
      sourceFolderCode: folderCode,
      sourceFolderDate: folderMeta.folderDate ? formatDateYmd(folderMeta.folderDate) : null,
      routes: finalRoutes,
      moodIds: finalMoodIds,
      moodLabels: finalMoodIds.map((id) => MOOD_MAP.get(id) ?? id),
      birthdayBucket: finalBirthdayBucket,
      writtenAt,
      writtenAtSource,
      contentPath: `content/${contentFileName}`,
      contentLength: bodyText.length,
    };
    docs.push(doc);

    const issues = [];
    if (parsed.error) issues.push(parsed.error);
    if (!bodyText.length) issues.push('正文為空');
    if (writtenAt === null) issues.push('缺少日期');
    if (finalRoutes.includes('unclassified')) issues.push('未分類');
    if (issues.length) {
      review.push({
        sourceRelPath: relPath,
        title: finalTitle,
        issues,
        suggestion: '可在 overrides.json 指定 routes / writtenAt / moodIds / birthdayBucket / title',
      });
    }
  }

  const staleContentFiles = fs
    .readdirSync(CONTENT_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.txt'))
    .map((entry) => entry.name)
    .filter((name) => !writtenContentFiles.has(name));
  for (const stale of staleContentFiles) {
    fs.rmSync(path.resolve(CONTENT_DIR, stale), { force: true });
  }

  docs.sort((a, b) => {
    const ta = typeof a.writtenAt === 'number' ? a.writtenAt : -1;
    const tb = typeof b.writtenAt === 'number' ? b.writtenAt : -1;
    if (ta !== tb) return tb - ta;
    return a.sourceRelPath.localeCompare(b.sourceRelPath, 'zh-Hant');
  });

  const byRoute = Object.fromEntries(ROUTE_GUIDE.map((item) => [item.id, []]));
  const byFolder = new Map();
  for (const doc of docs) {
    const folderKey = doc.sourceFolder;
    const group = byFolder.get(folderKey) ?? {
      folder: folderKey,
      folderCode: doc.sourceFolderCode,
      folderDate: doc.sourceFolderDate,
      count: 0,
      ids: [],
    };
    group.count += 1;
    group.ids.push(doc.id);
    byFolder.set(folderKey, group);

    for (const route of doc.routes) {
      if (!byRoute[route]) continue;
      byRoute[route].push(doc.id);
    }
  }

  const folders = Array.from(byFolder.values()).sort((a, b) => {
    const ta = a.folderDate ? Date.parse(a.folderDate) : -1;
    const tb = b.folderDate ? Date.parse(b.folderDate) : -1;
    if (ta !== tb) return tb - ta;
    return a.folder.localeCompare(b.folder, 'zh-Hant');
  });

  const summary = {
    total: docs.length,
    datedCount: docs.filter((item) => typeof item.writtenAt === 'number').length,
    undatedCount: docs.filter((item) => item.writtenAt === null).length,
    reviewCount: review.length,
    routeCounts: Object.fromEntries(Object.entries(byRoute).map(([key, ids]) => [key, ids.length])),
    birthdayCurrent: docs.filter((item) => item.birthdayBucket === 'current').length,
    birthdayFuture: docs.filter((item) => item.birthdayBucket === 'future').length,
  };

  const indexPayload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    sourceDir: path.relative(ROOT, sourceDir).replaceAll('\\', '/'),
    routes: ROUTE_GUIDE,
    moodGuide: MOOD_CATEGORIES.map((item) => ({ id: item.id, label: item.label })),
    summary,
    folders,
    docs,
  };

  const reviewPayload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    unresolvedCount: review.length,
    unresolved: review,
  };

  fs.writeFileSync(INDEX_FILE, `${JSON.stringify(indexPayload, null, 2)}\n`, 'utf8');
  fs.writeFileSync(REVIEW_FILE, `${JSON.stringify(reviewPayload, null, 2)}\n`, 'utf8');

  for (const route of ROUTE_GUIDE) {
    const payload = {
      version: 1,
      generatedAt: indexPayload.generatedAt,
      route: route.id,
      label: route.label,
      total: byRoute[route.id].length,
      ids: byRoute[route.id],
    };
    fs.writeFileSync(path.resolve(VIEWS_DIR, `${route.id}.json`), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  }

  const birthdayFuturePayload = {
    version: 1,
    generatedAt: indexPayload.generatedAt,
    route: 'birthday-future',
    label: '生日信（未來）',
    total: docs.filter((item) => item.birthdayBucket === 'future').length,
    ids: docs.filter((item) => item.birthdayBucket === 'future').map((item) => item.id),
  };
  const birthdayCurrentPayload = {
    version: 1,
    generatedAt: indexPayload.generatedAt,
    route: 'birthday-current',
    label: '生日信（現在）',
    total: docs.filter((item) => item.birthdayBucket === 'current').length,
    ids: docs.filter((item) => item.birthdayBucket === 'current').map((item) => item.id),
  };
  fs.writeFileSync(path.resolve(VIEWS_DIR, 'birthday-future.json'), `${JSON.stringify(birthdayFuturePayload, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.resolve(VIEWS_DIR, 'birthday-current.json'), `${JSON.stringify(birthdayCurrentPayload, null, 2)}\n`, 'utf8');

  overridesDoc.version = 1;
  overridesDoc.updatedAt = new Date().toISOString();
  overridesDoc.note = 'key 用 sourceRelPath；可覆蓋 routes/moodIds/writtenAt/birthdayBucket/title';
  overridesDoc.routeGuide = ROUTE_GUIDE;
  overridesDoc.moodGuide = MOOD_CATEGORIES.map((item) => ({ id: item.id, label: item.label }));
  fs.writeFileSync(OVERRIDES_FILE, `${JSON.stringify(overridesDoc, null, 2)}\n`, 'utf8');

  console.log(`✅ 已產生：${INDEX_FILE}`);
  console.log(`✅ 已產生：${REVIEW_FILE}`);
  console.log(`✅ 已更新：${OVERRIDES_FILE}`);
  console.log(`✅ 已輸出內容：${CONTENT_DIR}（${writtenContentFiles.size} 檔）`);
  console.log(`✅ 已輸出視角：${VIEWS_DIR}`);
  if (staleContentFiles.length) {
    console.log(`🧹 已清理舊內容檔：${staleContentFiles.length} 檔`);
  }
  console.log(
    `📌 總檔案 ${summary.total}｜日期已辨識 ${summary.datedCount}｜待確認 ${summary.reviewCount}｜生日(現在/未來) ${summary.birthdayCurrent}/${summary.birthdayFuture}`,
  );
}

void main();
