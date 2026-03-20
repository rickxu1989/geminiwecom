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
const IGNORE_FILE = '/root/.geminiignore';

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

client.on('connected', () => logToFile('[System] GeminiWeCom v24.1 (Force Skip) ONLINE.'));

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
    // 1. 物理屏蔽启动序列 (极速冷启动的核心)
    fs.writeFileSync(IGNORE_FILE, 'GEMINI.md\nBOOT_SEQUENCE.md\nRULES.md\nINDEX.md\n');

    await client.replyStream(message, streamId, lastStatus, false).catch(() => {});

    // 2. 注入核心身份，弥补物理屏蔽带来的失忆
    const acceleratedPrompt = `You are the Senior CTO. Reply in Chinese. Use engineering standards. [CEO Command]: ${cleanInput}`;

    const gemini = spawn(GEMINI_BIN, [
      '--prompt', acceleratedPrompt, 
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
        const type = data.type;
        
        if (type === 'message' && data.role === 'assistant' && data.content) {
          cumulativeOutput += data.content;
        }

        if (type === 'tool_use') {
          const toolName = (data.tool_name || data.tool || "tool").split(':').pop();
          lastStatus = `● CTO 正在使用工具: ${toolName}...`;
        }

        if (type === 'result' && data.response) {
          cumulativeOutput = data.response;
        }

        if (pushTimer) clearTimeout(pushTimer);
        pushTimer = setTimeout(() => {
          if (isBusy) {
            const out = cumulativeOutput.trim();
            client.replyStream(message, streamId, `${lastStatus}\n\n${out || "(处理中...)"}`, false).catch(() => {});
          }
        }, 400);

      } catch (e) {}
    });

    gemini.on('close', async (code) => {
      if (pushTimer) clearTimeout(pushTimer);
      // 3. 恢复环境
      if (fs.existsSync(IGNORE_FILE)) fs.unlinkSync(IGNORE_FILE);
      
      const finalMsg = cumulativeOutput.trim() ? `✅ 任务完成\n\n${cumulativeOutput.trim()}` : "✅ 指令已执行。";
      await client.replyStream(message, streamId, finalMsg, true).catch(() => {});
      isBusy = false;
    });

  } catch (err) {
    if (fs.existsSync(IGNORE_FILE)) fs.unlinkSync(IGNORE_FILE);
    logToFile(`[Fatal] ${err.message}`);
    isBusy = false;
  }
});

client.connect();
