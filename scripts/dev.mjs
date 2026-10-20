import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { openSync, closeSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { root, runtime } from '../shared/paths.js';

const children=[];
let stopping=false;
function stop(code=0){
  if(stopping)return;
  stopping=true;process.exitCode=code;
  for(const child of children)child.kill('SIGTERM');
  setTimeout(()=>{for(const child of children)child.kill('SIGKILL');process.exit(code);},1000).unref();
}
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
function launch(args,stdio='inherit'){
  const child=spawn(process.execPath,args,{cwd:root,stdio,env:process.env});
  children.push(child);
  child.on('error',()=>{console.error('Could not start a service. Check Node.js and npm ci.');stop(1);});
  return child;
}
async function run(args){const child=launch(args);await new Promise((resolve,reject)=>child.on('exit',code=>code===0?resolve():reject(new Error(`Command failed (${code}).`))));}
function port(value){const number=Number(value);if(!Number.isInteger(number)||number<1024||number>65535)throw new Error('Ports must be integers from 1024 to 65535.');return number;}
async function checkPort(value){
  await new Promise((resolve,reject)=>{
    const server=createServer();
    server.once('error',error=>reject(new Error(error.code==='EADDRINUSE'?`Port ${value} is already in use. See README.md to change ports.`:`Cannot bind port ${value}: ${error.code}.`)));
    server.listen(value,'127.0.0.1',()=>server.close(resolve));
  });
}
try{
  const chainPort=port(process.env.LOCAL_CHAIN_PORT||8545),apiPort=port(process.env.PORT||3001);
  if(chainPort===apiPort)throw new Error('LOCAL_CHAIN_PORT and PORT must differ.');
  await Promise.all([chainPort,apiPort].map(checkPort));
  let webPort=port(process.env.WEB_PORT||5173);
  if(!process.env.WEB_PORT){while(webPort<5183){try{await checkPort(webPort);break;}catch(error){if(!error.message.includes('already in use'))throw error;webPort++;}}}
  if([chainPort,apiPort].includes(webPort))throw new Error('WEB_PORT must differ from the chain and API ports.');
  await checkPort(webPort);
  Object.assign(process.env,{
    APP_NETWORK:'local',PORT:String(apiPort),
    RPC_URL:`http://127.0.0.1:${chainPort}`,
    METADATA_BASE_URL:`http://127.0.0.1:${apiPort}/api/metadata/`,
    API_PROXY_TARGET:`http://127.0.0.1:${apiPort}`,
  });
  await mkdir(runtime,{recursive:true});
  await run(['node_modules/hardhat/dist/src/cli.js','compile']);
  const log=openSync(path.join(runtime,'chain.log'),'w');
  const chain=launch(['node_modules/hardhat/dist/src/cli.js','node','--hostname','127.0.0.1','--port',String(chainPort)],['ignore',log,log]);
  closeSync(log);
  let ready=false;
  for(let attempt=0;attempt<100;attempt++){
    try{
      const response=await fetch(process.env.RPC_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_chainId',params:[]}),signal:AbortSignal.timeout(1000)});
      if((await response.json()).result==='0x7a69'){ready=true;break;}
    }catch{}
    if(chain.exitCode!==null)throw new Error('Hardhat stopped. See .runtime/chain.log.');
    await new Promise(resolve=>setTimeout(resolve,200));
  }
  if(!ready)throw new Error('Local chain did not become ready. See .runtime/chain.log.');
  await run(['scripts/deploy.mjs']);
  const api=launch(['server/index.js']);
  const web=launch(['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(webPort)]);
  for(const child of [chain,api,web])child.on('exit',code=>{if(!stopping){console.error(`A service stopped (${code}).`);stop(code||1);}});
  for(const url of [`http://127.0.0.1:${apiPort}/api/health`,`http://127.0.0.1:${webPort}/`]){
    let available=false;
    for(let attempt=0;attempt<100;attempt++){
      if(stopping)throw new Error('Startup interrupted.');
      try{if((await fetch(url,{signal:AbortSignal.timeout(1000)})).ok){available=true;break;}}catch{}
      await new Promise(resolve=>setTimeout(resolve,200));
    }
    if(!available)throw new Error(`Service did not become ready: ${url}`);
  }
  console.log(`\nNETPUNKS classroom → http://127.0.0.1:${webPort}\nChain: ${chainPort}; API: ${apiPort}. Ctrl+C stops all services.\nRestarting creates a fresh local chain and resets test assets.\n`);
}catch(error){console.error(error.message);stop(1);}
