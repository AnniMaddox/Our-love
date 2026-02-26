#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function resolveSourcePath(argPrefix, envKey, fallbackRelativePath) {
  const arg = process.argv.find((item) => item.startsWith(argPrefix));
  const fromArg = arg ? arg.slice(argPrefix.length).trim() : '';
  if (fromArg) return path.resolve(ROOT, fromArg);

  const fromEnv = (process.env[envKey] ?? '').trim();
  if (fromEnv) return path.resolve(ROOT, fromEnv);

  return path.resolve(ROOT, fallbackRelativePath);
}

const SOURCE_DIR = resolveSourcePath('--source=', 'M_DIARY_SOURCE_DIR', '重要-參考資料-勿刪/日記來源');
const OUTPUT_DIR = path.resolve(ROOT, 'public', 'data', 'm-diary');
const CONTENT_DIR = path.resolve(OUTPUT_DIR, 'content');
const INDEX_FILE = path.resolve(OUTPUT_DIR, 'index.json');

const SUPPORTED_EXTENSIONS = new Set(['.txt', '.md', '.doc', '.docx']);

function normalizeText(text) {
  return text.replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n').trim();
}

function normalizeLine(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function splitMeaningfulLines(text) {
  return text
    .split(/\n+/)
    .map((line) => normalizeLine(line))
    .filter((line) => line.length > 0);
}

function stripExt(name) {
  return name.replace(/\.(docx?|txt|md)$/i, '').trim();
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
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  date.setHours(0, 0, 0, 0);
  return date;
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

  const extendedYear = input.match(
    /(?:^|[^\d])((?:19|20)\d{2})\d[\s_.\/-]*(1[0-2]|0[1-9])[\s_.\/-]*(3[01]|[12]\d|0[1-9])(?=$|[^\d])/u,
  );
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

function looksLikeDateLine(line) {
  if (!parseDateFromText(line)) return false;
  const stripped = line.replace(/[\s\d年月日\/.-_:：()（）星期禮拜一二三四五六日天]/g, '');
  return stripped.length <= 2;
}

function pickDate(entryName, baseTitle, lines) {
  const candidates = [entryName, baseTitle, ...lines.slice(0, 3), ...lines.slice(-2)];
  for (const candidate of candidates) {
    const parsed = parseDateFromText(candidate);
    if (parsed) return parsed;
  }
  return null;
}

function pickTitle(baseTitle, lines) {
  const firstNonDate = lines.find((line) => !looksLikeDateLine(line));
  const cleaned = firstNonDate
    ? firstNonDate
        .replace(/^#+\s*/, '')
        .replace(/^\d+[.)、\s-]+/, '')
        .trim()
    : '';
  return cleaned || baseTitle || '未命名日記';
}

function buildPreview(lines, title, body) {
  const candidates = lines.filter((line) => line !== title);
  const text = (candidates[0] ?? body.replace(/\s+/g, ' ').trim()).trim();
  if (!text) return '（這篇日記暫時留白）';
  return text.length > 88 ? `${text.slice(0, 88)}...` : text;
}

function buildSearchText({ title, preview, body, sourceFile, sourceRelPath }) {
  return [title, preview, body, sourceFile, sourceRelPath]
    .join('\n')
    .replace(/\u0000/g, '')
    .trim();
}

function listSourceFiles(rootDir) {
  const found = [];

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.resolve(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.has(ext)) continue;
      found.push(abs);
    }
  }

  walk(rootDir);
  return found;
}

async function parseBodyText(absPath) {
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

function ensureOutputDirs() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.rmSync(CONTENT_DIR, { recursive: true, force: true });
  fs.mkdirSync(CONTENT_DIR, { recursive: true });
}

function relativeFromRoot(absPath) {
  return path.relative(ROOT, absPath).replace(/\\/g, '/');
}

async function run() {
  if (!fs.existsSync(SOURCE_DIR) || !fs.statSync(SOURCE_DIR).isDirectory()) {
    throw new Error(`找不到來源資料夾：${SOURCE_DIR}`);
  }

  ensureOutputDirs();

  const files = listSourceFiles(SOURCE_DIR);
  const docs = [];

  for (const absPath of files) {
    const sourceRelPath = path.relative(SOURCE_DIR, absPath).replace(/\\/g, '/');
    const sourceFile = path.basename(absPath);
    const baseTitle = stripExt(sourceFile);

    let body = '';
    try {
      body = await parseBodyText(absPath);
    } catch (error) {
      console.warn(`[m-diary] 讀取失敗，略過 ${sourceRelPath}:`, error instanceof Error ? error.message : error);
      continue;
    }

    const lines = splitMeaningfulLines(body);
    const title = pickTitle(baseTitle, lines);
    const date = pickDate(sourceFile, baseTitle, lines);
    const preview = buildPreview(lines, title, body);
    const writtenAt = date ? date.getTime() : null;
    const id = `m-diary-${simpleHash(`${sourceRelPath}|${title}|${lines[0] ?? ''}`)}`;
    const contentFile = `${id}.txt`;

    fs.writeFileSync(path.resolve(CONTENT_DIR, contentFile), `${body}\n`, 'utf8');

    docs.push({
      id,
      title,
      routes: ['diary'],
      sourceFile,
      sourceRelPath,
      sourcePath: `${relativeFromRoot(SOURCE_DIR)}/${sourceRelPath}`,
      contentPath: `content/${contentFile}`,
      writtenAt,
      preview,
      searchText: buildSearchText({ title, preview, body, sourceFile, sourceRelPath }),
    });
  }

  docs.sort((a, b) => {
    const at = a.writtenAt ?? -1;
    const bt = b.writtenAt ?? -1;
    if (at !== bt) return bt - at;
    return a.title.localeCompare(b.title, 'zh-TW');
  });

  const payload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    sourceDir: relativeFromRoot(SOURCE_DIR),
    total: docs.length,
    docs,
  };

  fs.writeFileSync(INDEX_FILE, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  console.log(`[m-diary] source: ${relativeFromRoot(SOURCE_DIR)}`);
  console.log(`[m-diary] total docs: ${docs.length}`);
  console.log(`[m-diary] wrote: ${relativeFromRoot(INDEX_FILE)}`);
}

run().catch((error) => {
  console.error('[m-diary] build failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
