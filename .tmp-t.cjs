var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main/transcripts.ts
var transcripts_exports = {};
__export(transcripts_exports, {
  detectLanguage: () => detectLanguage,
  fetchTranscript: () => fetchTranscript,
  parseVtt: () => parseVtt,
  translateTranscript: () => translateTranscript
});
module.exports = __toCommonJS(transcripts_exports);
var import_node_fs2 = require("node:fs");
var import_node_path2 = __toESM(require("node:path"));
var import_electron2 = require("electron");

// src/main/tools.ts
var import_node_child_process = require("node:child_process");
var import_node_fs = require("node:fs");
var import_node_path = __toESM(require("node:path"));
var import_electron = require("electron");
var IS_WIN = process.platform === "win32";
var YTDLP_NAME = IS_WIN ? "yt-dlp.exe" : "yt-dlp";
var ToolError = class extends Error {
  code;
  constructor(code, message) {
    super(message);
    this.code = code;
  }
};
function spawnProcess(command, args, options = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = (0, import_node_child_process.spawn)(command, args, {
        windowsHide: true,
        env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1", ...options.env }
      });
    } catch (err) {
      resolve({ stdout: "", stderr: err instanceof Error ? err.message : String(err), code: -1 });
      return;
    }
    let stdout = "";
    let stderr = "";
    let settled = false;
    let buffer = "";
    const flush = (text) => {
      buffer += text;
      let index = buffer.indexOf("\n");
      while (index >= 0) {
        const line = buffer.slice(0, index).replace(/\r$/, "");
        buffer = buffer.slice(index + 1);
        if (line.trim()) options.onLine?.(line);
        index = buffer.indexOf("\n");
      }
    };
    const finish = (code) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolve({ stdout, stderr, code });
    };
    const timer = options.timeoutMs ? setTimeout(() => {
      child.kill();
      finish(-1);
    }, options.timeoutMs) : null;
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
      flush(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
      flush(chunk);
    });
    child.on("error", (err) => {
      stderr += err.message;
      finish(-1);
    });
    child.on("close", (code) => finish(code ?? -1));
  });
}
async function probe(command, args, env) {
  const result = await spawnProcess(command, args, { env, timeoutMs: 15e3 });
  if (result.code !== 0) return null;
  const out = result.stdout.trim();
  return out.length ? out : null;
}
function pythonCandidates() {
  if (process.env.PYTHON_PATH) {
    return [{ command: process.env.PYTHON_PATH, prefix: [], label: "PYTHON_PATH" }];
  }
  if (IS_WIN) {
    return [
      { command: "python", prefix: [], label: "python" },
      { command: "py", prefix: ["-3"], label: "py -3" },
      { command: "python3", prefix: [], label: "python3" }
    ];
  }
  return [
    { command: "python3", prefix: [], label: "python3" },
    { command: "python", prefix: [], label: "python" }
  ];
}
function pythonLibsDir() {
  return import_node_path.default.join(import_electron.app.getPath("userData"), "pylibs");
}
function binDir() {
  return import_node_path.default.join(import_electron.app.getPath("userData"), "bin");
}
var runnerPromise = null;
var systemProxyCache;
function pickProxy(resolved) {
  const entries = resolved.split(";").map((entry) => entry.trim()).filter(Boolean);
  for (const entry of entries) {
    const [scheme, address] = entry.split(/\s+/);
    if (address && /^(PROXY|HTTPS)$/i.test(scheme)) return `http://${address}`;
  }
  for (const entry of entries) {
    const [scheme, address] = entry.split(/\s+/);
    if (address && /^SOCKS/i.test(scheme)) return `socks5://${address}`;
  }
  return null;
}
async function detectSystemProxy() {
  if (systemProxyCache !== void 0) return systemProxyCache;
  try {
    const resolved = await import_electron.session.defaultSession.resolveProxy("https://www.youtube.com");
    systemProxyCache = pickProxy(resolved);
  } catch {
    systemProxyCache = null;
  }
  return systemProxyCache;
}
async function resolveProxyArgs(mode, manualAddress) {
  if (mode === "off") return { args: [], proxy: null };
  if (mode === "manual") {
    const address = (manualAddress ?? "").trim();
    return address ? { args: ["--proxy", address], proxy: address } : { args: [], proxy: null };
  }
  const auto = await detectSystemProxy();
  return auto ? { args: ["--proxy", auto], proxy: auto } : { args: [], proxy: null };
}
async function detectYtDlp() {
  const staticCandidates = [];
  if (process.env.YTDLP_PATH) staticCandidates.push({ file: process.env.YTDLP_PATH, label: "YTDLP_PATH" });
  staticCandidates.push({ file: import_node_path.default.join(binDir(), YTDLP_NAME), label: "\u5E94\u7528\u7EC4\u4EF6\u76EE\u5F55" });
  staticCandidates.push({
    file: import_node_path.default.join(process.resourcesPath ?? "", "bin", YTDLP_NAME),
    label: "\u5185\u7F6E yt-dlp"
  });
  staticCandidates.push({
    file: import_node_path.default.join(import_electron.app.getAppPath(), "resources", "bin", YTDLP_NAME),
    label: "\u5185\u7F6E yt-dlp"
  });
  for (const candidate of staticCandidates) {
    if ((0, import_node_fs.existsSync)(candidate.file)) {
      return { command: candidate.file, prefix: [], env: {}, label: `${candidate.label}` };
    }
  }
  const env = { PYTHONPATH: pythonLibsDir() };
  for (const py of pythonCandidates()) {
    const version = await probe(py.command, [...py.prefix, "-m", "yt_dlp", "--version"], env);
    if (version) {
      return {
        command: py.command,
        prefix: [...py.prefix, "-m", "yt_dlp"],
        env,
        label: `yt-dlp ${version}`
      };
    }
  }
  const pathVersion = await probe(YTDLP_NAME, ["--version"]);
  if (pathVersion) {
    return { command: YTDLP_NAME, prefix: [], env: {}, label: `yt-dlp ${pathVersion}` };
  }
  return null;
}
function getYtDlpRunner(force = false) {
  if (force || !runnerPromise) runnerPromise = detectYtDlp();
  return runnerPromise;
}

