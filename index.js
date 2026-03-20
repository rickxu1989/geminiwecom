require('dotenv').config();
const { WSClient } = require('@wecom/aibot-node-sdk');
const { spawn } = require('child_process');
const readline = require('readline');
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

client.on('connected', () => logToFile('[System] GeminiWeCom v23.0 (Stream-JSON Protocol) ONLINE.'));

client.on('message', async (message) => {
  const msgBody = message.body || message;
  if (msgBody.msgtype !== 'text') return;

  const rawInput = msgBody.text.content;
  const cleanInput = rawInput.replace(/^[>\s]+/, '').trim();
  logToFile(`[CEO] ${cleanInput}`);

  if (isBusy) {
    client.reply(message, { msgtype: 'text', text: { content: '🔴 CTO 正在处理中，请稍后。' } }).catch(() => {});
    return;
  }

  isBusy = true;
  const streamId = uuidv4();
  let cumulativeOutput = "";
  let lastStatus = "● 首席技术官正在思考...";
  let pushTimer = null;

  // 1. 立即反馈初始状态
  await client.replyStream(message, streamId, lastStatus, false).catch(() => {});

  try {
    logToFile('[Engine] Executing stream-json spawn...');
    
    // 使用 stream-json 模式，每一行都是一个 JSON 对象
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
        const data = JSON.parse(line);
        
        // A. 处理消息片段 (100% 纯净内容)
        if (data.type === 'message' && data.role === 'assistant') {
          cumulativeOutput += data.content;
          
          if (pushTimer) clearTimeout(pushTimer);
          pushTimer = setTimeout(() => {
            if (cumulativeOutput.trim()) {
              const fullMsg = `${lastStatus}\n\n${cumulativeOutput.trim()}`;
              client.replyStream(message, streamId, fullMsg, false).catch(() => {});
            }
          }, 300);
        }

        // B. 处理工具调用 (增强交互感)
        if (data.type === 'tool_use') {
          const toolName = data.tool.split(':').pop(); // 简化工具名
          lastStatus = `● CTO 正在使用工具: ${toolName}...`;
          client.replyStream(message, streamId, lastStatus + (cumulativeOutput ? `\n\n${cumulativeOutput.trim()}` : ""), false).catch(() => {});
          logToFile(`[Tool] Using ${data.tool}`);
        }

        // C. 处理最终结果
        if (data.type === 'result') {
          // data.response 包含最终完整的回答
          cumulativeOutput = data.response;
          logToFile(`[Task] Result received. Tokens: ${data.stats?.total_tokens || 'N/A'}`);
        }

      } catch (err) {
        logToFile(`[JSON Error] Failed to parse line: ${line.substring(0, 100)}...`);
      }
    });

    // 错误流记录 (方便排查底层报错)
    gemini.stderr.on('data', (data) => {
      fs.appendFileSync(LOG_FILE + '.err', data.toString());
    });

    gemini.on('close', async (code) => {
      if (pushTimer) clearTimeout(pushTimer);
      logToFile(`[Engine] Process closed (code ${code}).`);
      
      const finalMsg = cumulativeOutput.trim() 
        ? `✅ 任务执行完毕\n\n${cumulativeOutput.trim()}` 
        : "✅ 指令已处理完成。";
      
      await client.replyStream(message, streamId, finalMsg, true).catch(() => {});
      isBusy = false;
    });

    // 超时保护
    setTimeout(() => {
      if (isBusy) {
        gemini.kill('SIGKILL');
        logToFile('[Timeout] Task forced kill after 120s.');
      }
    }, 120000);

  } catch (err) {
    logToFile(`[Bridge Error] ${err.message}`);
    client.reply(message, { msgtype: 'text', text: { content: `❌ 执行异常: ${err.message}` } }).catch(() => {});
    isBusy = false;
  }
});

client.connect();
