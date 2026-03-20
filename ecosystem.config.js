module.exports = {
  apps: [{
    name: 'gemini-wecom',
    script: 'index.js',
    cwd: '/root/geminiwecom',
    // 监控模式：如果 index.js 变动则自动重启 (开发阶段很有用)
    watch: false,
    // 最大内存重启阈值
    max_memory_restart: '500M',
    // 环境变量
    env: {
      NODE_ENV: 'production',
    },
    // 日志配置
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: 'logs/pm2_error.log',
    out_file: 'logs/pm2_out.log',
    merge_logs: true,
    // 故障自动重启延迟：初始 1秒，最长延迟 15秒
    exp_backoff_restart_delay: 1000
  }]
};