// src/main/ytdlp.ts
var import_node_child_process2 = require("node:child_process");
function makeLineSplitter(emit) {
  let buffer = "";
  return (chunk) => {
    buffer += chunk;
    let index = buffer.indexOf("\n");
    while (index >= 0) {
      const line = buffer.slice(0, index).replace(/\r$/, "");
      buffer = buffer.slice(index + 1);
      if (line.trim()) emit(line);
      index = buffer.indexOf("\n");
    }
  };
}
async function spawnYtDlp(args, options = {}) {
  const runner = await getYtDlpRunner();
  if (!runner) {
    throw new ToolError("YTDLP_MISSING", "\u672A\u627E\u5230\u4E0B\u8F7D\u6838\u5FC3\uFF0C\u8BF7\u5148\u5728\u53F3\u4E0A\u89D2\u521D\u59CB\u5316\u7EC4\u4EF6");
  }
  return new Promise((resolve, reject) => {
    const child = (0, import_node_child_process2.spawn)(runner.command, [...runner.prefix, ...args], {
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1", ...runner.env }
    });
    options.onSpawn?.(child);
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const splitOut = makeLineSplitter((line) => options.onLine?.(line));
    const splitErr = makeLineSplitter((line) => options.onLine?.(line));
    const timer = options.timeoutMs ? setTimeout(() => {
      timedOut = true;
      child.kill();
    }, options.timeoutMs) : null;
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
      splitOut(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
      splitErr(chunk);
    });
    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      reject(new ToolError("YTDLP_SPAWN_FAILED", err.message));
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ stdout, stderr, code: code ?? -1, timedOut });
    });
  });
}

