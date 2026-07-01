#!/usr/bin/env npx ts-node-esm
/**
 * Lazy-HUSTOJ-Mimo-Claw v3
 *
 * 纯 Node.js + TypeScript 实现
 * - 无 Python 依赖
 * - 支持 C / C++ / Python 语言选择（交互式或参数）
 * - HTTPS 连接
 * - 缓存题目和代码
 * - 自动跳过已 AC
 */

import { execSync } from "child_process";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import https from "https";
import http from "http";
import * as readline from "readline";

// ============================================================
//  配置
// ============================================================

const TMP = join(process.cwd(), ".lazy-hustoj-tmp");
const CACHE_DIR = join(TMP, "cache");
if (!existsSync(TMP)) mkdirSync(TMP, { recursive: true });
if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

const LANGUAGES: Record<string, { id: string; ext: string; prompt: string }> = {
  "c":   { id: "0", ext: ".c",   prompt: "C语言OI选手。只输出纯C代码，无解释无markdown。#include <stdio.h>" },
  "cpp": { id: "1", ext: ".cpp", prompt: "C++ OI选手。只输出纯C++代码，无解释无markdown。#include <iostream> using namespace std;" },
  "py":  { id: "3", ext: ".py",  prompt: "Python3 OI选手。只输出纯Python代码，无解释无markdown。使用input()读取，print()输出。" },
};

type LangKey = keyof typeof LANGUAGES;

interface Config { server: string; username: string; password: string; lang: LangKey; }
interface ProblemInfo { id: number; title: string; desc: string; input: string; output: string; sampleIn: string; sampleOut: string; }

// ============================================================
//  工具
// ============================================================

function ask(q: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(r => { rl.question(q, a => { rl.close(); r(a.trim()); }); });
}

function sleep(ms: number) { execSync(`sleep ${ms / 1000}`); }

function esc(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")
    .replace(/\$/g, "\\$").replace(/`/g, "\\`");
}

function br(cmd: string): string {
  try { return execSync(`agent-browser ${cmd}`, { encoding: "utf-8", timeout: 35000 }).trim(); }
  catch (e: any) { return (e.stdout || "").trim(); }
}

function stripHTML(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

// ============================================================
//  配置读取
// ============================================================

async function getConfig(): Promise<Config> {
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║     Lazy-HUSTOJ-Mimo-Claw v3  🐍            ║");
  console.log("║     全自动 HUSTOJ 刷题工具（纯 Node.js）      ║");
  console.log("╚══════════════════════════════════════════════╝\n");

  const configFile = join(TMP, "config.json");
  let saved: any = {};
  if (existsSync(configFile)) { try { saved = JSON.parse(readFileSync(configFile, "utf-8")); } catch {} }

  // 参数 > 环境变量 > 配置文件 > 交互输入
  const getArg = (k: string) => process.argv.find(a => a.startsWith(`--${k}=`))?.split("=")[1] || "";
  const getEnv = (k: string) => process.env[k] || "";

  // 服务器
  let server = getArg("server") || getEnv("HUSTOJ_SERVER") || saved.server || "";
  if (!server) server = await ask("HUSTOJ 服务器地址: ");
  server = server.replace(/\/+$/, "");
  if (!server.startsWith("http")) server = "https://" + server;

  // 用户名
  let username = getArg("user") || getEnv("HUSTOJ_USER") || saved.username || "";
  if (!username) username = await ask("用户名: ");

  // 密码
  const password = getArg("pass") || getEnv("HUSTOJ_PASS") || await ask("密码: ");

  // 语言（参数 > 环境变量 > 默认 cpp）
  const lang: LangKey = (getArg("lang") || getEnv("HUSTOJ_LANG") || saved.lang || "cpp") as LangKey;

  writeFileSync(configFile, JSON.stringify({ server, username, lang }, null, 2));
  console.log(`\n✅ ${server} (${username}) lang=${lang}\n`);
  return { server, username, password, lang };
}

// ============================================================
//  HTTP（纯 Node.js，支持 https）
// ============================================================

let COOKIES: string[] = [];

function httpReq(url: string, opts: { method?: string; body?: string } = {}): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const u = new URL(url);
    const req = mod.request({
      hostname: u.hostname, port: u.port || (u.protocol === "https:" ? 443 : 80),
      path: u.pathname + u.search, method: opts.method || "GET",
      headers: {
        "User-Agent": "Mozilla/5.0", "Cookie": COOKIES.join("; "),
        ...(opts.body ? { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(opts.body) } : {}),
      }
    }, (res) => {
      (res.headers["set-cookie"] || []).forEach(c => {
        const kv = c.split(";")[0].trim(), n = kv.split("=")[0];
        const i = COOKIES.findIndex(x => x.startsWith(n + "="));
        if (i >= 0) COOKIES[i] = kv; else COOKIES.push(kv);
      });
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpReq(new URL(res.headers.location, url).toString(), opts).then(resolve).catch(reject);
      }
      const ch: Buffer[] = [];
      res.on("data", (c: Buffer) => ch.push(c));
      res.on("end", () => resolve({ status: res.statusCode || 0, body: Buffer.concat(ch).toString("utf-8") }));
    });
    req.on("error", reject); if (opts.body) req.write(opts.body); req.end();
  });
}

