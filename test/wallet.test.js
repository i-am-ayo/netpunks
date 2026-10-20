import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { configureWallet, canUseDemo, connectDemo, restoreWallet, switchNetwork, disconnectWallet } from '../src/lib/wallet.js';
import { SEPOLIA } from '../shared/network.js';
import { DEMO_ACCOUNTS, LOCAL_ACCOUNT_COUNT } from '../shared/demo-accounts.js';
import { wallet } from '../src/lib/wallet.js';
import { JsonRpcProvider, parseEther } from 'ethers';
import hre from 'hardhat';

const originals = Object.fromEntries(['window','location','sessionStorage'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
function environment(values = new Map(), ethereum = {}) {
  for (const [key, value] of Object.entries({ location: { hostname: '127.0.0.1' }, window: { ethereum }, sessionStorage: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) } })) {
    Object.defineProperty(globalThis, key, { configurable: true, value });
  }
}
afterEach(() => {
  disconnectWallet();
  for (const [key, descriptor] of Object.entries(originals)) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
  }
});
test('Sepolia disables local demo accounts even when its website runs on localhost', async () => {
  environment(); configureWallet(SEPOLIA);
  assert.equal(canUseDemo(), false);
  await assert.rejects(connectDemo(), /只允许在本地/);
  configureWallet({ chainId: 31337 }); assert.equal(canUseDemo(), true);
});
test('Sepolia ignores a local-network demo wallet saved by an earlier visit', async () => {
  let requests = 0;
  environment(new Map([['netpunks-wallet','14'],['netpunks-wallet-31337','14']]), { request: async () => { requests++; } });
  configureWallet(SEPOLIA); await restoreWallet();
  assert.equal(requests, 0);
});
test('adding Sepolia to a browser wallet uses its public RPC and block explorer', async () => {
  const requests = [];
  environment(new Map(), { request: async request => { requests.push(request); if (request.method === 'wallet_switchEthereumChain') throw { code: 4902 }; } });
  configureWallet(SEPOLIA); await switchNetwork();
  assert.equal(requests[0].params[0].chainId, '0xaa36a7');
  assert.equal(requests[1].method, 'wallet_addEthereumChain');
  assert.deepEqual(requests[1].params[0].rpcUrls, [SEPOLIA.rpcUrl]);
  assert.deepEqual(requests[1].params[0].blockExplorerUrls, [SEPOLIA.explorerUrl]);
});
test('all 20 local identities are funded, connectable, and restored after refreshing', async () => {
  const rpc=await hre.network.createServer('hardhat','127.0.0.1',0);
  const {port}=await rpc.listen();
  const provider=new JsonRpcProvider(`http://127.0.0.1:${port}`,undefined,{cacheTimeout:-1});
  const values=new Map(),originalFetch=globalThis.fetch;
  environment(values);
  configureWallet({chainId:31337,rpcUrl:`http://127.0.0.1:${port}`});
  globalThis.fetch=async(url,...args)=>{
    if(typeof url==='string' && url.startsWith('/api/wallet/'))return Response.json({balance:String(parseEther('10000')),pending:'0',minted:0,owned:[],bids:[]});
    return originalFetch(url,...args);
  };
  try {
    const accounts=await provider.send('eth_accounts',[]);
    assert.equal(accounts.length,LOCAL_ACCOUNT_COUNT);
    const indices=[...DEMO_ACCOUNTS.map(account=>account.index),0];
    assert.equal(new Set(indices).size,accounts.length);
    assert.equal(DEMO_ACCOUNTS.find(account=>account.label==='A').index,14);
    assert.equal(DEMO_ACCOUNTS.find(account=>account.label==='B').index,15);
    for(const index of indices){
      assert.equal(await provider.getBalance(accounts[index]),parseEther('10000'));
      await connectDemo(index);
      assert.equal(wallet.address.toLowerCase(),accounts[index]);
      assert.equal(values.get('netpunks-wallet-31337'),String(index));
      disconnectWallet();
      values.set('netpunks-wallet-31337',String(index));
      await restoreWallet();
      assert.equal(wallet.address.toLowerCase(),accounts[index]);
      assert.equal(wallet.mode,`demo-${index}`);
    }
  }finally{disconnectWallet();globalThis.fetch=originalFetch;provider.destroy();await rpc.close();}
});
test('invalid local account indices cannot connect or restore', async () => {
  environment(new Map([['netpunks-wallet-31337','20']]));configureWallet({chainId:31337});
  for(const index of [-1,20,1.5,'invalid'])await assert.rejects(connectDemo(index),/有效的本地体验账户/);
  await restoreWallet();assert.equal(wallet.address,'');
});
