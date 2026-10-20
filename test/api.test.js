import { before,after,test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { traitsFor } from '../shared/art.js';
import { ZeroAddress,parseEther } from 'ethers';
let server,base;
const address='0x1111111111111111111111111111111111111111';
const tokens=Array.from({length:48},(_,id)=>({id,owner:address,price:id<10?String(parseEther((id/100+0.01).toFixed(2))):'0',onlyBuyer:ZeroAddress,bid:'0',bidder:ZeroAddress,traits:traitsFor(id)}));
before(async()=>{
  const indexer={sync:async()=>{},invalidate:()=>{},allTokens:()=>tokens,events:()=>[],stats:()=>({totalMinted:48}),config:{chainId:31337,privateKey:'must-stay-private',privateRpcUrl:'https://provider.invalid/api-secret',raw:'signed-transaction'},settings:{mintOpen:true}};
  server=createApp(indexer).listen(0,'127.0.0.1');
  await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});base=`http://127.0.0.1:${server.address().port}`;
});
after(()=>new Promise(resolve=>server?.listening?server.close(resolve):resolve()));
const get=async path=>{const res=await fetch(base+path);return {status:res.status,data:res.headers.get('content-type')?.includes('json')?await res.json():await res.text()};};
test('catalog applies filters before pagination and sorts price numerically',async()=>{
  const {data}=await get('/api/punks?status=listed&sort=price-desc&limit=3');
  assert.equal(data.total,10);assert.deepEqual(data.items.map(p=>p.id),[9,8,7]);
  const filtered=await get('/api/punks?type=Alien');assert.deepEqual(filtered.data.items.map(p=>p.id),[0]);
});
test('price range, favorites and pagination are composed without broadening results',async()=>{
  const {data}=await get('/api/punks?minPrice=0.03&maxPrice=0.06&ids=2,3,5,9');
  assert.deepEqual(data.items.map(p=>p.id),[2,3,5]);
  const second=await get('/api/punks?limit=20&page=2');assert.equal(second.data.items[0].id,20);
  const empty=await get('/api/punks?ids=none');assert.equal(empty.data.total,0);
});
test('invalid identifiers, addresses and prices are rejected with useful HTTP status',async()=>{
  assert.equal((await get('/api/punks/10000/image.svg')).status,404);
  assert.equal((await get('/api/punks/99')).status,404);
  assert.equal((await get('/api/punks?owner=invalid')).status,400);
  assert.equal((await get('/api/punks?minPrice=bad')).status,400);
  assert.equal((await get('/api/punks?maxPrice=-1')).status,400);
});
test('metadata and original SVG images are available even before mint',async()=>{
  const image=await get('/api/punks/9999/image.svg');assert.equal(image.status,200);assert.match(image.data,/shape-rendering="crispEdges"/);
  const metadata=await get('/api/metadata/9999');assert.equal(metadata.data.name,'NETPUNK #9999');
  assert.equal(metadata.data.image,'http://127.0.0.1:3001/api/punks/9999/image.svg');
});
test('public configuration never serializes private deployment fields',async()=>{
  const {data}=await get('/api/config');
  assert.equal(data.chainId,31337);assert.equal(data.mintOpen,true);
  assert.equal(data.privateKey,undefined);assert.equal(data.privateRpcUrl,undefined);assert.equal(data.raw,undefined);
  assert.ok(!JSON.stringify(data).includes('must-stay-private'));
});
test('Sepolia synchronization failures do not expose RPC URLs or credentials in HTTP responses',async()=>{
  const temporary=createApp({config:{chainId:11155111},sync:async()=>{throw new Error('https://provider.invalid/api-secret');}}).listen(0,'127.0.0.1');
  await new Promise((resolve,reject)=>{temporary.once('listening',resolve);temporary.once('error',reject);});
  try {
    for(const route of ['/api/health','/api/config']){
      const response=await fetch(`http://127.0.0.1:${temporary.address().port}${route}`);
      assert.equal(response.status,503);
      const text=await response.text();assert.ok(!text.includes('api-secret'));assert.ok(text.includes('Sepolia'));
    }
  }finally{await new Promise(resolve=>temporary.close(resolve));}
});
