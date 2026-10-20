import { JsonRpcProvider, Wallet } from 'ethers';
import { mkdir, readFile, writeFile, rename, open, rm } from 'node:fs/promises';
import path from 'node:path';
import { root } from '../shared/paths.js';
import { networkPaths } from '../shared/network.js';
import { DeploymentError, readSepoliaSettings, deploySepolia } from './lib/sepolia-deployment.mjs';

const args = process.argv.slice(2);
let provider, locked = false;
const { directory } = networkPaths('sepolia');
const lockPath = path.join(directory, 'deploy.lock');
try {
  if (args.some(arg => !['--dry-run','--deploy','--resume'].includes(arg)) || args.includes('--deploy') && args.includes('--dry-run') || args.includes('--resume') && !args.includes('--deploy')) {
    throw new DeploymentError('Use --dry-run, --deploy, or --deploy --resume.');
  }
  const settings = readSepoliaSettings(process.env);
  const artifacts = {};
  for (const [key, name] of [['collection','NetPunks'],['market','NetPunksMarket']]) {
    try { artifacts[key] = JSON.parse(await readFile(path.join(root, `artifacts/contracts/${name}.sol/${name}.json`), 'utf8')); }
    catch { throw new DeploymentError('Compiled contracts are missing. Run npm run compile.'); }
  }
  await mkdir(directory, { recursive: true });
  try {
    const previousPid = Number(await readFile(lockPath, 'utf8'));
    let alive = true;
    try { process.kill(previousPid, 0); } catch (error) { if (error.code === 'ESRCH') alive = false; }
    if (alive) throw new DeploymentError('Another Sepolia deployment command is running. Wait for it to finish.');
    await rm(lockPath);
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const lock = await open(lockPath, 'wx', 0o600);
  locked = true;
  await lock.writeFile(String(process.pid)); await lock.close();
  const store = {
    async read(name) { try { return JSON.parse(await readFile(path.join(directory, name), 'utf8')); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } },
    async write(name, value) {
      const target = path.join(directory, name), temporary = `${target}.tmp`;
      await writeFile(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
      await rename(temporary, target);
    },
  };
  provider = new JsonRpcProvider(settings.rpcUrl, undefined, { cacheTimeout: -1, batchMaxCount: 1 });
  await deploySepolia({ provider, signer: new Wallet(settings.privateKey, provider), artifacts, settings, store, deploy: args.includes('--deploy'), resume: args.includes('--resume') });
} catch (error) {
  // Provider errors can embed API keys, full request URLs or signed transactions. Never dump them.
  console.error(error instanceof DeploymentError ? error.message : 'Sepolia RPC/deployment operation failed. Check connectivity, balance, and pending transactions on Etherscan. If a pending record exists, use npm run deploy:sepolia -- --resume. Credentials and RPC error details were not printed.');
  process.exitCode = 1;
} finally {
  provider?.destroy();
  if (locked) await rm(lockPath, { force: true });
}
