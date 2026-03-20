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

client.on('connected', () => logToFile('[System] GeminiWeCom v23.2 (Protocol Patch) ONLINE.'));

client.on('message', async (message) => {
  const msgBody = message.body || message;
  if (msgBody.msgtype !== 'text') return;

  const rawInput = msgBody.text.content;
  const cleanInput = rawInput.replace(/^[>\s]+/, '').trim();
  logToFile(`[CEO] ${cleanInput}`);

  if (isBusy) {
    client.reply(message, { content: '🔴 CTO 正在处理中，请稍后。' }).catch(() => {});
    return;
  }

  isBusy = true;
  const streamId = uuidv4();
  let cumulativeOutput = "";
  let lastStatus = "● 首席技术官正在执行...";
  let pushTimer = null;

  try {
    // 立即发送初始状态
    await client.replyStream(message, streamId, lastStatus, false).catch(() => {});

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
      fs.appendFileSync(LOG_FILE + '.raw', line + '\n');

      try {
        // 移除可能存在的隐藏字符或 ANSI
        const cleanLine = stripAnsi(line.trim());
        const data = JSON.parse(cleanLine);
        
        // A. 兼容性字段提取
        const type = data.type;
        const content = data.content || data.response;
        const toolName = data.tool_name || data.tool || (data.arguments ? "unknown_tool" : null);

        // B. 处理消息内容
        if (type === 'message' && data.role === 'assistant' && data.content) {
          cumulativeOutput += data.content;
        }

        // C. 处理工具使用
        if (type === 'tool_use' && toolName) {
          lastStatus = `● CTO 正在使用工具: ${toolName.split(':').pop()}...`;
          logToFile(`[Tool] ${toolName}`);
        }

        // D. 处理最终结果 (针对某些模式下 result 事件不带 message 的情况)
        if (type === 'result' && data.response) {
          cumulativeOutput = data.response;
        }

        // 统一推送逻辑
        if (pushTimer) clearTimeout(pushTimer);
        pushTimer = setTimeout(() => {
          if (isBusy) {
            const out = cumulativeOutput.trim();
            const display = `${lastStatus}\n\n${out || "(正在准备数据...)"}`;
            client.replyStream(message, streamId, display, false).catch(() => {});
          }
        }, 400);

      } catch (err) {
        // logToFile(`[JSON Parse Error] ${err.message}`);
      }
    });

    gemini.stderr.on('data', (data) => {
      fs.appendFileSync(LOG_FILE + '.err', data.toString());
    });

    gemini.on('close', async (code) => {
      if (pushTimer) clearTimeout(pushTimer);
      logToFile(`[Engine] Closed (${code}).`);
      
      const finalMsg = cumulativeOutput.trim() 
        ? `✅ 任务已完成\n\n${cumulativeOutput.trim()}` 
        : "✅ 指令已接收执行。";
      
      await client.replyStream(message, streamId, finalMsg, true).catch(() => {});
      
      // 绝对解锁
      isBusy = false;
    });

    // 强制超时
    setTimeout(() => {
      if (isBusy) {
        gemini.kill('SIGKILL');
        isBusy = false; 
      }
    }, 180000); // 增加到 3 分钟，给复杂任务时间

  } catch (err) {
    logToFile(`[Fatal] ${err.message}`);
    isBusy = false;
  }
});

client.connect();
