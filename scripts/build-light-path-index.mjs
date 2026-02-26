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

const SOURCE_DIR = resolveSourcePath('--source=', 'LIGHT_PATH_SOURCE_DIR', '重要-參考資料-勿刪/想你了');
const OUTPUT_DIR = path.resolve(ROOT, 'public', 'data', 'light-path');
const CONTENT_DIR = path.resolve(OUTPUT_DIR, 'content');
const INDEX_FILE = path.resolve(OUTPUT_DIR, 'index.json');

const SUPPORTED_EXTENSIONS = new Set(['.txt', '.md', '.doc', '.docx']);

function normalizeText(text) {
  return text.replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n').trim();
}

function normalizeLine(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function stripExt(name) {
  return name.replace(/\.(docx?|txt|md)$/i, '').trim();
}

function prettifyTitle(raw) {
  return raw
    .replace(/^\d+[-_\s]*/u, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function simpleHash(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
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

function buildPreview(body) {
  const line = normalizeLine(body.replace(/\n+/g, ' '));
  if (!line) return '（沒有內容）';
  return line.length > 72 ? `${line.slice(0, 72)}...` : line;
}

function parseDateFromText(text) {
  const matched = text.match(/((?:19|20)\d{2})[\s_.\/-]*年?[\s_.\/-]*(1[0-2]|0?[1-9])[\s_.\/-]*月?[\s_.\/-]*(3[01]|[12]\d|0?[1-9])/u);
  if (!matched) return '';
  const year = matched[1];
  const month = String(Number(matched[2])).padStart(2, '0');
  const day = String(Number(matched[3])).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function pickDateLabel(sourceFile, body) {
  const sourceDate = parseDateFromText(sourceFile);
  if (sourceDate) return sourceDate;

  const lines = body.split('\n').slice(0, 6).concat(body.split('\n').slice(-2));
  for (const line of lines) {
    const text = normalizeLine(line);
    if (!text) continue;
    const hit = parseDateFromText(text);
    if (hit) return hit;
  }

  return '想妳的時候';
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
    const rawTitle = stripExt(sourceFile);

    let body = '';
    try {
      body = await parseBodyText(absPath);
    } catch (error) {
      console.warn(
        `[light-path] 讀取失敗，略過 ${sourceRelPath}:`,
        error instanceof Error ? error.message : error,
      );
      continue;
    }

    const normalizedBody = body || '（這封信暫時留白）';
    const title = prettifyTitle(rawTitle) || rawTitle || '未命名信件';
    const preview = buildPreview(normalizedBody);
    const dateLabel = pickDateLabel(sourceFile, normalizedBody);

    const id = `light-path-${simpleHash(`${sourceRelPath}|${title}|${preview}`)}`;
    const contentFile = `${id}.txt`;
    fs.writeFileSync(path.resolve(CONTENT_DIR, contentFile), `${normalizedBody}\n`, 'utf8');

    docs.push({
      id,
      title,
      dateLabel,
      sourceFile,
      sourceRelPath,
      contentPath: `content/${contentFile}`,
      preview,
      searchText: `${title}\n${preview}\n${sourceFile}`,
    });
  }

  docs.sort((a, b) => a.sourceRelPath.localeCompare(b.sourceRelPath, 'zh-TW', { numeric: true }));

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

  console.log(`[light-path] source: ${relativeFromRoot(SOURCE_DIR)}`);
  console.log(`[light-path] total docs: ${orderedDocs.length}`);
  console.log(`[light-path] wrote: ${relativeFromRoot(INDEX_FILE)}`);
}

run().catch((error) => {
  console.error('[light-path] build failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
