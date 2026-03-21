require('dotenv').config();
const { WSClient } = require('@wecom/aibot-node-sdk');
const { spawn } = require('child_process');
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const stripAnsi = require('strip-ansi');
const { v4: uuidv4 } = require('uuid');

const { WECOM_BOT_ID, WECOM_BOT_SECRET } = process.env;
const GEMINI_BIN = '/usr/local/bin/gemini';
const LOGS_DIR = '/root/geminiwecom/logs';
const HISTORY_DIR = '/root/geminiwecom/history';

// Ensure directories exist
[LOGS_DIR, HISTORY_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

/**
 * SessionManager: Handles context persistence and human-readable logging.
 */
class SessionManager {
  constructor() {
    this.maxHistoryTurns = 15;
    this.maxHistoryChars = 12000;
  }

  getDateStr() {
    return new Date().toISOString().split('T')[0];
  }

  getHistoryPath() {
    return path.join(HISTORY_DIR, `${this.getDateStr()}.json`);
  }

  getLogPath() {
    return path.join(LOGS_DIR, `${this.getDateStr()}.log`);
  }

  logHuman(role, msg) {
    const time = new Date().toISOString();
    const entry = `[${time}] [${role.toUpperCase()}] ${msg}\n`;
    fs.appendFileSync(this.getLogPath(), entry);
    console.log(`[${role}] ${msg.substring(0, 100)}${msg.length > 100 ? '...' : ''}`);
  }

  loadHistory() {
    const file = this.getHistoryPath();
    if (!fs.existsSync(file)) return [];
    try {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      return [];
    }
  }

  saveHistory(userMsg, assistantMsg) {
    let history = this.loadHistory();
    history.push({ role: 'user', content: userMsg });
    history.push({ role: 'assistant', content: assistantMsg });

    // 压缩逻辑: 基于对话轮数
    if (history.length > this.maxHistoryTurns * 2) {
      history = history.slice(-this.maxHistoryTurns * 2);
    }

    // 压缩逻辑: 基于字符长度 (简单估算 Token)
    let totalLen = JSON.stringify(history).length;
    while (totalLen > this.maxHistoryChars && history.length > 2) {
      history.shift(); // 移除最早的一组对话 (User + Assistant)
      history.shift();
      totalLen = JSON.stringify(history).length;
    }

    fs.writeFileSync(this.getHistoryPath(), JSON.stringify(history, null, 2), 'utf8');
  }

  getFormattedPrompt(currentInput) {
    const history = this.loadHistory();
    let historyBlock = "";
    
    if (history.length > 0) {
      historyBlock = "\n<session_context>\n" + 
        history.map(h => `[${h.role === 'user' ? 'CEO' : 'CTO'}]: ${h.content}`).join('\n---\n') +
        "\n</session_context>\n";
    }

    return `${SYSTEM_PROMPT}${historyBlock}\n\n[CEO 指令]: ${currentInput}`;
  }
}

const session = new SessionManager();
let isBusy = false;

const SYSTEM_PROMPT = `[CORE RULES] 
1. Identity: You are Senior CTO. User is CEO. 
2. Language: Interaction in Chinese (中文), technical terms in English. 
3. Workflow: Research -> Analysis -> Discussion -> Development -> Testing -> Verification. 
4. Lockdown: Writing/Modifying is FORBIDDEN without explicit CEO "Approve". 
5. Engineering: Use absolute paths, UTC-0 'Z' timezone.
6. Context Awareness: A <session_context> block contains previous interactions from today. Use this to maintain cognitive continuity.
7. Style: Concise, direct, bullet points.`;

const client = new WSClient({
  botId: WECOM_BOT_ID,
  secret: WECOM_BOT_SECRET,
  autoReconnect: true
});

client.on('connected', () => session.logHuman('system', 'GeminiWeCom v3.0 (Context-Enhanced) ONLINE.'));

client.on('message', async (message) => {
  const msgBody = message.body || message;
  if (msgBody.msgtype !== 'text') return;

  const rawInput = msgBody.text.content;
  const cleanInput = rawInput.replace(/^[>\s]+/, '').trim();
  
  session.logHuman('ceo', cleanInput);

  if (isBusy) {
    const busyId = uuidv4();
    client.replyStream(message, busyId, '🔴 CTO 正在处理中，请稍后。', true).catch(() => {});
    return;
  }

  isBusy = true;
  const streamId = uuidv4();
  let cumulativeOutput = "";
  let lastStatus = "● 首席技术官正在分析指令...";
  let pushTimer = null;

  try {
    await client.replyStream(message, streamId, lastStatus, false).catch(() => {});

    const fullPrompt = session.getFormattedPrompt(cleanInput);

    // 模拟非阻塞 Shell: 这里由于是 spawn，已经是非阻塞的。
    const gemini = spawn(GEMINI_BIN, [
      '--prompt', fullPrompt, 
      '--yolo', 
      '--output-format', 'stream-json'
    ], {
      cwd: process.env.HOME || '/root',
      env: { ...process.env, TERM: 'dumb', NO_COLOR: '1' }
    });

    const rl = readline.createInterface({
      input: gemini.stdout,
      terminal: false
    });

    rl.on('line', (line) => {
      if (!line.trim()) return;
      try {
        const data = JSON.parse(stripAnsi(line));
        
        if (data.type === 'message' && data.role === 'assistant' && data.content) {
          cumulativeOutput += data.content;
        }

        if (data.type === 'tool_use') {
          const toolName = (data.tool_name || data.tool || "tool").split(':').pop();
          lastStatus = `● CTO 正在执行工具: ${toolName}...`;
        }

        if (data.type === 'result' && data.response) {
          cumulativeOutput = data.response;
        }

        // 节流推送，减少企业微信接口调用频率
        if (pushTimer) clearTimeout(pushTimer);
        pushTimer = setTimeout(() => {
          if (isBusy) {
            client.replyStream(message, streamId, `${lastStatus}\n\n${cumulativeOutput.trim() || "(分析中...)"}`, false).catch(() => {});
          }
        }, 800);

      } catch (e) {}
    });

    gemini.on('close', async (code) => {
      if (pushTimer) clearTimeout(pushTimer);
      session.logHuman('engine', `Process exited with code ${code}.`);
      
      const finalMsg = cumulativeOutput.trim() ? `✅ 任务完成\n\n${cumulativeOutput.trim()}` : "✅ 指令已处理。";
      
      if (cumulativeOutput.trim()) {
        session.saveHistory(cleanInput, cumulativeOutput.trim());
        session.logHuman('cto', cumulativeOutput.trim());
      }

      await client.replyStream(message, streamId, finalMsg, true).catch(() => {});
      isBusy = false;
    });

  } catch (err) {
    session.logHuman('fatal', err.message);
    isBusy = false;
  }
});

client.on('error', (err) => session.logHuman('wecom_error', err.message));

client.connect();
