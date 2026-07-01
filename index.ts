#!/usr/bin/env npx ts-node-esm
/**
 * Lazy-HUSTOJ-Mimo-Claw
 *
 * 全自动 HUSTOJ 刷题工具
 * - 输入 OJ 地址、用户名、密码即可开始
 * - HTTP 并发获取题目
 * - MiMo AI 并发生成 C++ 代码
 * - 浏览器自动提交 + 验证码识别（无验证码直接提交）
 * - 自动跳过已 AC 的题
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
if (!existsSync(TMP)) mkdirSync(TMP, { recursive: true });

interface Config {
  server: string;
  username: string;
  password: string;
}

// ============================================================
//  交互式输入（不保存密码）
// ============================================================

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => { rl.close(); resolve(answer.trim()); });
  });
}

async function getConfig(): Promise<Config> {
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║     Lazy-HUSTOJ-Mimo-Claw  🐍               ║");
  console.log("║     全自动 HUSTOJ 刷题工具                    ║");
  console.log("╚══════════════════════════════════════════════╝\n");

  // 支持环境变量或命令行参数: --server=xxx --user=xxx --pass=xxx
  const envServer = process.env.HUSTOJ_SERVER || "";
  const envUser = process.env.HUSTOJ_USER || "";
  const envPass = process.env.HUSTOJ_PASS || "";

  // 从命令行参数解析
  const argServer = process.argv.find(a => a.startsWith("--server="))?.split("=")[1] || "";
  const argUser = process.argv.find(a => a.startsWith("--user="))?.split("=")[1] || "";
  const argPass = process.argv.find(a => a.startsWith("--pass="))?.split("=")[1] || "";

  // 尝试从配置文件读取（只保存 server 和 username，不保存密码）
  const configFile = join(TMP, "config.json");
  let savedServer = "";
  let savedUsername = "";

  if (existsSync(configFile)) {
    try {
      const saved = JSON.parse(readFileSync(configFile, "utf-8"));
      savedServer = saved.server || "";
      savedUsername = saved.username || "";
    } catch {}
  }

  // 服务器地址: 参数 > 环境变量 > 配置文件 > 交互输入
  let server: string;
  if (argServer) {
    server = argServer;
  } else if (envServer) {
    server = envServer;
  } else if (savedServer) {
    const use = await ask(`上次服务器: ${savedServer}  回车使用，或输入新地址: `);
    server = use || savedServer;
  } else {
    server = await ask("HUSTOJ 服务器地址 (如 https://oj.example.com): ");
  }
  server = server.replace(/\/+$/, "");
  if (!server.startsWith("http")) server = "https://" + server;

  // 用户名
  let username: string;
  if (argUser) {
    username = argUser;
  } else if (envUser) {
    username = envUser;
  } else if (savedUsername) {
    const use = await ask(`上次用户名: ${savedUsername}  回车使用，或输入新用户名: `);
    username = use || savedUsername;
  } else {
    username = await ask("用户名: ");
  }

  // 密码: 参数 > 环境变量 > 交互输入（不保存）
  let password: string;
  if (argPass) {
    password = argPass;
  } else if (envPass) {
    password = envPass;
  } else {
    password = await ask("密码: ");
  }

  // 只保存 server 和 username
  writeFileSync(configFile, JSON.stringify({ server, username }, null, 2));

  console.log(`\n✅ ${server} (${username})\n`);
  return { server, username, password };
}

// ============================================================
//  HTTP 核心
// ============================================================

let COOKIES: string[] = [];

function cookieHeader(): string { return COOKIES.join("; "); }

function httpReq(url: string, opts: { method?: string; body?: string } = {}): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    const u = new URL(url);
    const req = mod.request({
      hostname: u.hostname, port: u.port || (u.protocol === "https:" ? 443 : 80),
      path: u.pathname + u.search, method: opts.method || "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36",
        "Cookie": cookieHeader(),
        ...(opts.body ? { "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(opts.body) } : {}),
      }
    }, (res) => {
      (res.headers["set-cookie"] || []).forEach(c => {
        const kv = c.split(";")[0].trim();
        const name = kv.split("=")[0];
        const idx = COOKIES.findIndex(x => x.startsWith(name + "="));
        if (idx >= 0) COOKIES[idx] = kv; else COOKIES.push(kv);
      });
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return httpReq(new URL(res.headers.location, url).toString(), opts).then(resolve).catch(reject);
      }
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks).toString("utf-8") }));
    });
    req.on("error", reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

// ============================================================
//  HTTP 登录
// ============================================================

async function httpLogin(config: Config): Promise<void> {
  console.log("🔑 HTTP 登录...");
  await httpReq(`${config.server}/loginpage.php`);
  await httpReq(`${config.server}/login.php`, {
    method: "POST",
    body: `user_id=${encodeURIComponent(config.username)}&password=${encodeURIComponent(config.password)}`
  });
  const verify = await httpReq(`${config.server}/index.php`);
  if (verify.body.includes(config.username)) {
    console.log("  ✅ 登录成功\n");
  } else {
    console.log("  ❌ 登录失败！请检查地址、用户名和密码。");
    process.exit(1);
  }
}

// ============================================================
//  获取题目
// ============================================================

interface ProblemInfo {
  id: number; title: string; desc: string;
  input: string; output: string;
  sampleIn: string; sampleOut: string;
}

function stripHTML(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

async function fetchProblem(server: string, id: number): Promise<ProblemInfo> {
  const r = await httpReq(`${server}/problem.php?id=${id}`);
  const html = r.body;
  const titleMatch = html.match(new RegExp(`${id}\\s*:\\s*([^<]+)`));
  const extract = (label: string) => {
    const m = html.match(new RegExp(label + `</h4>[\\s\\S]*?<div[^>]*>([\\s\\S]*?)</div>`));
    return m ? stripHTML(m[1]) : "";
  };
  const si = html.match(/样例输入[\s\S]*?<pre[^>]*>([\s\S]*?)<\/pre>/i);
  const so = html.match(/样例输出[\s\S]*?<pre[^>]*>([\s\S]*?)<\/pre>/i);
  return {
    id, title: titleMatch ? stripHTML(titleMatch[1]) : "",
    desc: extract("题目描述"), input: extract("输入"), output: extract("输出"),
    sampleIn: si ? stripHTML(si[1]) : "", sampleOut: so ? stripHTML(so[1]) : "",
  };
}

// ============================================================
//  AI 生成代码
// ============================================================

function generateCode(p: ProblemInfo): Promise<string> {
  return new Promise((resolve) => {
    if (!p.desc) return resolve("");
    const promptFile = join(TMP, `prompt_${p.id}.txt`);
    const scriptFile = join(TMP, `gen_${p.id}.py`);
    writeFileSync(promptFile, [
      `你是C++ OI竞赛选手。只输出纯C++代码，无解释无markdown标记。`,
      `题目：${p.title}`,
      `描述：${p.desc}`,
      `输入：${p.input}`,
      `输出：${p.output}`,
      `样例输入：${p.sampleIn}`,
      `样例输出：${p.sampleOut}`,
      `要求：#include <iostream>，using namespace std;，代码简洁高效。`,
    ].join("\n"));
    writeFileSync(scriptFile, [
      `import sys`,
      `sys.path.insert(0, "${process.env.HOME}/.openclaw/skills/mimo-omni")`,
      `from mimo_api import call_api`,
      `with open("${promptFile}") as f: print(call_api(f.read(), timeout=30))`,
    ].join("\n"));
    try {
      const r = execSync(`timeout 55 python3 "${scriptFile}"`, {
        encoding: "utf-8", timeout: 60000, stdio: ["pipe", "pipe", "pipe"]
      });
      let code = (r || "").replace(/^```[a-z]*\s*/m, "").replace(/^```\s*$/gm, "").trim();
      resolve(code.includes("main") ? code : "");
    } catch (e: any) {
      console.log(`    P${p.id} 代码生成错误: ${(e.stderr || e.message || "").substring(0, 80)}`);
      resolve("");
    }
  });
}

// ============================================================
//  浏览器工具
// ============================================================

function br(cmd: string): string {
  try { return execSync(`agent-browser ${cmd}`, { encoding: "utf-8", timeout: 35000 }).trim(); }
  catch (e: any) { return (e.stdout || "").trim(); }
}

function sleep(ms: number) { execSync(`sleep ${ms / 1000}`); }

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")
    .replace(/\$/g, "\\$").replace(/`/g, "\\`");
}