async function httpLogin(config: Config) {
  console.log("🔑 HTTP 登录...");
  await httpReq(`${config.server}/loginpage.php`);
  await httpReq(`${config.server}/login.php`, {
    method: "POST", body: `user_id=${encodeURIComponent(config.username)}&password=${encodeURIComponent(config.password)}`
  });
  const v = await httpReq(`${config.server}/index.php`);
  console.log(v.body.includes(config.username) ? "  ✅ 登录成功\n" : "  ❌ 登录失败\n");
  if (!v.body.includes(config.username)) process.exit(1);
}

// ============================================================
//  MiMo API（纯 Node.js，不用 Python）
// ============================================================

function mimoApi(content: string, timeout = 60000): Promise<string> {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.MIMO_API_KEY || "";
    const apiUrl = process.env.MIMO_API_BASE_URL || "https://api.xiaomimimo.com/v1";
    const model = process.env.MIMO_OMNI_MODEL || "mimo-v2.5";

    const body = JSON.stringify({
      model,
      messages: [{ role: "user", content }],
      max_completion_tokens: 65536,
    });

    const u = new URL(`${apiUrl}/chat/completions`);
    const req = https.request({
      hostname: u.hostname, port: u.port || 443,
      path: u.pathname, method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        "Content-Length": Buffer.byteLength(body),
      },
      timeout,
    }, (res) => {
      const ch: Buffer[] = [];
      res.on("data", (c: Buffer) => ch.push(c));
      res.on("end", () => {
        try {
          const json = JSON.parse(Buffer.concat(ch).toString("utf-8"));
          if (json.choices?.[0]?.message?.content) {
            resolve(json.choices[0].message.content);
          } else {
            resolve("");
          }
        } catch { resolve(""); }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    req.write(body);
    req.end();
  });
}

async function mimoReadCaptcha(imgPath: string): Promise<string> {
  const b64 = readFileSync(imgPath).toString("base64");
  const content = [
    { type: "image_url", image_url: { url: `data:image/png;base64,${b64}` } },
    { type: "text", text: "Read the CAPTCHA. Output ONLY the characters/numbers. Nothing else." },
  ];
  try {
    const result = await mimoApi(JSON.stringify(content), 30000);
    return result.replace(/[^a-zA-Z0-9]/g, "").trim();
  } catch { return ""; }
}

// ============================================================
//  缓存
// ============================================================

function getCachePath(id: number) { return join(CACHE_DIR, `p${id}.json`); }
function getCodeCachePath(id: number, lang: LangKey) { return join(CACHE_DIR, `p${id}_${lang}.txt`); }

function loadProblemCache(id: number): ProblemInfo | null {
  const p = getCachePath(id);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, "utf-8")); } catch { return null; }
}

