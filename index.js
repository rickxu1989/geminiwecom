require('dotenv').config();
const { WSClient } = require('@wecom/aibot-node-sdk');
const { spawn } = require('child_process');
const readline = require('readline');
const fs = require('fs');
const stripAnsi = require('strip-ansi');
const { v4: uuidv4 } = require('uuid');

const { WECOM_BOT_ID, WECOM_BOT_SECRET } = process.env;
const GEMINI_BIN = '/usr/local/bin/gemini';
const LOG_FILE = '/root/geminiwecom/gemini_bridge.log';

let isBusy = false;

function logToFile(msg) {
  const time = new Date().toISOString();
  fs.appendFileSync(LOG_FILE, `[${time}] ${msg}\n`);
  console.log(msg);
}

const client = new WSClient({
  botId: WECOM_BOT_ID,
  secret: WECOM_BOT_SECRET,
  autoReconnect: true
});

client.on('connected', () => logToFile('[System] GeminiWeCom v25.0 (Full Context Standard) ONLINE.'));

client.on('message', async (message) => {
  const msgBody = message.body || message;
  if (msgBody.msgtype !== 'text') return;

  const rawInput = msgBody.text.content;
  const cleanInput = rawInput.replace(/^[>\s]+/, '').trim();
  logToFile(`[CEO] ${cleanInput}`);

  if (isBusy) {
    const busyId = uuidv4();
    client.replyStream(message, busyId, '🔴 CTO 正在处理中，请稍后。', true).catch(() => {});
    return;
  }

  isBusy = true;
  const streamId = uuidv4();
  let cumulativeOutput = "";
  let lastStatus = "● 首席技术官正在执行...";
  let pushTimer = null;

  try {
    await client.replyStream(message, streamId, lastStatus, false).catch(() => {});

    // 回归标准调用模式，让 Gemini 自动读取 GEMINI.md 和 BOOT_SEQUENCE
    const gemini = spawn(GEMINI_BIN, [
      '--prompt', cleanInput, 
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
          lastStatus = `● CTO 正在使用工具: ${toolName}...`;
        }

        if (data.type === 'result' && data.response) {
          cumulativeOutput = data.response;
        }

        if (pushTimer) clearTimeout(pushTimer);
        pushTimer = setTimeout(() => {
          if (isBusy) {
            client.replyStream(message, streamId, `${lastStatus}\n\n${cumulativeOutput.trim() || "(分析中...)"}`, false).catch(() => {});
          }
        }, 400);

      } catch (e) {}
    });

    gemini.on('close', async (code) => {
      if (pushTimer) clearTimeout(pushTimer);
      logToFile(`[Engine] Done (${code}).`);
      
      const finalMsg = cumulativeOutput.trim() ? `✅ 任务完成\n\n${cumulativeOutput.trim()}` : "✅ 指令已处理。";
      await client.replyStream(message, streamId, finalMsg, true).catch(() => {});
      isBusy = false;
    });

  } catch (err) {
    logToFile(`[Fatal] ${err.message}`);
    isBusy = false;
  }
});

client.connect();
