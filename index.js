require('dotenv').config();
const { WSClient } = require('@wecom/aibot-node-sdk');
const { spawn } = require('child_process');
const stripAnsi = require('strip-ansi');
const fs = require('fs');
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

client.on('connected', () => logToFile('[System] GeminiWeCom v22.0 (YOLO Cold-Boot) ONLINE.'));

// 强力去噪过滤器
function filterNoise(text) {
  const lines = text.split('\n');
  let clean = "";
  for (let l of lines) {
    let t = l.trim();
    if (!t) continue;
    
    // 去除所有边框字符
    if (/[─╭╰│]/.test(t)) continue;
    
    // 去除系统提示
    if (t.includes('Waiting for authentication')) continue;
    if (t.includes('MCP')) continue;
    if (t.includes('Shift+Tab')) continue;
    if (t.includes('? for shortcuts')) continue;
    
    // 去除英文思考过程
    if (/^(I (will|'ll|'m|am|now|proceed|begin|search|retrieve|read|check|'ve|have))/i.test(t)) continue;
    if (/^(Searching|Reading|Checking|Loading|Executing|Refreshed|Authenticating|Scheduling)/i.test(t)) continue;

    clean += t + '\n';
  }
  return clean.trim();
}

client.on('message', async (message) => {
  const msgBody = message.body || message;
  if (msgBody.msgtype !== 'text') return;

  const rawInput = msgBody.text.content;
  const cleanInput = rawInput.replace(/^[>\s]+/, '').trim();
  logToFile(`[CEO] ${cleanInput}`);

  if (isBusy) {
    logToFile('[System] Rejected: Busy');
    // 发送独立的提示消息，而非 stream，规避 40008
    client.reply(message, { msgtype: 'text', text: { content: '🔴 CTO 正在处理上一项任务，请稍后。' } }).catch(() => {});
    return;
  }

  isBusy = true;
  const streamId = uuidv4();
  let cumulativeOutput = "";
  let pushTimer = null;
  let hasSentFirst = false;

  try {
    // 强制执行模式: YOLO + Text Output + Non-Interactive
    logToFile('[Engine] Executing cold boot spawn...');
    const gemini = spawn(GEMINI_BIN, ['--prompt', cleanInput, '--yolo', '--output-format', 'text'], {
      cwd: process.env.HOME || '/root',
      env: { ...process.env, TERM: 'dumb', NO_COLOR: '1', GEMINI_CLI_INTERACTIVE: 'false' }
    });

    // 强行阻断进程死锁
    const timeout = setTimeout(() => {
      logToFile('[Error] Process Timeout (60s). Killing.');
      gemini.kill('SIGKILL');
    }, 60000);

    gemini.stdout.on('data', (data) => {
      const rawText = stripAnsi(data.toString());
      fs.appendFileSync(LOG_FILE + '.raw', rawText); // Debug 用

      const filtered = filterNoise(rawText);
      if (filtered) {
        cumulativeOutput += filtered + '\n';

        if (pushTimer) clearTimeout(pushTimer);
        pushTimer = setTimeout(async () => {
          if (cumulativeOutput.trim()) {
            try {
              if (!hasSentFirst) {
                // 第一包加上前缀以示区分
                await client.replyStream(message, streamId, "● 分析中...\n" + cumulativeOutput.trim(), false);
                hasSentFirst = true;
              } else {
                await client.replyStream(message, streamId, "● 分析中...\n" + cumulativeOutput.trim(), false);
              }
            } catch (e) {
              logToFile(`[Stream Error] ${e.message}`);
            }
          }
        }, 500);
      }
    });

    gemini.stderr.on('data', (data) => {
      fs.appendFileSync(LOG_FILE + '.err', data.toString());
    });

    gemini.on('close', async (code) => {
      clearTimeout(timeout);
      if (pushTimer) clearTimeout(pushTimer);
      
      logToFile(`[Task] Finished with code ${code}.`);
      
      const finalMsg = cumulativeOutput.trim() 
        ? "● 分析完成\n" + cumulativeOutput.trim() 
        : "✅ 指令已接收执行，但无文本回复。";
      
      await client.replyStream(message, streamId, finalMsg, true).catch(() => {});
      isBusy = false;
    });

  } catch (err) {
    logToFile(`[Spawn Error] ${err.message}`);
    client.reply(message, { msgtype: 'text', text: { content: `❌ 系统错误: ${err.message}` } }).catch(() => {});
    isBusy = false;
  }
});

client.connect();
