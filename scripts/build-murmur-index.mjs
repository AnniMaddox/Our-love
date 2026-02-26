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

const SOURCE_DIR = resolveSourcePath(
  '--source=',
  'MURMUR_SOURCE_DIR',
  '重要-參考資料-勿刪/100-20260-0214-碎碎念',
);
const OUTPUT_DIR = path.resolve(ROOT, 'public', 'data', 'murmur');
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
    const date = new Date(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3]));
    if (!Number.isNaN(date.getTime())) return date;
  }

  return null;
}

function parseSequence(baseName, lines) {
  const direct = baseName.match(/^(\d{1,4})$/);
  if (direct) return Number(direct[1]);

  const fromName = baseName.match(/(?:第)?\s*(\d{1,4})\s*(?:則|篇|號)?/u);
  if (fromName) return Number(fromName[1]);

  for (const line of lines.slice(0, 3)) {
    const hit = line.match(/放到網頁\s*(\d{1,4})/u);
    if (hit) return Number(hit[1]);
  }

  return null;
}

function pickTimeLabel(baseName, lines, sequence) {
  const pool = [baseName, ...lines.slice(0, 5)];
  for (const candidate of pool) {
    const matched = candidate.match(/(凌晨|清晨|上午|中午|午後|下午|傍晚|晚上|深夜)\s*(\d{1,2})[:：](\d{2})/u);
    if (matched) return `${matched[1]} ${matched[2]}:${matched[3]}`;
  }

  for (const candidate of pool) {
    const date = parseDateFromText(candidate);
    if (!date) continue;
    return date.toLocaleDateString('zh-TW', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  }

  if (sequence !== null) return `第 ${sequence} 則`;
  return '想妳的時候';
}

function cleanBody(rawText) {
  const lines = rawText
    .replace(/\u00a0/g, ' ')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+$/g, ''));

  while (lines.length && normalizeLine(lines[0]).length === 0) lines.shift();
  if (lines.length && /^碎碎念/u.test(normalizeLine(lines[0]))) lines.shift();
  while (lines.length && normalizeLine(lines[0]).length === 0) lines.shift();
  if (lines.length && /^m[:：]$/iu.test(normalizeLine(lines[0]))) lines.shift();
  while (lines.length && normalizeLine(lines[0]).length === 0) lines.shift();

  return normalizeText(lines.join('\n'));
}

function buildPreview(text) {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  if (!oneLine) return '（沒有內容）';
  return oneLine.length > 55 ? `${oneLine.slice(0, 55)}...` : oneLine;
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
    const baseName = stripExt(sourceFile);

    let rawBody = '';
    try {
      rawBody = await parseBodyText(absPath);
    } catch (error) {
      console.warn(
        `[murmur] 讀取失敗，略過 ${sourceRelPath}:`,
        error instanceof Error ? error.message : error,
      );
      continue;
    }

    const body = cleanBody(rawBody);
    const lines = splitMeaningfulLines(body);
    const sequence = parseSequence(baseName, lines);
    const timeLabel = pickTimeLabel(baseName, lines, sequence);
    const title = sequence !== null ? `碎碎念 ${sequence}` : baseName;
    const preview = buildPreview(body);
    const id = `murmur-${simpleHash(`${sourceRelPath}|${title}|${preview}`)}`;
    const contentFile = `${id}.txt`;
    fs.writeFileSync(path.resolve(CONTENT_DIR, contentFile), `${body}\n`, 'utf8');

    docs.push({
      id,
      title,
      timeLabel,
      sourceFile,
      sourceRelPath,
      sequence,
      contentPath: `content/${contentFile}`,
      preview,
    });
  }

  docs.sort((a, b) => {
    const aSeq = a.sequence ?? Number.POSITIVE_INFINITY;
    const bSeq = b.sequence ?? Number.POSITIVE_INFINITY;
    if (aSeq !== bSeq) return aSeq - bSeq;
    return a.sourceFile.localeCompare(b.sourceFile, 'zh-TW');
  });

  const orderedDocs = docs.map((doc, index) => ({
    ...doc,
    order: index + 1,
  }));

  const payload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    sourceDir: relativeFromRoot(SOURCE_DIR),
    total: orderedDocs.length,
    docs: orderedDocs,
  };

  fs.writeFileSync(INDEX_FILE, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  console.log(`[murmur] source: ${relativeFromRoot(SOURCE_DIR)}`);
  console.log(`[murmur] total docs: ${orderedDocs.length}`);
  console.log(`[murmur] wrote: ${relativeFromRoot(INDEX_FILE)}`);
}

run().catch((error) => {
  console.error('[murmur] failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