function saveProblemCache(info: ProblemInfo) { writeFileSync(getCachePath(info.id), JSON.stringify(info, null, 2)); }

function loadCodeCache(id: number, lang: LangKey): string | null {
  const p = getCodeCachePath(id, lang);
  if (!existsSync(p)) return null;
  try { return readFileSync(p, "utf-8"); } catch { return null; }
}

function saveCodeCache(id: number, lang: LangKey, code: string) { writeFileSync(getCodeCachePath(id, lang), code); }

// ============================================================
//  获取题目
// ============================================================

async function fetchProblem(server: string, id: number): Promise<ProblemInfo> {
  const cached = loadProblemCache(id);
  if (cached && cached.desc) return cached;

  const r = await httpReq(`${server}/problem.php?id=${id}`);
  const html = r.body;
  const titleMatch = html.match(new RegExp(`${id}\\s*:\\s*([^<]+)`));
  const extract = (label: string) => {
    const m = html.match(new RegExp(label + `</h4>[\\s\\S]*?<div[^>]*>([\\s\\S]*?)</div>`));
    return m ? stripHTML(m[1]) : "";
  };
  const si = html.match(/样例输入[\s\S]*?<pre[^>]*>([\s\S]*?)<\/pre>/i);
  const so = html.match(/样例输出[\s\S]*?<pre[^>]*>([\s\S]*?)<\/pre>/i);
  const info: ProblemInfo = {
    id, title: titleMatch ? stripHTML(titleMatch[1]) : "",
    desc: extract("题目描述"), input: extract("输入"), output: extract("输出"),
    sampleIn: si ? stripHTML(si[1]) : "", sampleOut: so ? stripHTML(so[1]) : "",
  };
  if (info.desc) saveProblemCache(info);
  return info;
}

// ============================================================
//  生成代码（纯 Node.js + MiMo API）
// ============================================================

async function generateCode(p: ProblemInfo, lang: LangKey): Promise<string> {
  if (!p.desc) return "";

  // 先查缓存
  const cached = loadCodeCache(p.id, lang);
  if (cached && (cached.includes("main") || cached.includes("input") || cached.includes("print"))) return cached;

  const langInfo = LANGUAGES[lang];
  const prompt = [
    langInfo.prompt,
    `题目：${p.title}`, `描述：${p.desc}`, `输入：${p.input}`, `输出：${p.output}`,
    `样例输入：${p.sampleIn}`, `样例输出：${p.sampleOut}`,
  ].join("\n");

  try {
    const result = await mimoApi(prompt, 60000);
    let code = result.replace(/^```[a-z]*\s*/m, "").replace(/^```\s*$/gm, "").trim();
    if (code.includes("main") || code.includes("input") || code.includes("print")) {
      saveCodeCache(p.id, lang, code);
      return code;
    }
    return "";
  } catch (e: any) {
    console.log(`    P${p.id} 生成错误: ${(e.message || "").substring(0, 60)}`);
    return "";
  }
}

// ============================================================
//  验证码
// ============================================================

async function solveCaptcha(pid: number): Promise<string> {
  sleep(500);
  const b64 = br(`eval '
    var c=document.createElement("canvas");c.width=60;c.height=24;
    var img=document.querySelector("img[src*=vcode]");
    if(img&&img.complete){c.getContext("2d").drawImage(img,0,0,60,24);c.toDataURL("image/png").split(",")[1];}else{""}
  '`).replace(/^"|"$/g, "");
  if (!b64 || b64.length < 50) return "";
  const capPath = join(TMP, `cap_${pid}.png`);
  writeFileSync(capPath, Buffer.from(b64, "base64"));
  return await mimoReadCaptcha(capPath);
}