// ============================================================
//  验证码识别（无验证码返回空字符串）
// ============================================================

async function solveCaptcha(pid: number): Promise<string> {
  sleep(500);
  const b64 = br(`eval '
    var c=document.createElement("canvas");c.width=60;c.height=24;
    var img=document.querySelector("img[src*=vcode]");
    if(img&&img.complete){c.getContext("2d").drawImage(img,0,0,60,24);c.toDataURL("image/png").split(",")[1];}else{""}
  '`).replace(/^"|"$/g, "");

  // 没有验证码图片或图片太小 → 无需验证码
  if (!b64 || b64.length < 50) return "";

  writeFileSync(join(TMP, `cap_${pid}.png`), Buffer.from(b64, "base64"));
  try {
    return execSync(
      `cd ~/.openclaw/skills/mimo-omni && bash mimo_api.sh image "${TMP}/cap_${pid}.png" "Read CAPTCHA. Only characters." 2>/dev/null | tail -1`,
      { encoding: "utf-8", timeout: 30000 }
    ).trim().replace(/[^a-zA-Z0-9]/g, "");
  } catch { return ""; }
}

// ============================================================
//  获取已AC题号
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
        for(var j=0;j<tds.length;j++){
          var num = parseInt(tds[j].textContent.trim());
          if(num>=1000 && num<=9999){ result.push(num); break; }
        }
      }
    }
    result.join(",");
  '`).replace(/^"|"$/g, "").replace(/\\/g, "");
  const acSet = new Set<number>();
  if (raw) {
    for (const s of raw.split(",")) {
      const n = parseInt(s.trim());
      if (!isNaN(n)) acSet.add(n);
    }
  }
  console.log(`  ✅ 已AC: ${acSet.size} 题`);
  return acSet;
}

