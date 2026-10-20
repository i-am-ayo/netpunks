import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { root } from '../shared/paths.js';

const [major,minor]=process.versions.node.split('.').map(Number);
let failed=false;
console.log(`Node.js ${process.versions.node} · ${process.platform}/${process.arch}`);
if(major<22 || major===22 && minor<13){console.error('Node.js 22.13+ is required. Node.js 24.x LTS is recommended for this class.');failed=true;}
const require=createRequire(path.join(root,'package.json'));
for(const name of ['hardhat','solc','vite','vue','express','ethers']){
  try{require.resolve(name);console.log(`OK  ${name}`);}catch{console.error(`Missing ${name}. Run npm ci in the project root.`);failed=true;}
}
if(!existsSync(path.join(root,'package-lock.json'))){console.error('package-lock.json is missing. Extract the complete student archive again.');failed=true;}
try{await import('node:sqlite');console.log('OK  Node.js built-in SQLite');}catch{console.error('Built-in SQLite is unavailable. Upgrade to Node.js 24.x.');failed=true;}
console.log('The local classroom needs no MetaMask, RPC API key or Sepolia test ETH.');
if(failed)process.exitCode=1;else console.log('Environment check passed. Complete the contracts, then follow README.md to test and start.');
