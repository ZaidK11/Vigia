// VIGÍA Portal Watchdog — auto-restarts server on crash/SIGTERM
const { spawn } = require('child_process');
const path = require('path');

const SERVER = path.join(__dirname, 'index.js');
let restarts = 0;

function start() {
  restarts++;
  console.log(`[Watchdog] Starting server (attempt ${restarts})...`);

  const proc = spawn('node', [SERVER], {
    stdio: 'inherit',
    env: process.env
  });

  proc.on('exit', (code, signal) => {
    console.log(`[Watchdog] Server exited — code=${code} signal=${signal}. Restarting in 2s...`);
    setTimeout(start, 2000);
  });

  // Forward kill signals to child
  ['SIGTERM', 'SIGINT'].forEach(sig => {
    process.once(sig, () => {
      console.log(`[Watchdog] Received ${sig}, forwarding to server...`);
      proc.kill(sig);
    });
  });
}

start();
