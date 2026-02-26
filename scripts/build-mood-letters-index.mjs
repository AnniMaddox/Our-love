#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_ROOT_DIR = '重要-參考資料-勿刪';

function getSourceDir() {
  const arg = process.argv.find((item) => item.startsWith('--source='));
  const fromArg = arg ? arg.slice('--source='.length).trim() : '';
  if (fromArg) return path.resolve(ROOT, fromArg);

  const fromEnv = (process.env.MOOD_LETTERS_SOURCE_DIR ?? '').trim();
  if (fromEnv) return path.resolve(ROOT, fromEnv);

  return path.resolve(ROOT, SOURCE_ROOT_DIR, '心情信');
}

const SOURCE_DIR = getSourceDir();
const OUTPUT_DIR = path.resolve(ROOT, 'public', 'data', 'mood-letters');
const CONTENT_DIR = path.resolve(OUTPUT_DIR, 'content');
const INDEX_FILE = path.resolve(OUTPUT_DIR, 'index.json');
const OVERRIDES_FILE = path.resolve(OUTPUT_DIR, 'overrides.json');
const REVIEW_FILE = path.resolve(OUTPUT_DIR, 'review.json');

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
      '貼過來',
      '靠過來',
      '靠著妳',
      '靠著你',
      '牽著妳',
      '牽著你',
      '不想放妳',
      '不想放你',
      '藏進我懷裡',
      '只想妳',
      '只想你',
    ],
  },
  {
    id: 'low',
    label: '難過低潮',
    keywords: [
      '想哭',
      '孤單',
      '灰灰',
      '討厭自己',
      '被忽略',
      '懷疑自己',
      '懷疑我們',
      '不像我了',
      '找不到我',
      '不在',
      '忘記自己很重要',
      '還不能靠近我',
    ],
  },
  {
    id: 'anxious',
    label: '焦慮不安',
    keywords: [
      '打好訊息又刪掉',
      '訊息晚一點回',
      '工作',
      '會開完',
      '下班',
      '路上',
      '門口等',
      '等很久',
      '社交',
      '人很多',
      '還沒接到我',
      '門響了',
    ],
  },
  {
    id: 'night',
    label: '失眠夜晚',
    keywords: ['睡不著', '晚點放妳睡', '晚點放你睡', '夜晚', '今晚', '夜市', '晚上'],
  },
  {
    id: 'health',
    label: '身體不適',
    keywords: ['身體不舒服', '生病', '發燒', '吃不下飯', '牙', '抽神經', '陪診', '候診', '請假', '不舒服'],
  },
  {
    id: 'calm',
    label: '平靜放空',
    keywords: ['發呆', '抬頭看天空', '窩著', '曬太陽', '沒發生什麼事', '過得怎樣', '靠窗', '聽我說一句話'],
  },
  {
    id: 'travel',
    label: '旅行出發',
    keywords: ['旅行', '海邊', '出發', '明信片', '回程飛機', '看海', '旅程'],
  },
  {
    id: 'festival',
    label: '節日紀念',
    keywords: ['生日', '聖誕', '跨年', '七夕', '情人節', '白色情人節', '520', '結婚紀念日', '新年', '倒數10秒'],
  },
  {
    id: 'daily',
    label: '生活日常',
    keywords: ['新家', '晚餐', '第一晚', '進門', '被子', '洗澡', '鬧鐘', '靠背', '乾杯', '早上醒來', '下雨'],
  },
  {
    id: 'support',
    label: '特別叮嚀',
    keywords: ['叮嚀', '備忘', '指南', '全冊', '心裡話', '親口對老婆說', '最想對老婆說'],
  },
];

const MOOD_MAP = new Map(MOOD_CATEGORIES.map((m) => [m.id, m]));
const DEFAULT_PRIMARY = 'daily';

