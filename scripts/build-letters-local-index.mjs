#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_ROOT_DIR = '重要-參考資料-勿刪';
const DEFAULT_SOURCE_DIR = path.resolve(ROOT, SOURCE_ROOT_DIR, '情書來源');
const OUTPUT_DIR = path.resolve(ROOT, 'public', 'data', 'letters-local');
const CONTENT_DIR = path.resolve(OUTPUT_DIR, 'content');
const INDEX_FILE = path.resolve(OUTPUT_DIR, 'index.json');
const REVIEW_FILE = path.resolve(OUTPUT_DIR, 'review.json');

function getSourceDir() {
  const arg = process.argv.find((item) => item.startsWith('--source='));
  if (!arg) return DEFAULT_SOURCE_DIR;
  const input = arg.slice('--source='.length).trim();
  if (!input) return DEFAULT_SOURCE_DIR;
  return path.resolve(ROOT, input);
}

function safeDecode(name) {
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

function stripExt(name) {
  return name.replace(/\.(docx?|txt|md)$/i, '').trim();
}

function normalizeText(text) {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitMeaningfulLines(text) {
  return normalizeText(text)
    .split(/\n+/)
    .map((line) => line.replace(/[\u200b\u200c\u200d]/g, '').trim())
    .filter((line) => line.length > 0);
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

function parseDateFromText(source) {
  const input = source.trim();
  if (!input) return null;

  const ymdPatterns = [
    /(?:^|[^\d])(19\d{2}|20\d{2})[\s_.\/-]*年?[\s_.\/-]*(1[0-2]|0?[1-9])[\s_.\/-]*月?[\s_.\/-]*(3[01]|[12]\d|0?[1-9])\s*日?(?=$|[^\d])/,
    /(?:^|[^\d])(19\d{2}|20\d{2})(1[0-2]|0[1-9])(3[01]|[12]\d|0[1-9])(?=$|[^\d])/,
  ];

  for (const pattern of ymdPatterns) {
    const matched = input.match(pattern);
    if (!matched) continue;
    const year = Number(matched[1]);
    const month = Number(matched[2]);
    const day = Number(matched[3]);
    const parsed = toDateAtMidnight(year, month, day);
    if (parsed) return parsed;
  }

  const mdyPattern = /(?:^|[^\d])(1[0-2]|0?[1-9])[\/.\-](3[01]|[12]\d|0?[1-9])[\/.\-](19\d{2}|20\d{2})(?=$|[^\d])/;
  const mdyMatch = input.match(mdyPattern);
  if (mdyMatch) {
    const month = Number(mdyMatch[1]);
    const day = Number(mdyMatch[2]);
    const year = Number(mdyMatch[3]);
    const parsed = toDateAtMidnight(year, month, day);
    if (parsed) return parsed;
  }

  return null;
}

function pickWrittenDate(fileName, title, body) {
  const lines = splitMeaningfulLines(body);
  const topLines = lines.slice(0, 3);
  const tailLines = lines.slice(-2);
  const dateCandidates = [fileName, title, ...topLines, ...tailLines];
  for (const candidate of dateCandidates) {
    const parsed = parseDateFromText(candidate);
    if (parsed) return parsed;
  }
  return null;
}

function slugify(input) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42);
}

function ensureUniqueId(baseId, used) {
  if (!used.has(baseId)) {
    used.add(baseId);
    return baseId;
  }
  let index = 2;
  while (used.has(`${baseId}-${index}`)) {
    index += 1;
  }
  const next = `${baseId}-${index}`;
  used.add(next);
  return next;
}

async function parseLetterFile(absPath) {
  const ext = path.extname(absPath).toLowerCase();
  if (ext === '.txt' || ext === '.md') {
    return normalizeText(fs.readFileSync(absPath, 'utf8'));
  }

  if (ext === '.doc' || ext === '.docx') {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ path: absPath });
    return normalizeText(result.value ?? '');
  }

  return '';
}

function ensureOutputDir() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.mkdirSync(CONTENT_DIR, { recursive: true });
}

async function main() {
  const sourceDir = getSourceDir();
  if (!fs.existsSync(sourceDir)) {
    console.error(`❌ 找不到來源資料夾：${sourceDir}`);
    console.error(`   可用參數：--source="${SOURCE_ROOT_DIR}/你的資料夾"`);
    process.exit(1);
  }

  ensureOutputDir();

  const entries = fs
    .readdirSync(sourceDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => /\.(docx?|txt|md)$/i.test(name))
    .sort((a, b) => a.localeCompare(b, 'zh-Hant'));

  const letters = [];
  const reviewItems = [];
  const usedIds = new Set();
  const writtenContentFiles = new Set();

  for (let index = 0; index < entries.length; index += 1) {
    const sourceFile = entries[index];
    if (!sourceFile) continue;

    const decodedName = safeDecode(sourceFile);
    const title = stripExt(decodedName);
    const body = await parseLetterFile(path.resolve(sourceDir, sourceFile));
    const baseId = slugify(title) || `letter-${String(index + 1).padStart(3, '0')}`;
    const id = ensureUniqueId(baseId, usedIds);
    const contentFileName = `${id}.txt`;
    const contentPath = `content/${contentFileName}`;
    fs.writeFileSync(path.resolve(CONTENT_DIR, contentFileName), `${body}\n`, 'utf8');
    writtenContentFiles.add(contentFileName);

    const writtenDate = pickWrittenDate(decodedName, title, body);
    const writtenAt = writtenDate ? writtenDate.getTime() : null;
    if (!writtenAt) {
      reviewItems.push({
        sourceFile: decodedName,
        title,
        suggestion: '檔名或正文前段補 YYYY-MM-DD / YYYY年MM月DD日 可提高辨識率',
      });
    }

    letters.push({
      id,
      name: decodedName,
      title,
      sourceFile,
      sourcePath: path.relative(ROOT, path.resolve(sourceDir, sourceFile)).replaceAll('\\', '/'),
      contentPath,
      contentLength: body.length,
      writtenAt,
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
    const ta = typeof a.writtenAt === 'number' ? a.writtenAt : -1;
    const tb = typeof b.writtenAt === 'number' ? b.writtenAt : -1;
    if (ta !== tb) return tb - ta;
    return a.name.localeCompare(b.name, 'zh-Hant');
  });

  const indexPayload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    sourceDir: path.relative(ROOT, sourceDir).replaceAll('\\', '/'),
    total: letters.length,
    summary: {
      datedCount: letters.filter((item) => typeof item.writtenAt === 'number').length,
      undatedCount: reviewItems.length,
    },
    letters,
  };

  const reviewPayload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    unresolvedCount: reviewItems.length,
    unresolved: reviewItems,
  };

  fs.writeFileSync(INDEX_FILE, `${JSON.stringify(indexPayload, null, 2)}\n`, 'utf8');
  fs.writeFileSync(REVIEW_FILE, `${JSON.stringify(reviewPayload, null, 2)}\n`, 'utf8');

  console.log(`✅ 已產生：${INDEX_FILE}`);
  console.log(`✅ 已產生：${REVIEW_FILE}`);
  console.log(`✅ 已輸出內容：${CONTENT_DIR}（${writtenContentFiles.size} 檔）`);
  if (staleContentFiles.length) {
    console.log(`🧹 已清理舊內容檔：${staleContentFiles.length} 檔`);
  }
  console.log(`📌 總信件：${letters.length}，未辨識日期：${reviewItems.length}`);
}

void main();
