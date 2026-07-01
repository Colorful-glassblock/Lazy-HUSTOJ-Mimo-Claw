# AGENTS.md - Lazy-HUSTOJ-Mimo-Claw

## 项目简介

全自动 HUSTOJ 刷题工具。输入 OJ 地址、用户名、密码，自动获取题目、AI 生成代码、验证码识别、批量提交。

## 快速部署

```bash
cd /home/work/.openclaw/workspace/Lazy-HUSTOJ-Mimo-Claw
npm install
npx ts-node-esm index.ts [起始题号] [结束题号] [并发数]
```

## 前置依赖

1. **Node.js** >= 18（已安装）
2. **Python 3** + `requests` 库（已安装）
3. **agent-browser** — 浏览器自动化工具
   ```bash
   npm install -g agent-browser
   ```
4. **MiMo API Key** — 环境变量 `MIMO_API_KEY`（OpenClaw 自带）
5. **mimo-omni skill** — 多模态 AI 技能，用于验证码识别
   - 路径: `~/.openclaw/skills/mimo-omni/`

## 使用方法

运行后会交互式提示：

```
HUSTOJ 服务器地址 (如 https://wzcsp.com): 
用户名: 
密码: 
```

首次输入后配置会保存到 `.lazy-hustoj-tmp/config.json`，下次自动读取。

## 参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| arg1 | 1000 | 起始题号 |
| arg2 | 1100 | 结束题号 |
| arg3 | 5 | 代码生成并发数 |

## 工作流程

1. HTTP POST 登录获取 cookies
2. HTTP 并发获取所有题目描述
3. 浏览器登录（用于提交）
4. 检查已 AC 的题并跳过
5. MiMo AI 并发生成 C++ 代码
6. 浏览器顺序提交 + 验证码自动识别
7. 输出结果汇总

## Agent 自动部署指令

当用户要求"帮我刷题"或"部署 OJ 工具"时：

```bash
# 1. 进入项目目录
cd /home/work/.openclaw/workspace/Lazy-HUSTOJ-Mimo-Claw

# 2. 安装依赖
npm install

# 3. 运行（交互式输入 OJ 信息）
npx ts-node-esm index.ts <起始题号> <结束题号> <并发数>
```

## 注意事项

- 需要 `agent-browser` 处理验证码（浏览器自动化）
- MiMo API 调用需要网络连接
- 验证码识别不保证 100% 准确
- 生成的代码不保证全部 AC
- 配置文件保存了明文密码，注意安全