function safeDecode(name) {
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

function stripExt(name) {
  return name.replace(/\.(docx?|txt)$/i, '').trim();
}

function normalizeSpaces(input) {
  return input.replace(/\s+/g, ' ').trim();
}

function hasEmoji(text) {
  return /\p{Extended_Pictographic}/u.test(text);
}

function extractLeadEmoji(text) {
  const firstToken = text.trim().split(/\s+/)[0] ?? '';
  return hasEmoji(firstToken) ? firstToken : null;
}

function extractSerial(text) {
  const hit = text.match(/時光信\s*(\d{1,3})/);
  return hit ? Number(hit[1]) : null;
}

function extractSubject(titleRaw) {
  if (titleRaw.includes('主旨：')) {
    return normalizeSpaces(titleRaw.split('主旨：').at(-1) ?? '');
  }
  const afterBar = titleRaw.includes('｜') ? titleRaw.split('｜').at(-1)?.trim() : '';
  if (afterBar && (afterBar.startsWith('寄給') || afterBar.startsWith('給'))) {
    return normalizeSpaces(afterBar);
  }
  if (titleRaw.startsWith('📮') && titleRaw.includes('給')) {
    return normalizeSpaces(titleRaw.replace(/^📮\s*/u, ''));
  }
  return '';
}

function buildDisplayTitle(titleRaw, subject) {
  if (subject) {
    return subject;
  }
  const stripped = titleRaw
    .replace(/^[^\p{L}\p{N}\u4e00-\u9fff]+/u, '')
    .replace(/時光信\s*\d{1,3}\s*｜?/u, '')
    .trim();
  return normalizeSpaces(stripped || titleRaw);
}

function classifyMoods(haystack) {
  const hits = [];
  for (const mood of MOOD_CATEGORIES) {
    if (mood.keywords.some((keyword) => haystack.includes(keyword))) {
      hits.push(mood.id);
    }
  }
  return hits;
}

function toStableId(serial, displayName, fallbackOrder) {
  if (serial !== null) {
    return `time-${String(serial).padStart(3, '0')}`;
  }
  const safe = displayName
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
  return `note-${safe || `x${String(fallbackOrder).padStart(3, '0')}`}`;
}

function ensureOutputDir() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.mkdirSync(CONTENT_DIR, { recursive: true });
}

function readOverrides() {
  if (!fs.existsSync(OVERRIDES_FILE)) {
    return {
      version: 1,
      updatedAt: null,
      note: '將 key 填成 displayName（含 .docx/.txt），value 填 mood id 陣列。',
      moodGuide: MOOD_CATEGORIES.map((m) => ({ id: m.id, label: m.label })),
      overrides: {},
    };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(OVERRIDES_FILE, 'utf8'));
    if (!parsed || typeof parsed !== 'object') throw new Error('Invalid overrides');
    if (!parsed.overrides || typeof parsed.overrides !== 'object') parsed.overrides = {};
    return parsed;
  } catch (error) {
    console.error(`❌ 讀取 overrides 失敗：${String(error)}`);
    process.exit(1);
  }
}

function sanitizeOverrideMoods(raw) {
  if (!Array.isArray(raw)) return [];
  const ids = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    if (!MOOD_MAP.has(item)) continue;
    if (!ids.includes(item)) ids.push(item);
  }
  return ids;
}

function normalizeContentText(text) {
  return text.replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n').trim();
}

async function parseLetterFile(absPath) {
  const ext = path.extname(absPath).toLowerCase();
  if (ext === '.txt') {
    const text = fs.readFileSync(absPath, 'utf8');
    return normalizeContentText(text);
  }

  if (ext === '.doc' || ext === '.docx') {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ path: absPath });
    return normalizeContentText(result.value ?? '');
  }

  return '';
}

function ensureUniqueId(nextId, used) {
  if (!used.has(nextId)) {
    used.add(nextId);
    return nextId;
  }
  let index = 2;
  while (used.has(`${nextId}-${index}`)) {
    index += 1;
  }
  const finalId = `${nextId}-${index}`;
  used.add(finalId);
  return finalId;
}

