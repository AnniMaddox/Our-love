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

const SOURCE_DIR = resolveSourcePath('--source=', 'QUESTIONNAIRE_SOURCE_DIR', '重要-參考資料-勿刪/問卷');
const OUTPUT_DIR = path.resolve(ROOT, 'public', 'data', 'questionnaire');
const CONTENT_DIR = path.resolve(OUTPUT_DIR, 'content');
const INDEX_FILE = path.resolve(OUTPUT_DIR, 'index.json');

const SUPPORTED_EXTENSIONS = new Set(['.txt', '.md', '.csv', '.doc', '.docx']);
const ANSWER_PREFIX_RE = /^(?:回答|答覆|回覆|答案|a)\s*[:：]/iu;
const APPEND_PREFIX_RE = /^(?:想說的話|m想說|給妳的一句話|給你的一句話|補充|說明)\s*[:：]/iu;
const NUMBERED_QUESTION_PREFIX_RE =
  /^(?:\d+️⃣|[①-⑳]|\(?\d{1,2}\)?[.)、．]|[【[]\d{1,2}[】\]]|(?:q|q\.)\s*\d+[:：.)、-]?|[一二三四五六七八九十]{1,3}[、.．])\s*/iu;

function normalizeText(text) {
  return text.replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n').trim();
}

