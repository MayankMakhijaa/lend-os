// PM2 config for a Hostinger VPS: `pm2 start ecosystem.config.cjs && pm2 save`
module.exports = {
  apps: [
    {
      name: "loan-os",
      script: "npm",
      args: "start",
      env: { NODE_ENV: "production", PORT: 3000 },
      max_memory_restart: "700M",
    },
  ],
};