// ============================================================
//  获取已AC
// ============================================================

function getAcProblems(config: Config): Set<number> {
  console.log("🔍 检查已AC的题...");
  br(`open "${config.server}/status.php?user_id=${config.username}"`);
  sleep(2000); br("wait --load networkidle");
  const raw = br(`eval '
    var cells = document.querySelectorAll("td");
    var result = [];
    for(var i=0;i<cells.length;i++){
      if(cells[i].textContent.trim()==="正确"){
        var row = cells[i].parentElement;
        var tds = row.querySelectorAll("td");
        var p = tds[3]?.textContent?.trim();
        if(p) result.push(parseInt(p));
      }
    }
    result.join(",");
  '`).replace(/^"|"$/g, "").replace(/\\/g, "");
  const s = new Set<number>();
  if (raw) for (const x of raw.split(",")) { const n = parseInt(x.trim()); if (!isNaN(n)) s.add(n); }
  console.log(`  ✅ 已AC: ${s.size} 题`);
  return s;
}

// ============================================================
//  提交
// ============================================================

async function submitOne(config: Config, pid: number, code: string): Promise<{ pid: number; status: string; ms: number }> {
  const t0 = Date.now();
  br(`open "${config.server}/submitpage.php?id=${pid}"`);
  sleep(2000); br("wait --load networkidle");

  br(`eval 'var l=document.getElementById("language");if(l)l.value="${LANGUAGES[config.lang].id}"'`);
  br(`eval 'var s=document.getElementById("source");if(s){s.value="${esc(code)}";s.dispatchEvent(new Event("input",{bubbles=true}))}'`);

  const cap = await solveCaptcha(pid);
  if (cap) br(`eval 'document.querySelector("input[name=vcode]").value="${cap}"'`);

  const ref = br(`snapshot -i 2>&1 | grep -oP 'button "提交" \\[ref=\\K[^\\]]+'`);
  if (ref) { br(`click @${ref}`); sleep(5); br("wait --load networkidle"); }

  let statusRaw = "NOT_FOUND";
  for (let a = 0; a < 5; a++) {
    sleep(3 + a * 2);
    statusRaw = br(`eval '
      var rows=document.querySelectorAll("tr"),found="";
      for(var i=1;i<rows.length;i++){
        var c=rows[i].querySelectorAll("td");
        if(c.length>=5){var p=c[3]?.textContent?.trim(),r=c[4]?.textContent?.trim();if(p==="${pid}"){found=r;break;}}
      }
      found||"NOT_FOUND";
    '`).replace(/^"|"$/g, "");
    if (!statusRaw.includes("编译中") && !statusRaw.includes("等待")) break;
  }

  const ms = Date.now() - t0;
  if (statusRaw.includes("正确"))   return { pid, status: "AC", ms };
  if (statusRaw.includes("编译错误")) return { pid, status: "CE", ms };
  if (statusRaw.includes("答案错误")) return { pid, status: "WA", ms };
  if (statusRaw.includes("时间超限")) return { pid, status: "TLE", ms };
  if (statusRaw.includes("内存超限")) return { pid, status: "MLE", ms };
  if (statusRaw.includes("运行错误")) return { pid, status: "RE", ms };
  if (statusRaw.includes("输出超限")) return { pid, status: "OLE", ms };
  return { pid, status: statusRaw === "NOT_FOUND" ? "ERROR" : "UNKNOWN:" + statusRaw.substring(0, 20), ms };
}

// ============================================================
//  主流程
// ============================================================

const ICON: Record<string, string> = { AC: "✅", WA: "❌", CE: "⚙️", TLE: "⏰", MLE: "💾", RE: "💥", ERROR: "❓", OLE: "📤", SKIP: "⏭️" };

