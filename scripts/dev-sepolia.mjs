import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { root } from '../shared/paths.js';
import { networkPaths } from '../shared/network.js';

const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true; process.exitCode = code;
  for (const child of children) child.kill('SIGTERM');
  setTimeout(() => { for (const child of children) child.kill('SIGKILL'); process.exit(code); }, 1000).unref();
}
process.on('SIGINT', () => stop()); process.on('SIGTERM', () => stop());
const port = Number(process.env.PORT || 3002), webPort = Number(process.env.WEB_PORT || 5174);
try {
  if (!process.env.SEPOLIA_RPC_URL) throw new Error('Fill in SEPOLIA_RPC_URL in .env.sepolia first.');
  if (port === webPort) throw new Error('PORT and WEB_PORT must use different ports.');
  try { await readFile(networkPaths('sepolia').deployment); } catch { throw new Error('No Sepolia deployment found. Follow docs/SEPOLIA.md and deploy first.'); }
  for (const value of [port, webPort]) {
    if (!Number.isInteger(value) || value < 1024 || value > 65535) throw new Error('PORT and WEB_PORT must be valid unprivileged ports.');
    await new Promise((resolve, reject) => {
      const server = createServer();
      server.once('error', () => reject(new Error(`Port ${value} is unavailable. Change PORT/WEB_PORT in .env.sepolia.`)));
      server.listen(value, '127.0.0.1', () => server.close(resolve));
    });
  }
  // The web process does not inherit the deployment key or private RPC endpoint.
  const apiEnv = { ...process.env, APP_NETWORK: 'sepolia', PORT: String(port) };
  delete apiEnv.SEPOLIA_PRIVATE_KEY;
  const webEnv = { ...apiEnv, API_PROXY_TARGET: `http://127.0.0.1:${port}` };
  delete webEnv.SEPOLIA_RPC_URL;
  for (const [args, env] of [
    [['server/index.js'], apiEnv],
    [['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(webPort)], webEnv],
  ]) {
    const child = spawn(process.execPath, args, { cwd: root, stdio: 'inherit', env });
    children.push(child);
    child.on('error', () => { console.error('Could not start Sepolia service.'); stop(1); });
    child.on('exit', code => { if (!stopping) stop(code || 1); });
  }
  console.log(`Sepolia website → http://127.0.0.1:${webPort}\nAPI → http://127.0.0.1:${port}\nCtrl+C stops the website and API. Sepolia assets remain on-chain.`);
} catch (error) { console.error(error.message); stop(1); }
