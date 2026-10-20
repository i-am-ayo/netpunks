import { createIndexer } from './indexer.js';
import { createApp } from './app.js';
let indexer;
try {
  indexer=await createIndexer();
  await indexer.sync();
  const port=Number(process.env.PORT)||(process.env.APP_NETWORK==='sepolia'?3002:3001);
  const host=process.env.HOST||'127.0.0.1';
  const server=createApp(indexer).listen(port,host,()=>console.log(`NETPUNKS API (${indexer.config.chainName}) → http://${host}:${port}`));
  server.on('error',()=>{console.error('API could not bind the configured host/port.');indexer.close();process.exitCode=1;});
  for (const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>server.close(()=>{indexer.close();process.exit(0);}));
} catch (error) {
  indexer?.close();
  console.error(process.env.APP_NETWORK==='sepolia' ? 'Sepolia API startup failed. Check .env.sepolia, RPC availability, and .runtime/sepolia/deployment.json. See docs/SEPOLIA.md.' : error.message);
  process.exitCode=1;
}
