import { before, beforeEach, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import hre from 'hardhat';
import { BrowserProvider, Contract, Wallet, parseEther } from 'ethers';
import { deploySepolia, readSepoliaSettings } from '../scripts/lib/sepolia-deployment.mjs';
import { networkPaths, publicDeployment, SEPOLIA } from '../shared/network.js';
import { createIndexer } from '../server/indexer.js';

let connection, provider, signer, artifacts, store, files, settings;
before(async () => {
  artifacts = { collection: await hre.artifacts.readArtifact('NetPunks'), market: await hre.artifacts.readArtifact('NetPunksMarket') };
});
beforeEach(async () => {
  connection = await hre.network.create({ network: 'hardhat', override: { chainId: SEPOLIA.chainId } });
  provider = new BrowserProvider(connection.provider, undefined, { cacheTimeout: -1 });
  signer = Wallet.createRandom().connect(provider);
  await provider.send('hardhat_setBalance', [signer.address, '0x8ac7230489e80000']);
  settings = { metadataBaseUrl: 'ipfs://bafybeigabcdefghijklmnopqrstuvwxyz234567abcdefghijklmnop/', walletRpcUrl: SEPOLIA.rpcUrl, confirmations: 1 };
  files = new Map();
  store = { read: async name => structuredClone(files.get(name) || null), write: async (name, value) => { files.set(name, structuredClone(value)); } };
});
afterEach(async () => { provider.destroy(); await connection.close(); });
const run = options => deploySepolia({ provider, signer, artifacts, settings, store, log: () => {}, ...options });

test('Sepolia and local profiles isolate deployment records and SQLite files', () => {
  assert.notEqual(networkPaths('local').deployment, networkPaths('sepolia').deployment);
  assert.notEqual(networkPaths('local').database, networkPaths('sepolia').database);
  assert.throws(() => networkPaths('../mainnet'), /APP_NETWORK/);
});
test('unconfigured, local metadata, and publicly known demo keys are rejected without echoing secrets', () => {
  assert.throws(() => readSepoliaSettings({}), /Missing: SEPOLIA_RPC_URL/);
  const env = { SEPOLIA_RPC_URL: 'https://rpc.sepolia.org', SEPOLIA_PRIVATE_KEY: signer.privateKey, SEPOLIA_METADATA_BASE_URL: 'http://127.0.0.1:3001/api/metadata/' };
  assert.throws(() => readSepoliaSettings(env), error => /final public HTTPS/.test(error.message) && !error.message.includes(signer.privateKey));
  assert.throws(() => readSepoliaSettings({ ...env, SEPOLIA_METADATA_BASE_URL: 'https://nft-storage.invalid/metadata/?id=/' }), /final public HTTPS/);
  assert.equal(readSepoliaSettings({ ...env, SEPOLIA_METADATA_BASE_URL: settings.metadataBaseUrl }).address, signer.address);
  // Well-known Hardhat development key, deliberately unsuitable for public networks.
  assert.throws(() => readSepoliaSettings({ ...env, SEPOLIA_PRIVATE_KEY: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', SEPOLIA_METADATA_BASE_URL: settings.metadataBaseUrl }), /Hardhat demo/);
});
test('wrong chain and insufficient balance cannot sign or broadcast deployment transactions', async () => {
  await assert.rejects(run({ deploy: true, provider: { getNetwork: async () => ({ chainId: 1n }) } }), /expected Sepolia/);
  await provider.send('hardhat_setBalance', [signer.address, '0x0']);
  await assert.rejects(run({ deploy: true }), /Insufficient Sepolia/);
  assert.equal(files.size, 0);
  assert.equal(await provider.getTransactionCount(signer.address), 0);
});
test('dry run estimates both contracts without sending transactions or saving a deployment', async () => {
  const result = await run();
  assert.equal(result.dryRun, true); assert.ok(BigInt(result.required) > 0n);
  assert.equal(await provider.getCode(result.collection), '0x');
  assert.equal(await provider.getTransactionCount(signer.address), 0);
  assert.equal(files.size, 0);
});
test('deployment produces an empty collection, linked market, and working Sepolia index without private credentials', async () => {
  const config = await run({ deploy: true });
  const nft = new Contract(config.collection, artifacts.collection.abi, signer);
  assert.equal(await nft.totalMinted(), 0n);
  assert.equal(await nft.owner(), signer.address);
  assert.equal(await provider.getTransactionCount(signer.address), 2);
  assert.equal(config.rpcUrl, SEPOLIA.rpcUrl);
  assert.ok(!JSON.stringify(config).includes(signer.privateKey));
  const visible = publicDeployment({ ...config, privateKey: signer.privateKey, privateRpcUrl: 'https://private-provider.invalid/secret', raw: files.get('pending.json').collection.raw });
  assert.ok(!JSON.stringify(visible).includes('secret'));
  assert.equal(visible.privateKey, undefined); assert.equal(visible.raw, undefined);
  const indexer = await createIndexer({ config, provider, databasePath: ':memory:', network: 'sepolia', logBlockRange: 1 });
  try {
    await indexer.sync(); assert.equal(indexer.stats().totalMinted, 0);
    await (await nft.mint(1, { value: parseEther('0.005') })).wait();
    indexer.invalidate(); await indexer.sync();
    assert.equal(indexer.allTokens()[0].owner, signer.address);
    assert.equal(await nft.tokenURI(0), `${settings.metadataBaseUrl}0`);
  } finally { indexer.close(); }
  await assert.rejects(run({ deploy: true }), /already exists/);
});
test('an interruption before broadcast resumes the exact saved transaction and prevents constructor changes', async () => {
  let interrupt = true;
  const originalWrite = store.write;
  store.write = async (name, value) => {
    await originalWrite(name, value);
    if (name === 'pending.json' && value.collection && interrupt) { interrupt = false; throw new Error('Simulated interruption after saving transaction'); }
  };
  await assert.rejects(run({ deploy: true }), /Simulated interruption/);
  const savedHash = files.get('pending.json').collection.hash;
  assert.equal(await provider.getTransactionCount(signer.address), 0);
  await assert.rejects(run({ deploy: true }), /--resume/);
  await assert.rejects(run({ deploy: true, resume: true, settings: { ...settings, metadataBaseUrl: `${settings.metadataBaseUrl}changed/` } }), /does not match/);
  const config = await run({ deploy: true, resume: true });
  assert.equal(config.transactions.collection, savedHash);
  assert.equal(await provider.getTransactionCount(signer.address), 2);
});
test('an RPC timeout after the NFT is mined resumes without deploying another NFT', async () => {
  let interrupt = true;
  const flaky = new Proxy(provider, { get(target, property) {
    if (property === 'broadcastTransaction') return async raw => {
      const tx = await target.broadcastTransaction(raw);
      if (interrupt) { interrupt = false; throw new Error('Simulated RPC timeout after broadcast'); }
      return tx;
    };
    const value = Reflect.get(target, property, target);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
  await assert.rejects(run({ deploy: true, provider: flaky }), /Simulated RPC timeout/);
  assert.equal(await provider.getTransactionCount(signer.address), 1);
  const saved = files.get('pending.json').collection;
  const config = await run({ deploy: true, resume: true });
  assert.equal(config.collection, saved.address);
  assert.equal(config.transactions.collection, saved.hash);
  assert.equal(await provider.getTransactionCount(signer.address), 2);
});