async function main() {
  const config = await getConfig();
  const startId = parseInt(process.argv[2] || "1000");
  const endId = parseInt(process.argv[3] || "1100");
  const conc = parseInt(process.argv[4] || "5");
  const ids = Array.from({ length: endId - startId + 1 }, (_, i) => startId + i);

  console.log(`🚀 P${startId}-P${endId} (${ids.length}题, 并发=${conc}, 语言=${config.lang})`);
  console.log("=".repeat(55));
  const t0 = Date.now();

  await httpLogin(config);

  const cached = ids.filter(id => loadProblemCache(id)?.desc).length;
  console.log(`📖 获取题目 (缓存: ${cached}/${ids.length})...`);
  const t1 = Date.now();
  const problems = await Promise.all(ids.map(id => fetchProblem(config.server, id)));
  console.log(`  ✅ ${problems.filter(p => p.desc).length}/${problems.length} 有描述 (${((Date.now() - t1) / 1000).toFixed(1)}s)\n`);

  console.log("🔑 浏览器登录...");
  br(`open "${config.server}/loginpage.php"`); sleep(1500); br("wait --load networkidle");
  br(`eval 'var u=document.querySelector("input[name=user_id]");if(u)u.value="${config.username}"'`);
  br(`eval 'var p=document.querySelector("input[name=password]");if(p)p.value="${esc(config.password)}"'`);
  const lr = br(`snapshot -i 2>&1 | grep -oP 'button "登录" \\[ref=\\K[^\\]]+'`);
  if (lr) { br(`click @${lr}`); sleep(2); br("wait --load networkidle"); }
  console.log("  ✅ 浏览器登录完成\n");

  const acSet = getAcProblems(config);
  const skipCount = ids.filter(id => acSet.has(id)).length;
  console.log(`  跳过 ${skipCount} 题\n`);

  const todo = problems.filter(p => !acSet.has(p.id));
  if (!todo.length) { console.log("🎉 全部已AC！"); return; }
  console.log(`📋 待提交: ${todo.length} 题\n`);

  console.log("📤 开始流水线提交...\n");
  const results: { pid: number; status: string; ms: number }[] = [];

  for (let i = 0; i < todo.length; i += conc) {
    const batch = todo.slice(i, i + conc);
    console.log(`  [生成] ${batch.map(p => "P" + p.id).join(", ")}`);
    const codes = await Promise.all(batch.map(p => generateCode(p, config.lang)));

    for (let j = 0; j < batch.length; j++) {
      const pid = batch[j].id, code = codes[j];
      if (!code || code.length < 20) {
        console.log(`  [${results.length + 1}/${todo.length}] P${pid} ⏭️ 生成失败`);
        results.push({ pid, status: "SKIP", ms: 0 }); continue;
      }
      writeFileSync(join(TMP, `p${pid}${LANGUAGES[config.lang].ext}`), code);
      console.log(`  [${results.length + 1}/${todo.length}] P${pid} 提交中...`);
      const r = await submitOne(config, pid, code);
      results.push(r);
      console.log(`  [${results.length}/${todo.length}] P${pid} ${ICON[r.status] || "❓"} ${r.status} ${(r.ms / 1000).toFixed(1)}s`);
    }
  }

  const totalTime = ((Date.now() - t0) / 1000).toFixed(1);
  const counts: Record<string, number> = {};
  results.forEach(r => counts[r.status] = (counts[r.status] || 0) + 1);
  console.log(`\n${"=".repeat(55)}`);
  console.log(`📊 结果 (总耗时 ${totalTime}s):`);
  results.forEach(r => console.log(`  P${r.pid}: ${ICON[r.status] || "❓"} ${r.status}`));
  console.log(`\n  总计=${results.length} | ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(" | ")}`);
  console.log(`  通过率: ${((counts.AC || 0) / results.length * 100).toFixed(1)}%`);
  writeFileSync(join(TMP, "results.json"), JSON.stringify(results, null, 2));
}

main().catch(console.error);