// src/main/transcripts.ts
var BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36";
var EMPTY_CACHE_TTL = 12 * 60 * 60 * 1e3;
var VTT_TIME = /(\d{2}):(\d{2}):(\d{2})[.,](\d{1,3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})[.,](\d{1,3})/;
var TRANSLATE_BATCH_CHARS = 900;
var MAX_TRANSLATE_CHARS = 12e3;
var TRANSLATE_CONCURRENCY = 3;
var PENDING_NOTE = "\u6B63\u5728\u7FFB\u8BD1\u4E2D\u6587\u5BF9\u7167\u2026";
var SUB_LANGS = "en,en-US,en-GB,en-orig,zh-Hans,zh-CN,zh";
function cleanVttText(raw) {
  return raw.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
}
function parseCues(raw) {
  const cues = [];
  let pendingTime = null;
  let buffer = [];
  const flush = () => {
    if (pendingTime === null) return;
    const time = pendingTime;
    const lines = buffer.map((line) => cleanVttText(line)).filter(Boolean);
    pendingTime = null;
    buffer = [];
    if (lines.length) cues.push({ time, lines });
  };
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    const timeMatch = VTT_TIME.exec(line);
    if (timeMatch) {
      flush();
      pendingTime = Number(timeMatch[1]) * 3600 + Number(timeMatch[2]) * 60 + Number(timeMatch[3]) + Number(`0.${String(timeMatch[4]).padStart(3, "0").slice(0, 3)}`);
      continue;
    }
    if (!line) {
      flush();
      continue;
    }
    if (/^(WEBVTT|NOTE|STYLE|Kind:|Language:|X-TIMESTAMP)/i.test(line)) continue;
    if (pendingTime === null) continue;
    buffer.push(line);
  }
  flush();
  return cues;
}
function parseVtt(raw) {
  const out = [];
  let prevLastLine = null;
  for (const cue of parseCues(raw)) {
    const first = cue.lines[0];
    const lastLine = cue.lines[cue.lines.length - 1];
    const rolling = cue.lines.length >= 2 && prevLastLine !== null && first.toLowerCase() === prevLastLine.toLowerCase();
    const text = rolling ? lastLine : cue.lines.join(" ");
    prevLastLine = lastLine;
    if (!text) continue;
    if (out.length && out[out.length - 1].text === text) continue;
    out.push({ time: cue.time, text, translation: null });
  }
  return out;
}
function detectLanguage(text) {
  const sample = text.slice(0, 1200);
  const count = (pattern) => (sample.match(pattern) ?? []).length;
  const han = count(/[\u4e00-\u9fff]/g);
  const kana = count(/[\u3040-\u30ff]/g);
  const hangul = count(/[\uac00-\ud7af\u1100-\u11ff]/g);
  const cyrillic = count(/[\u0400-\u04ff]/g);
  const arabic = count(/[\u0600-\u06ff]/g);
  const thai = count(/[\u0e00-\u0e7f]/g);
  const latin = count(/[a-z]/gi);
  if (kana > 2) return "ja";
  if (hangul > 2) return "ko";
  if (han > latin && han > 2) return "zh";
  if (cyrillic > 4) return "ru";
  if (arabic > 4) return "ar";
  if (thai > 4) return "th";
  if (latin > 4) return "en";
  return "unknown";
}
var networkSession = null;
async function sessionForProxy(proxy) {
  if (!proxy) return import_electron2.session.defaultSession;
  if (!networkSession) networkSession = import_electron2.session.fromPartition("echopod-network");
  await networkSession.setProxy({ proxyRules: proxy, proxyBypassRules: "<local>" });
  return networkSession;
}
async function activeProxy(store) {
  const settings = store.getSettings();
  const { proxy } = await resolveProxyArgs(settings.proxyMode, settings.proxy);
  return proxy;
}
async function requestText(url, store, options = {}) {
  const { timeoutMs = 12e3, viaProxy = false, method = "GET", body, headers } = options;
  const proxy = viaProxy ? await activeProxy(store) : null;
  const target = await sessionForProxy(proxy);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await target.fetch(url, {
      method,
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "application/json,text/plain,*/*",
        ...headers ?? {}
      },
      body,
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}
async function downloadSubtitles(episode, store) {
  const args = [
    `https://www.youtube.com/watch?v=${episode.id}`,
    "--skip-download",
    "--write-subs",
    "--write-auto-subs",
    "--sub-langs",
    SUB_LANGS,
    "--sub-format",
    "vtt",
    "--no-warnings",
    ...await store.requestArgs(),
    "-o",
    import_node_path2.default.join(store.subsDir, "%(id)s.%(ext)s")
  ];
  const { stdout, stderr, timedOut } = await spawnYtDlp(args, { timeoutMs: 3e4 });
  const entries = await import_node_fs2.promises.readdir(store.subsDir).catch(() => []);
  const files = entries.filter((name) => name.startsWith(`${episode.id}.`) && name.endsWith(".vtt"));
  if (files.length) return { files, transient: false };
  const log = `${stderr}
${stdout}`;
  if (/429|Too Many Requests/i.test(log)) {
    return {
      files: [],
      transient: true,
      note: "YouTube \u5B57\u5E55\u670D\u52A1\u6682\u65F6\u9650\u6D41\uFF0C\u7A0D\u540E\u70B9\u300C\u91CD\u65B0\u83B7\u53D6\u300D\u5373\u53EF\u91CD\u8BD5"
    };
  }
  if (timedOut) {
    return { files: [], transient: true, note: "\u5B57\u5E55\u8BF7\u6C42\u8D85\u65F6\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u540E\u91CD\u8BD5" };
  }
  return { files: [], transient: false };
}
function languageOfSubtitleFile(fileName, id) {
  const rest = fileName.slice(id.length + 1).replace(/\.vtt$/i, "");
  return rest.split(".").pop() ?? rest;
}
function mergeTranslation(primary, secondary) {
  if (!secondary.length) return primary;
  return primary.map((line) => {
    let best = null;
    let bestDiff = Number.POSITIVE_INFINITY;
    for (const candidate of secondary) {
      const diff = Math.abs(candidate.time - line.time);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = candidate;
      }
    }
    const matched = best && bestDiff <= 3 ? best : null;
    return { ...line, translation: matched ? matched.text : null };
  });
}
async function fromYoutube(episode, store) {
  const { files, note, transient } = await downloadSubtitles(episode, store);
  if (!files.length) return { transcript: null, note, transient };
  const parsed = /* @__PURE__ */ new Map();
  for (const file of files) {
    const language = languageOfSubtitleFile(file, episode.id);
    const content = await import_node_fs2.promises.readFile(import_node_path2.default.join(store.subsDir, file), "utf8").catch(() => "");
    if (!content) continue;
    const lines = parseVtt(content);
    if (lines.length) parsed.set(language, lines);
    await import_node_fs2.promises.rm(import_node_path2.default.join(store.subsDir, file), { force: true });
  }
  if (!parsed.size) return { transcript: null, transient: false };
  const chineseKey = [...parsed.keys()].find((key) => /^zh/i.test(key));
  const chinese = chineseKey ? parsed.get(chineseKey) : null;
  const originalKey = [...parsed.keys()].find((key) => /^en/i.test(key)) ?? [...parsed.keys()].find((key) => !/^zh/i.test(key));
  const original = originalKey ? parsed.get(originalKey) : null;
  if (original && chinese) {
    return {
      transient: false,
      transcript: {
        source: "youtube",
        synced: original.some((line) => line.time >= 0),
        language: detectLanguage(original.map((line) => line.text).join("\n")),
        lines: mergeTranslation(original, chinese),
        translated: true,
        fetchedAt: Date.now()
      }
    };
  }
  const single = original ?? chinese;
  if (!single) return { transcript: null, transient: false };
  return {
    transient: false,
    transcript: {
      source: "youtube",
      synced: single.some((line) => line.time >= 0),
      language: detectLanguage(single.map((line) => line.text).join("\n")),
      lines: single,
      translated: Boolean(chinese && !original),
      fetchedAt: Date.now()
    }
  };
}
function mapToMyMemoryCode(language) {
  const table = {
    zh: "zh-CN",
    en: "en-GB",
    ja: "ja-JP",
    ko: "ko-KR",
    ru: "ru-RU",
    ar: "ar-SA",
    th: "th-TH"
  };
  return table[language] ?? "en-GB";
}
var edgeToken = null;
async function edgeAuthToken(store) {
  if (edgeToken && Date.now() < edgeToken.expiresAt) return edgeToken.value;
  try {
    const raw = await requestText("https://edge.microsoft.com/translate/auth", store, {
      timeoutMs: 1e4,
      viaProxy: true
    });
    const value = raw.trim();
    if (!value || value.length < 40) return null;
    edgeToken = { value, expiresAt: Date.now() + 8 * 60 * 1e3 };
    return value;
  } catch {
    return null;
  }
}
async function translateWithEdge(texts, store) {
  const token = await edgeAuthToken(store);
  if (!token) return null;
  try {
    const raw = await requestText(
      "https://api-edge.cognitive.microsofttranslator.com/translate?api-version=3.0&to=zh-Hans",
      store,
      {
        timeoutMs: 2e4,
        viaProxy: true,
        method: "POST",
        body: JSON.stringify(texts.map((text) => ({ Text: text }))),
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }
      }
    );
    const data = JSON.parse(raw);
    if (!Array.isArray(data) || data.length !== texts.length) return null;
    const lines = data.map((item) => item.translations?.[0]?.text ?? "");
    return lines.some(Boolean) ? lines : null;
  } catch {
    return null;
  }
}
async function translateWithGoogle(texts, store) {
  const payload = texts.join("\n");
  const endpoints = [
    "https://translate.googleapis.com/translate_a/single",
    "https://translate.google.com/translate_a/single"
  ];
  for (const endpoint of endpoints) {
    try {
      const url = `${endpoint}?client=gtx&sl=auto&tl=zh-CN&dt=t&q=${encodeURIComponent(payload)}`;
      const raw = await requestText(url, store, { viaProxy: true, timeoutMs: 15e3 });
      if (raw.trimStart().startsWith("<")) continue;
      const data = JSON.parse(raw);
      const translated = (data[0] ?? []).map((segment) => segment[0] ?? "").join("");
      if (!translated) continue;
      const lines = translated.split("\n");
      if (lines.length === texts.length) return lines;
      continue;
    } catch {
    }
  }
  return null;
}
async function translateWithMyMemory(texts, store) {
  const attempt = async (source) => {
    const joined = source.join("\n");
    const pair = `${mapToMyMemoryCode(detectLanguage(joined))}|zh-CN`;
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(joined)}&langpair=${encodeURIComponent(pair)}`;
    const raw = await requestText(url, store, { timeoutMs: 15e3, viaProxy: true });
    const data = JSON.parse(raw);
    const translated = data.responseData?.translatedText ?? "";
    if (!translated) return null;
    const lines = translated.split("\n");
    return lines.length === source.length ? lines : null;
  };
  const batched = await attempt(texts).catch(() => null);
  if (batched) return batched;
  const limit = Math.min(texts.length, 60);
  const result = [];
  for (let index = 0; index < limit; index += 1) {
    const text = texts[index];
    if (!text.trim()) {
      result.push("");
      continue;
    }
    const single = await attempt([text]).catch(() => null);
    if (!single || !single[0]) return null;
    result.push(single[0]);
  }
  return result;
}
async function translateBatch(texts, store) {
  return await translateWithEdge(texts, store) ?? await translateWithMyMemory(texts, store) ?? await translateWithGoogle(texts, store);
}
async function translateLines(texts, store) {
  const result = new Array(texts.length).fill("");
  const batches = [];
  let current = [];
  let size = 0;
  let used = 0;
  let truncated = false;
  for (let index = 0; index < texts.length; index += 1) {
    const text = texts[index].trim();
    if (!text) continue;
    if (used + text.length > MAX_TRANSLATE_CHARS) {
      truncated = true;
      break;
    }
    if (size && size + text.length > TRANSLATE_BATCH_CHARS) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(index);
    size += text.length + 1;
    used += text.length + 1;
  }
  if (current.length) batches.push(current);
  if (!batches.length) return { lines: result, truncated };
  let anySucceeded = false;
  for (let start = 0; start < batches.length; start += TRANSLATE_CONCURRENCY) {
    const slice = batches.slice(start, start + TRANSLATE_CONCURRENCY);
    const settled = await Promise.all(
      slice.map((batch) => translateBatch(batch.map((index) => texts[index]), store))
    );
    settled.forEach((translated, offset) => {
      if (!translated) return;
      anySucceeded = true;
      slice[offset].forEach((index, k) => {
        result[index] = translated[k] ?? "";
      });
    });
  }
  if (!anySucceeded) return null;
  return { lines: result, truncated };
}
function transcriptFile(store, id) {
  return import_node_path2.default.join(store.transcriptsDir, `${id}.json`);
}
async function readCached(file) {
  try {
    return JSON.parse(await import_node_fs2.promises.readFile(file, "utf8"));
  } catch {
    return null;
  }
}
async function fetchTranscript(episode, store, force = false, translate = true) {
  const file = transcriptFile(store, episode.id);
  const settings = store.getSettings();
  let result = null;
  if (!force) {
    const cached = await readCached(file);
    if (cached) {
      const usable = cached.lines.length > 0;
      const fresh = Date.now() - (cached.fetchedAt ?? 0) < EMPTY_CACHE_TTL;
      if (usable) {
        if (!translate) return cached;
        const missingTranslation = settings.autoTranslate && !cached.translated && (cached.language ?? "") !== "zh";
        if (!missingTranslation) return cached;
        result = cached;
      } else if (fresh) {
        return cached;
      }
    }
  }
  if (!result) {
    let transientNote;
    let transient = false;
    try {
      const outcome = await fromYoutube(episode, store);
      if (outcome.transcript) result = outcome.transcript;
      if (outcome.note) transientNote = outcome.note;
      if (outcome.transient) transient = true;
    } catch {
    }
    if (!result || !result.lines.length) {
      const empty = {
        source: "none",
        synced: false,
        language: null,
        lines: [],
        translated: false,
        note: transientNote ?? "\u8FD9\u4E00\u96C6\u6CA1\u6709\u53EF\u7528\u5B57\u5E55\uFF0C\u53EF\u80FD\u662F\u7EAF\u97F3\u4E50\u6216\u672A\u5F00\u542F\u5B57\u5E55",
        fetchedAt: Date.now()
      };
      if (!transient) {
        await import_node_fs2.promises.writeFile(file, JSON.stringify(empty, null, 2), "utf8").catch(() => void 0);
      }
      return empty;
    }
  }
  const language = result.language ?? detectLanguage(result.lines.map((line) => line.text).join("\n"));
  result.language = language;
  const needsTranslation = settings.autoTranslate && !result.translated && language !== "zh";
  if (needsTranslation && !translate) {
    result.note = PENDING_NOTE;
    result.fetchedAt = Date.now();
    await import_node_fs2.promises.writeFile(file, JSON.stringify(result, null, 2), "utf8").catch(() => void 0);
    return result;
  }
  if (needsTranslation) {
    const outcome = await translateLines(
      result.lines.map((line) => line.text),
      store
    );
    if (outcome) {
      result.lines = result.lines.map((line, index) => ({
        ...line,
        translation: outcome.lines[index]?.trim() || null
      }));
      result.translated = result.lines.some((line) => Boolean(line.translation));
    }
    if (!result.translated) {
      result.note = "\u7FFB\u8BD1\u670D\u52A1\u6682\u65F6\u4E0D\u53EF\u7528\uFF0C\u5DF2\u663E\u793A\u539F\u6587\uFF08\u7A0D\u540E\u53EF\u70B9\u300C\u91CD\u65B0\u83B7\u53D6\u300D\u91CD\u8BD5\uFF09";
    } else if (outcome?.truncated) {
      result.note = `\u9010\u5B57\u7A3F\u8F83\u957F\uFF0C\u672C\u6B21\u53EA\u7FFB\u8BD1\u4E86\u524D ${Math.round(MAX_TRANSLATE_CHARS / 1e3)} \u5343\u5B57\u7B26`;
    } else {
      result.note = void 0;
    }
  }
  result.fetchedAt = Date.now();
  await import_node_fs2.promises.writeFile(file, JSON.stringify(result, null, 2), "utf8").catch(() => void 0);
  return result;
}
async function translateTranscript(episode, store) {
  const transcript = await fetchTranscript(episode, store, false, true);
  return transcript.lines.length ? transcript : null;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  detectLanguage,
  fetchTranscript,
  parseVtt,
  translateTranscript
});
