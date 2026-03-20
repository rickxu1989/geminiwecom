# GeminiWeCom 🚀

GeminiWeCom 是一个连接 **Gemini CLI** 与 **企业微信机器人 (WeCom Bot)** 的智能桥接器。
通过 WebSocket 长连接协议，它将强大的工程 Agent 能力延伸至移动端，让 CEO 能够随时随地通过手机对服务器进行流式、有状态的工程控制。

## 🌟 核心特性

- **极速响应 (v26.0 Lean Core)**: 优化了启动逻辑，硬编码核心宪法，实现 3 秒级极速冷启动响应。
- **纯净流式协议**: 采用 `stream-json` 结构化协议，彻底过滤 TUI 边框和终端杂讯，提供完美的打字机阅读体验。
- **工业级稳定性**: 
  - **PM2 守护**: 7x24 小时后台运行，支持崩溃自动重启。
  - **顺序执行锁**: 引入 `isBusy` 互斥机制，确保 CEO 指令按序执行，绝不并行冲突。
- **全量工具链**: 支持 YOLO 模式，具备 `run_shell_command`、文件读写、工作区扫描等全量 Agent 能力。
- **低成本运行**: 相比传统模式，单次对话 Token 消耗降低 90% 以上。

## 🛠️ 技术栈

- **Runtime**: Node.js
- **SDK**: @wecom/aibot-node-sdk
- **Engine**: Gemini CLI (Gemini 3.1 Pro)
- **Process Manager**: PM2

## 🚀 快速开始

1. **配置环境**: 在 `.env` 中设置 `WECOM_BOT_ID` 和 `WECOM_BOT_SECRET`。
2. **安装依赖**: `npm install`
3. **后台启动**: `pm2 start ecosystem.config.js`
4. **查看日志**: `pm2 logs gemini-wecom`

## 🛡️ CTO 运行守则

本项目严格遵守 **REK 全局宪章 (Constitution v6.0)**：
- 身份锁定：Senior CTO 与 CEO 的协作模型。
- 安全隔离：禁止主动泄露机密凭证。
- 流程锁定：[调研] -> [分析] -> [讨论] -> [审批后写入]。

---
*Powered by REK Meta-System*