// ============================================================
//  提交（无验证码直接提交）
// ============================================================

async function submitOne(config: Config, pid: number, code: string): Promise<{ pid: number; status: string; ms: number }> {
  const t0 = Date.now();
  br(`open "${config.server}/submitpage.php?id=${pid}"`);
  sleep(2000); br("wait --load networkidle");

  br(`eval 'var l=document.getElementById("language");if(l)l.value="1"'`);
  br(`eval 'var s=document.getElementById("source");if(s){s.value="${esc(code)}";s.dispatchEvent(new Event("input",{bubbles:true}))}'`);

  // 尝试识别验证码，如果没有就直接提交
  const cap = await solveCaptcha(pid);
  if (cap) {
    br(`eval 'document.querySelector("input[name=vcode]").value="${cap}"'`);
  }

  const ref = br(`snapshot -i 2>&1 | grep -oP 'button "提交" \\[ref=\\K[^\\]]+'`);
  if (ref) { br(`click @${ref}`); sleep(5); br("wait --load networkidle"); }

  // 等待结果并检查状态页最新提交（轮询最多5次，间隔递增）
  let statusRaw = "NOT_FOUND";
  for (let attempt = 0; attempt < 5; attempt++) {
    sleep(3 + attempt * 2);  // 3s, 5s, 7s, 9s, 11s
    statusRaw = br(`eval '
      var rows = document.querySelectorAll("tr");
      var found = "";
      for(var i=1;i<rows.length;i++){
        var cells = rows[i].querySelectorAll("td");
        if(cells.length>=4){
          var p = cells[3]?.textContent?.trim();
          var r = cells[4]?.textContent?.trim();
          if(p==="${pid}"){ found = r; break; }
        }
      }
      found || "NOT_FOUND";
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
  if (statusRaw === "NOT_FOUND") return { pid, status: "ERROR", ms };
  return { pid, status: "UNKNOWN:" + statusRaw, ms };
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

  console.log(`🚀 P${startId}-P${endId} (${ids.length}题, 并发=${conc})`);
  console.log("=".repeat(55));
  const t0 = Date.now();

  // Phase 1: HTTP 登录 + 并发获取题目
  await httpLogin(config);

  console.log(`📖 并发获取 ${ids.length} 道题目...`);
  const t1 = Date.now();
  const problems = await Promise.all(ids.map(id => fetchProblem(config.server, id)));
  const withDesc = problems.filter(p => p.desc).length;
  console.log(`  ✅ ${withDesc}/${problems.length} 有描述 (${((Date.now() - t1) / 1000).toFixed(1)}s)\n`);

  // Phase 2: 浏览器登录 + 获取已AC题号
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

  const problemsToSolve = problems.filter(p => !acSet.has(p.id));
  if (problemsToSolve.length === 0) {
    console.log("🎉 全部已AC！无需提交。");
    return;
  }
  console.log(`📋 待提交: ${problemsToSolve.length} 题`);
  console.log(`  ${problemsToSolve.map(p => "P" + p.id).join(", ")}\n`);

  // Phase 3: 流水线提交
  console.log("📤 开始流水线提交...\n");
  const results: { pid: number; status: string; ms: number }[] = [];

  for (let i = 0; i < problemsToSolve.length; i += conc) {
    const batch = problemsToSolve.slice(i, i + conc);
    console.log(`  [生成] ${batch.map(p => "P" + p.id).join(", ")}`);
    const codes = await Promise.all(batch.map(p => generateCode(p)));

    for (let j = 0; j < batch.length; j++) {
      const pid = batch[j].id;
      const code = codes[j];
      if (!code || code.length < 30) {
        console.log(`  [${results.length + 1}/${problemsToSolve.length}] P${pid} ⏭️ 生成失败`);
        results.push({ pid, status: "SKIP", ms: 0 });
        continue;
      }
      writeFileSync(join(TMP, `p${pid}.cpp`), code);
      console.log(`  [${results.length + 1}/${problemsToSolve.length}] P${pid} 提交中...`);
      const r = await submitOne(config, pid, code);
      results.push(r);
      console.log(`  [${results.length}/${problemsToSolve.length}] P${pid} ${ICON[r.status] || "❓"} ${r.status} ${(r.ms / 1000).toFixed(1)}s`);
    }
  }

  // 汇总
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
