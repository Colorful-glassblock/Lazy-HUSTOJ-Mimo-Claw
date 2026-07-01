# Lazy-HUSTOJ-Mimo-Claw 🐍

全自动 HUSTOJ 刷题工具 —— 输入 OJ 地址、用户名、密码，坐等 AC。

## ✨ 功能

- 🔑 **交互式登录** — 输入服务器地址、用户名、密码即可开始
- 📖 **并发获取题目** — HTTP 并发请求，秒级获取全部题目
- 🧠 **AI 生成代码** — MiMo 大模型自动生成 C++ 解题代码
- 🔍 **自动验证码识别** — MiMo 多模态模型识别验证码
- 📤 **流水线提交** — 生成一个提交一个，不等待
- ⏭️ **智能跳过** — 自动跳过已 AC 的题目
- 💾 **配置持久化** — 保存登录信息，下次直接使用

## 📋 前置要求

- **Node.js** >= 18
- **Python 3** + `requests` 库
- **agent-browser** (`npm install -g agent-browser`)
- **MiMo API Key** (环境变量 `MIMO_API_KEY`)
- **mimo-omni skill** (OpenClaw 的多模态技能)

## 🚀 使用方法

```bash
# 克隆项目
git clone https://github.com/YOUR_USERNAME/Lazy-HUSTOJ-Mimo-Claw.git
cd Lazy-HUSTOJ-Mimo-Claw

# 安装依赖
npm install

# 运行（默认刷 1000-1100 题）
npx ts-node-esm index.ts

# 指定题号范围和并发数
npx ts-node-esm index.ts 1051 1100 5
```

运行后会提示输入：
```
HUSTOJ 服务器地址 (如 https://wzcsp.com): 
用户名: 
密码: 
```

## ⚙️ 参数说明

```bash
npx ts-node-esm index.ts [起始题号] [结束题号] [并发数]
```

| 参数 | 默认值 | 说明 |
|------|--------|------|
| 起始题号 | 1000 | 开始刷的题号 |
| 结束题号 | 1100 | 结束的题号 |
| 并发数 | 5 | AI 代码生成的并发数量 |

## 🔧 工作原理

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  HTTP 并发    │───▶│  MiMo AI     │───▶│  浏览器提交   │
│  获取题目     │    │  生成代码     │    │  + 验证码     │
└──────────────┘    └──────────────┘    └──────────────┘
                     生成一个 ──────────▶ 立即提交
```

1. **HTTP 登录** — 通过 POST 请求获取 session cookies
2. **并发获取题目** — 同时请求所有题目页面
3. **浏览器登录** — 打开浏览器并登录（用于提交）
4. **检查已 AC** — 读取状态页，跳过已通过的题
5. **流水线提交** — AI 生成代码后立即提交，不等待

## 📁 项目结构

```
Lazy-HUSTOJ-Mimo-Claw/
├── index.ts          # 主脚本
├── package.json      # 依赖配置
├── tsconfig.json     # TypeScript 配置
├── README.md         # 说明文档
└── .lazy-hustoj-tmp/ # 运行时临时文件（自动生成）
    ├── config.json   # 保存的登录配置
    ├── p*.cpp        # 生成的代码
    └── cap_*.png     # 验证码图片
```

## ⚠️ 注意事项

- 本工具仅供学习交流使用
- 请遵守 OJ 的使用条款
- AI 生成的代码不保证 100% 正确
- 建议先理解题目再使用本工具

## 📄 License

MIT
