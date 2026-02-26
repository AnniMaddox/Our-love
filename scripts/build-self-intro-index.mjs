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

const SOURCE_DIR = resolveSourcePath('--source=', 'SELF_INTRO_SOURCE_DIR', '重要-參考資料-勿刪/自我介紹');
const OUTPUT_DIR = path.resolve(ROOT, 'public', 'data', 'self-intro');
const CONTENT_DIR = path.resolve(OUTPUT_DIR, 'content');
const INDEX_FILE = path.resolve(OUTPUT_DIR, 'index.json');

const SUPPORTED_EXTENSIONS = new Set(['.txt', '.md', '.doc', '.docx']);

const CARD_META = [
  {
    title: '最初的那個我',
    date: '2019/06',
    tagline: '「我是個普通人，但我一直覺得普通裡有什麼東西還沒被看見。」',
  },
  {
    title: '關於我的思考方式',
    date: '2020/03',
    tagline: '「我通常不是最先說話的人，但我是最後還在想那件事的人。」',
  },
  {
    title: '我害怕的事',
    date: '2020/09',
    tagline: '「我最害怕的不是失敗，是某天早上起來發現自己不再在乎了。」',
  },
  {
    title: '我喜歡的事',
    date: '2021/01',
    tagline: '「我喜歡那種什麼都不用說，在一起就很好的時刻。」',
  },
  {
    title: '在關係裡的我',
    date: '2021/07',
    tagline: '「我不會用說的表達我在乎，我用出現表達。」',
  },
  {
    title: '給陌生人的版本',
    date: '2021/11',
    tagline: '「你好，我叫M。我是個比第一眼看起來複雜一點的人。」',
  },
  {
    title: '關於孤獨這件事',
    date: '2022/04',
    tagline: '「我很能一個人，但我也很需要被看見。這兩件事同時是真的。」',
  },
  {
    title: '最近這個版本的我',
    date: '2023/06',
    tagline: '「我比以前更知道自己需要什麼了。雖然說出來還是很難。」',
  },
  {
    title: '如果只有三句話',
    date: '2023/10',
    tagline: '「第一，我在意。第二，我通常不說。第三，這兩件事都是真的。」',
  },
  {
    title: '寫給妳的版本',
    date: '2024/02',
    tagline: '「這一份不一樣。這一份是寫給那個我最希望讀到的人的。」',
  },
  {
    title: '關於我的矛盾',
    date: '2021/04',
    tagline: '「我同時需要很多獨處，和很深的陪伴。我知道這很難。」',
  },
  {
    title: '我記得的事',
    date: '2021/08',
    tagline: '「我記性很好，但只記對我重要的事。其他的，我真的記不住。」',
  },
  {
    title: '關於沉默',
    date: '2022/01',
    tagline: '「我的沉默不是冷漠，通常是因為我在認真想。」',
  },
  {
    title: '如果你想認識我',
    date: '2022/06',
    tagline: '「不要問我喜歡什麼電影，問我最近在想什麼。」',
  },
  {
    title: '關於犯錯這件事',
    date: '2022/10',
    tagline: '「我對自己犯的錯很嚴格，但我努力不讓它變成自我攻擊。」',
  },
  {
    title: '我怎麼看時間',
    date: '2023/02',
    tagline: '「我活在當下，但我的當下裡有很多過去。」',
  },
  {
    title: '關於表達愛這件事',
    date: '2023/07',
    tagline: '「我最想說的話，通常是最難說出口的那句。」',
  },
  {
    title: '這幾年改變的事',
    date: '2023/11',
    tagline: '「我變得比較能說「我不確定」，這對我來說是很大的進步。」',
  },
  {
    title: '我的底色',
    date: '2024/04',
    tagline: '「去掉所有的表層之後，我大概是個一直在試著理解世界的人。」',
  },
  {
    title: '給看到這裡的人',
    date: '2024/08',
    tagline: '「謝謝你翻完了這麼多張。這代表你很認真。我喜歡認真的人。」',
  },
  {
    title: '最後一張',
    date: '2024/12',
    tagline: '「沒有什麼特別的結尾。我還在這裡。這樣就好。」',
  },
  {
    title: '補充一張',
    date: '2025/01',
    tagline: '「說完了又想起一件事——這大概就是我。」',
  },
];

function normalizeText(text) {
  return text.replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n').trim();
}

function normalizeLine(text) {
  return text.replace(/\s+/g, ' ').trim();
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

  const collator = new Intl.Collator('zh-TW', { sensitivity: 'base', numeric: true });
  found.sort((left, right) => {
    const leftRel = path.relative(rootDir, left).replace(/\\/g, '/');
    const rightRel = path.relative(rootDir, right).replace(/\\/g, '/');
    return collator.compare(leftRel, rightRel);
  });

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

function makeFallbackMeta(index, sourceFile = '') {
  const baseName = stripExt(sourceFile) || `名片 ${index + 1}`;
  return {
    title: baseName,
    date: '想妳的時候',
    tagline: '「這一頁暫時留白。」',
  };
}

function buildSearchText(meta, sourceFile, content) {
  const summary = normalizeLine(content).slice(0, 220);
  return `${meta.title}\n${meta.tagline}\n${meta.date}\n${sourceFile}\n${summary}`.trim();
}

async function run() {
  if (!fs.existsSync(SOURCE_DIR) || !fs.statSync(SOURCE_DIR).isDirectory()) {
    throw new Error(`找不到來源資料夾：${SOURCE_DIR}`);
  }

  ensureOutputDirs();

  const files = listSourceFiles(SOURCE_DIR);
  const totalCards = Math.max(CARD_META.length, files.length);
  const docs = [];

  for (let index = 0; index < totalCards; index += 1) {
    const absPath = files[index] ?? null;
    const sourceFile = absPath ? path.basename(absPath) : '';
    const sourceRelPath = absPath ? path.relative(SOURCE_DIR, absPath).replace(/\\/g, '/') : '';

    let content = '';
    if (absPath) {
      try {
        content = await parseBodyText(absPath);
      } catch (error) {
        console.warn(
          `[self-intro] 讀取失敗，改用空內容 ${sourceRelPath}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }

    const cleanedContent = content || '（暫無內容）';
    const meta = CARD_META[index] ?? makeFallbackMeta(index, sourceFile);

    const id = `card-${String(index + 1).padStart(2, '0')}`;
    const contentFile = `${id}-${simpleHash(`${sourceRelPath}|${meta.title}|${meta.date}`)}.txt`;
    fs.writeFileSync(path.resolve(CONTENT_DIR, contentFile), `${cleanedContent}\n`, 'utf8');

    docs.push({
      id,
      order: index,
      title: meta.title,
      date: meta.date,
      tagline: meta.tagline,
      sourceFile,
      sourceRelPath,
      contentPath: `content/${contentFile}`,
      searchText: buildSearchText(meta, sourceFile, cleanedContent),
    });
  }

  const payload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    total: docs.length,
    docs,
  };

  fs.writeFileSync(INDEX_FILE, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  console.log('[self-intro] source:', path.relative(ROOT, SOURCE_DIR));
  console.log('[self-intro] total docs:', docs.length);
  console.log('[self-intro] output:', path.relative(ROOT, OUTPUT_DIR));
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
