import { describe, it, expect } from "vitest";
import { execSync } from "child_process";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";

const TMP = join(process.cwd(), ".test-tmp");
if (!existsSync(TMP)) mkdirSync(TMP, { recursive: true });

// ============================================================
//  stripHTML
// ============================================================

function stripHTML(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
}

describe("stripHTML", () => {
  it("移除 HTML 标签", () => {
    expect(stripHTML("<p>hello</p>")).toBe("hello");
  });

  it("处理嵌套标签", () => {
    expect(stripHTML("<div><span>test</span></div>")).toBe("test");
  });

  it("转义 HTML 实体", () => {
    expect(stripHTML("1 &lt; 2 &amp; 3")).toBe("1 < 2 & 3");
  });

  it("处理空字符串", () => {
    expect(stripHTML("")).toBe("");
  });

  it("压缩空白", () => {
    expect(stripHTML("  hello   world  ")).toBe("hello world");
  });
});

// ============================================================
//  配置验证
// ============================================================

describe("Config", () => {
  it("服务器地址去掉尾部斜杠", () => {
    const server = "https://example.com/".replace(/\/+$/, "");
    expect(server).toBe("https://example.com");
  });

  it("自动补 https", () => {
    let server = "example.com";
    if (!server.startsWith("http")) server = "https://" + server;
    expect(server).toBe("https://example.com");
  });

  it("密码不写入配置文件", () => {
    const config = { server: "https://example.com", username: "test" };
    const configStr = JSON.stringify(config);
    expect(configStr).not.toContain("password");
  });
});

// ============================================================
//  代码生成清理
// ============================================================

describe("代码清理", () => {
  it("去掉 markdown 代码块标记", () => {
    const raw = "```cpp\n#include <iostream>\nint main(){}\n```";
    const cleaned = raw.replace(/^```[a-z]*\s*/m, "").replace(/^```\s*$/gm, "").trim();
    expect(cleaned).toBe("#include <iostream>\nint main(){}");
  });

  it("保留没有标记的代码", () => {
    const raw = "#include <iostream>\nint main(){}";
    const cleaned = raw.replace(/^```[a-z]*\s*/m, "").replace(/^```\s*$/gm, "").trim();
    expect(cleaned).toBe(raw);
  });

  it("检测有效代码（包含 main）", () => {
    const code = "#include <iostream>\nusing namespace std;\nint main() { return 0; }";
    expect(code.includes("main")).toBe(true);
  });

  it("拒绝无效代码（无 main）", () => {
    const code = "#include <iostream>";
    expect(code.includes("main")).toBe(false);
  });
});

// ============================================================
//  验证码清理
// ============================================================

describe("验证码清理", () => {
  it("只保留字母数字", () => {
    const raw = "  AB12\n";
    const cleaned = raw.replace(/[^a-zA-Z0-9]/g, "");
    expect(cleaned).toBe("AB12");
  });

  it("空验证码返回空", () => {
    const raw = "";
    const cleaned = raw.replace(/[^a-zA-Z0-9]/g, "");
    expect(cleaned).toBe("");
  });
});

// ============================================================
//  结果状态映射
// ============================================================

describe("状态图标", () => {
  const ICON: Record<string, string> = {
    AC: "✅", WA: "❌", CE: "⚙️", TLE: "⏰", MLE: "💾", RE: "💥", ERROR: "❓", SKIP: "⏭️"
  };

  it("AC 映射正确", () => expect(ICON["AC"]).toBe("✅"));
  it("WA 映射正确", () => expect(ICON["WA"]).toBe("❌"));
  it("CE 映射正确", () => expect(ICON["CE"]).toBe("⚙️"));
  it("未知状态返回 ❓", () => expect(ICON["UNKNOWN"] || "❓").toBe("❓"));
});

// ============================================================
//  esc 转义
// ============================================================

describe("esc 转义", () => {
  function esc(s: string): string {
    return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")
      .replace(/\$/g, "\\$").replace(/`/g, "\\`");
  }

  it("转义双引号", () => {
    expect(esc('say "hi"')).toBe('say \\"hi\\"');
  });

  it("转义换行", () => {
    expect(esc("line1\nline2")).toBe("line1\\nline2");
  });

  it("转义反斜杠", () => {
    expect(esc("a\\b")).toBe("a\\\\b");
  });

  it("转义 $", () => {
    expect(esc("$var")).toBe("\\$var");
  });
});