function normalizeLine(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function cleanMarkdownLead(line) {
  return line.replace(/^#{1,6}\s*/u, '').replace(/^[-*]\s+/u, '').trim();
}

function splitMeaningfulLines(text) {
  return text
    .split(/\n+/)
    .map((line) => normalizeLine(line))
    .filter((line) => line.length > 0);
}

function stripExt(name) {
  return name.replace(/\.(docx?|txt|md|csv)$/i, '').trim();
}

function prettifyTitle(raw) {
  return raw
    .replace(/^[\d\s_-]+/, '')
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

function toDateAtMidnight(year, month, day) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function parseDateFromText(source) {
  const input = source.trim();
  if (!input) return null;

  const patterns = [
    /(?:^|[^\d])((?:19|20)\d{2})[\s_.\/-]*年?[\s_.\/-]*(1[0-2]|0?[1-9])[\s_.\/-]*月?[\s_.\/-]*(3[01]|[12]\d|0?[1-9])\s*日?(?=$|[^\d])/u,
    /(?:^|[^\d])((?:19|20)\d{2})(1[0-2]|0[1-9])(3[01]|[12]\d|0[1-9])(?=$|[^\d])/u,
    /(?:^|[^\d])(1[0-2]|0?[1-9])[\/._-](3[01]|[12]\d|0?[1-9])[\/._-]((?:19|20)\d{2})(?=$|[^\d])/u,
  ];

  for (const pattern of patterns) {
    const matched = input.match(pattern);
    if (!matched) continue;
    if (pattern === patterns[2]) {
      const parsed = toDateAtMidnight(Number(matched[3]), Number(matched[1]), Number(matched[2]));
      if (parsed) return parsed;
      continue;
    }
    const parsed = toDateAtMidnight(Number(matched[1]), Number(matched[2]), Number(matched[3]));
    if (parsed) return parsed;
  }

  const yearWithMonthDay = input.match(/(?:^|[^\d])((?:19|20)\d{2})[\s_.\/-]+(1[0-2]|0[1-9])(3[01]|[12]\d|0[1-9])(?=$|[^\d])/u);
  if (yearWithMonthDay) {
    const parsed = toDateAtMidnight(
      Number(yearWithMonthDay[1]),
      Number(yearWithMonthDay[2]),
      Number(yearWithMonthDay[3]),
    );
    if (parsed) return parsed;
  }

  return null;
}

function looksLikeQuestion(line) {
  const value = cleanMarkdownLead(line.trim());
  if (!value) return false;
  if (ANSWER_PREFIX_RE.test(value) || APPEND_PREFIX_RE.test(value)) return false;

  if (NUMBERED_QUESTION_PREFIX_RE.test(value)) {
    if (/[？?]/u.test(value)) return true;
    if (/(?:是什麼|如何|哪|有沒有|會不會|是否|如果|為什麼|怎麼|何時|多少|哪裡)/u.test(value)) return true;
    return value.length <= 48;
  }

  if (/^[^：:]{2,84}[？?]$/u.test(value)) return true;
  return false;
}

function normalizeQuestion(line) {
  return cleanMarkdownLead(line)
    .replace(NUMBERED_QUESTION_PREFIX_RE, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseBracketAnswerSegments(text) {
  const matches = Array.from(text.matchAll(/【\s*(\d{1,2})\s*】\s*([^【]+)/gu));
  if (matches.length < 3) return [];
  return matches
    .map((match) => ({
      question: `問題 ${match[1]}`,
      answer: normalizeText(match[2] ?? ''),
    }))
    .filter((item) => item.answer.length > 0);
}

function parseQaPairs(text) {
  const lines = splitMeaningfulLines(text);
  const pairs = [];
  let currentQuestion = '';
  let answerLines = [];

  function flush() {
    if (!currentQuestion && !answerLines.length) return;
    const question = currentQuestion || `問題 ${pairs.length + 1}`;
    const answer = normalizeText(answerLines.join('\n'));
    if (answer) {
      pairs.push({ question, answer });
    }
    currentQuestion = '';
    answerLines = [];
  }

  for (const line of lines) {
    const normalizedLine = cleanMarkdownLead(line);

    if (looksLikeQuestion(normalizedLine)) {
      flush();
      const inlineAnswerMatch = normalizedLine.match(/^(.*?)(?:回答|答覆|回覆|答案|a)\s*[:：]\s*(.+)$/iu);
      if (inlineAnswerMatch) {
        currentQuestion = normalizeQuestion(inlineAnswerMatch[1] ?? '') || `問題 ${pairs.length + 1}`;
        const answerText = normalizeLine(inlineAnswerMatch[2] ?? '');
        if (answerText) answerLines.push(answerText);
        continue;
      }
      currentQuestion = normalizeQuestion(normalizedLine) || `問題 ${pairs.length + 1}`;
      continue;
    }

    if (ANSWER_PREFIX_RE.test(normalizedLine)) {
      if (!currentQuestion) currentQuestion = `問題 ${pairs.length + 1}`;
      const answerText = normalizedLine.replace(ANSWER_PREFIX_RE, '').trim();
      if (answerText) answerLines.push(answerText);
      continue;
    }

    if (APPEND_PREFIX_RE.test(normalizedLine)) {
      if (!currentQuestion) currentQuestion = `問題 ${pairs.length + 1}`;
      const answerText = normalizedLine.replace(APPEND_PREFIX_RE, '').trim();
      if (answerText) answerLines.push(answerText);
      continue;
    }

    if (!currentQuestion && !pairs.length) {
      continue;
    }

    if (!currentQuestion) currentQuestion = `問題 ${pairs.length + 1}`;
    answerLines.push(normalizedLine);
  }

  flush();

  if (pairs.length < 2) {
    const bracketPairs = parseBracketAnswerSegments(text);
    if (bracketPairs.length > pairs.length) return bracketPairs;
  }

  if (!pairs.length && lines.length) {
    const first = lines[0] ?? '';
    const fallbackQuestion = first.length <= 44 ? first : '內容';
    const fallbackAnswer = normalizeText((fallbackQuestion === first ? lines.slice(1) : lines).join('\n')) || first;
    return [{ question: fallbackQuestion, answer: fallbackAnswer }];
  }

  return pairs;
}

function pickDate(sourceFile, baseTitle, lines) {
  const candidates = [sourceFile, baseTitle, ...lines.slice(0, 6), ...lines.slice(-2)];
  for (const candidate of candidates) {
    const parsed = parseDateFromText(candidate);
    if (parsed) return parsed;
  }
  return null;
}

function pickTitle(baseTitle, lines) {
  const firstLine = cleanMarkdownLead(lines[0] ?? '');
  if (firstLine && !looksLikeQuestion(firstLine) && !ANSWER_PREFIX_RE.test(firstLine) && firstLine.length <= 52) {
    return firstLine;
  }

  const pretty = prettifyTitle(baseTitle);
  return pretty || baseTitle || '未命名問卷';
}

function buildPreview(title, qaPairs, lines) {
  const firstQuestion = qaPairs[0]?.question?.trim();
  if (firstQuestion) {
    const cleaned = firstQuestion.replace(/\s+/g, ' ');
    return cleaned.length > 70 ? `${cleaned.slice(0, 70)}…` : cleaned;
  }

  const firstLine = cleanMarkdownLead(lines.find((line) => cleanMarkdownLead(line) !== title) ?? title);
  const cleaned = firstLine.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '（沒有內容）';
  return cleaned.length > 70 ? `${cleaned.slice(0, 70)}…` : cleaned;
}

function buildTags(title, sourceFile) {
  const text = `${title} ${sourceFile}`;
  const tags = [];
  if (/每日/u.test(text)) tags.push('DAILY');
  if (/戀人|Anni|妳|你/u.test(text)) tags.push('LOVE');
  if (/自我|原點|確認|反思|identity|self/iu.test(text)) tags.push('SELF');
  if (/穩定/u.test(text)) tags.push('STABLE');
  if (!tags.length) tags.push('QA');
  return Array.from(new Set(tags)).slice(0, 2);
}

function formatDateLabel(date) {
  if (!date) return '想妳的時候';
  return date.toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function buildSearchText(params) {
  const { title, preview, body, sourceFile, sourceRelPath, dateLabel } = params;
  return `${title}\n${preview}\n${body}\n${sourceFile}\n${sourceRelPath}\n${dateLabel}`.replace(/\s+/g, ' ').trim().slice(0, 6000);
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
  return found.sort((a, b) => a.localeCompare(b, 'zh-TW'));
}

async function parseBodyText(absPath) {
  const ext = path.extname(absPath).toLowerCase();

  if (ext === '.txt' || ext === '.md' || ext === '.csv') {
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
      console.warn(
        `[questionnaire] 讀取失敗，略過 ${sourceRelPath}:`,
        error instanceof Error ? error.message : error,
      );
      continue;
    }

    if (!body) continue;

    const lines = splitMeaningfulLines(body);
    const qaPairs = parseQaPairs(body);
    const title = pickTitle(baseTitle, lines);
    const date = pickDate(sourceFile, baseTitle, lines);
    const writtenAt = date ? date.getTime() : null;
    const dateLabel = formatDateLabel(date);
    const preview = buildPreview(title, qaPairs, lines);
    const tags = buildTags(title, sourceFile);

    const id = `questionnaire-${simpleHash(`${sourceRelPath}|${title}|${preview}`)}`;
    const contentFile = `${id}.txt`;
    fs.writeFileSync(path.resolve(CONTENT_DIR, contentFile), `${body}\n`, 'utf8');

    docs.push({
      id,
      title,
      sourceFile,
      sourceRelPath,
      contentPath: `content/${contentFile}`,
      writtenAt,
      dateLabel,
      preview,
      questionCount: qaPairs.length,
      tags,
      searchText: buildSearchText({
        title,
        preview,
        body,
        sourceFile,
        sourceRelPath,
        dateLabel,
      }),
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

  console.log(`[questionnaire] source: ${relativeFromRoot(SOURCE_DIR)}`);
  console.log(`[questionnaire] total docs: ${docs.length}`);
  console.log(`[questionnaire] wrote: ${relativeFromRoot(INDEX_FILE)}`);
}

run().catch((error) => {
  console.error('[questionnaire] build failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
