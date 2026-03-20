# GeminiWeCom

GeminiWeCom is a bridge between **Gemini CLI** and **WeCom (Enterprise WeChat)** Bot via WebSocket.
It enables a "Pocket CTO" experience, allowing for streaming, stateful, and tool-enabled engineering control from a mobile device.

## Key Features
- **Persistent Engine**: High-performance persistent session logic.
- **Pure Stream Protocol**: Cleanses TUI/ANSI noise for mobile readability.
- **Concurrency Locking**: Sequential instruction execution for reliable agent control.
- **Tool Enabled**: Supports standard Gemini CLI tools including `run_shell_command` via YOLO mode.

## Tech Stack
- Node.js
- @wecom/aibot-node-sdk
- Gemini CLI (with 3.1 Pro Model)