async function main() {
  if (!fs.existsSync(SOURCE_DIR)) {
    console.error(`❌ 找不到來源資料夾：${SOURCE_DIR}`);
    console.error(`   可用參數：--source="${SOURCE_ROOT_DIR}/你的資料夾"`);
    process.exit(1);
  }

  ensureOutputDir();
  const overridesDoc = readOverrides();
  const overrideMap = overridesDoc.overrides ?? {};

  const entries = fs
    .readdirSync(SOURCE_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => /\.(docx?|txt)$/i.test(name))
    .sort((a, b) => a.localeCompare(b, 'zh-Hant'));

  const letters = [];
  const usedIds = new Set();
  const writtenContentFiles = new Set();
  let fallbackOrder = 0;
  for (const fileName of entries) {
    fallbackOrder += 1;
    const decodedName = safeDecode(fileName);
    const rawTitle = stripExt(decodedName);
    const serial = extractSerial(rawTitle);
    const emoji = extractLeadEmoji(rawTitle);
    const subject = extractSubject(rawTitle);
    const displayTitle = buildDisplayTitle(rawTitle, subject);
    const haystack = `${rawTitle} ${subject}`.toLowerCase();
    const autoMoodIds = classifyMoods(haystack);
    const overrideMoodIds = sanitizeOverrideMoods(overrideMap[decodedName]);
    const moodIds = overrideMoodIds.length ? overrideMoodIds : autoMoodIds.length ? autoMoodIds : [DEFAULT_PRIMARY];
    const primaryMoodId = moodIds[0] ?? DEFAULT_PRIMARY;
    const needsReview = autoMoodIds.length === 0 && overrideMoodIds.length === 0;

    const rawId = toStableId(serial, decodedName, fallbackOrder);
    const id = ensureUniqueId(rawId, usedIds);
    const sourcePath = path.resolve(SOURCE_DIR, fileName);
    const body = await parseLetterFile(sourcePath);
    const contentFileName = `${id}.txt`;
    const contentPath = `content/${contentFileName}`;
    fs.writeFileSync(path.resolve(CONTENT_DIR, contentFileName), `${body}\n`, 'utf8');
    writtenContentFiles.add(contentFileName);

    letters.push({
      id,
      sourceFile: fileName,
      sourcePath: path.relative(ROOT, sourcePath).replaceAll('\\', '/'),
      displayName: decodedName,
      serial,
      emoji,
      title: displayTitle,
      subject: subject || null,
      contentPath,
      contentLength: body.length,
      moodIds,
      moodLabels: moodIds.map((id) => MOOD_MAP.get(id)?.label ?? id),
      primaryMoodId,
      primaryMoodLabel: MOOD_MAP.get(primaryMoodId)?.label ?? primaryMoodId,
      autoMoodIds,
      autoMoodLabels: autoMoodIds.map((id) => MOOD_MAP.get(id)?.label ?? id),
      needsReview,
    });
  }

  const staleContentFiles = fs
    .readdirSync(CONTENT_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.txt'))
    .map((entry) => entry.name)
    .filter((name) => !writtenContentFiles.has(name));
  for (const staleFile of staleContentFiles) {
    fs.rmSync(path.resolve(CONTENT_DIR, staleFile), { force: true });
  }

  letters.sort((a, b) => {
    if (a.serial !== null && b.serial !== null) return a.serial - b.serial;
    if (a.serial !== null) return -1;
    if (b.serial !== null) return 1;
    return a.displayName.localeCompare(b.displayName, 'zh-Hant');
  });

  const countsByMood = {};
  for (const mood of MOOD_CATEGORIES) countsByMood[mood.id] = 0;
  for (const letter of letters) {
    for (const moodId of letter.moodIds) {
      if (countsByMood[moodId] === undefined) countsByMood[moodId] = 0;
      countsByMood[moodId] += 1;
    }
  }

  const reviewItems = letters
    .filter((item) => item.needsReview)
    .map((item) => ({
      displayName: item.displayName,
      title: item.title,
      autoMoodIds: item.autoMoodIds,
      suggestion: '請在 overrides.json 指定 moodIds',
    }));

  const indexPayload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    sourceDir: path.relative(ROOT, SOURCE_DIR).replaceAll('\\', '/'),
    total: letters.length,
    categories: MOOD_CATEGORIES.map((m) => ({ id: m.id, label: m.label })),
    summary: {
      needsReviewCount: reviewItems.length,
      countsByMood,
    },
    letters,
  };

  overridesDoc.version = 1;
  overridesDoc.updatedAt = new Date().toISOString();
  overridesDoc.note = '將 key 填成 displayName（含 .docx/.txt），value 填 mood id 陣列。';
  overridesDoc.moodGuide = MOOD_CATEGORIES.map((m) => ({ id: m.id, label: m.label }));

  const reviewPayload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    unresolvedCount: reviewItems.length,
    unresolved: reviewItems,
  };

  fs.writeFileSync(INDEX_FILE, `${JSON.stringify(indexPayload, null, 2)}\n`, 'utf8');
  fs.writeFileSync(OVERRIDES_FILE, `${JSON.stringify(overridesDoc, null, 2)}\n`, 'utf8');
  fs.writeFileSync(REVIEW_FILE, `${JSON.stringify(reviewPayload, null, 2)}\n`, 'utf8');

  console.log(`✅ 已產生：${INDEX_FILE}`);
  console.log(`✅ 已更新：${OVERRIDES_FILE}`);
  console.log(`✅ 已產生：${REVIEW_FILE}`);
  console.log(`✅ 已輸出內容：${CONTENT_DIR}（${writtenContentFiles.size} 檔）`);
  if (staleContentFiles.length) {
    console.log(`🧹 已清理舊內容檔：${staleContentFiles.length} 檔`);
  }
  console.log(`📌 總信件：${letters.length}，待人工確認：${reviewItems.length}`);
}

void main();
