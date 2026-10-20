import { JsonRpcProvider, ContractFactory, parseEther, ZeroAddress } from 'ethers';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { root, runtime } from '../shared/paths.js';

const provider = new JsonRpcProvider(process.env.RPC_URL || 'http://127.0.0.1:8545');
if ((await provider.getNetwork()).chainId !== 31337n) throw new Error('This seed script only runs on local chain 31337.');
const loadArtifact = async (name) => JSON.parse(await readFile(path.join(root, `artifacts/contracts/${name}.sol/${name}.json`), 'utf8'));
const collectionArtifact = await loadArtifact('NetPunks');
const marketArtifact = await loadArtifact('NetPunksMarket');
const signers = await Promise.all(Array.from({ length: 14 }, (_, i) => provider.getSigner(i)));
const nft = await new ContractFactory(collectionArtifact.abi, collectionArtifact.bytecode, signers[0]).deploy(process.env.METADATA_BASE_URL || 'http://127.0.0.1:3001/api/metadata/');
await nft.waitForDeployment();
const receipt = await nft.deploymentTransaction().wait();
const market = await new ContractFactory(marketArtifact.abi, marketArtifact.bytecode, signers[0]).deploy(await nft.getAddress());
await market.waitForDeployment();
const marketAddress = await market.getAddress();

console.log('Creating original collection and local market activity…');
for (let i=0;i<12;i++) {
  await (await nft.connect(signers[i]).mint(4, { value: parseEther('0.02') })).wait();
  await (await nft.connect(signers[i]).setApprovalForAll(marketAddress, true)).wait();
}
for (let i=0;i<24;i++) {
  await (await market.connect(signers[Math.floor(i/4)]).list(i, parseEther((0.008 + (i % 9) * 0.003).toFixed(3)), ZeroAddress)).wait();
}
// These are real local-chain transactions, not fabricated production metrics.
await (await nft.connect(signers[12]).setApprovalForAll(marketAddress, true)).wait();
for (let i=0;i<5;i++) {
  const listing = await market.getListing(i);
  await (await market.connect(signers[12]).buy(i, listing.price, { value: listing.price })).wait();
  await (await market.connect(signers[12]).list(i, parseEther((0.014 + i * 0.004).toFixed(3)), ZeroAddress)).wait();
}
for (let i=0;i<6;i++) {
  await (await market.connect(signers[13]).placeBid(28+i, { value: parseEther((0.006 + i * 0.002).toFixed(3)) })).wait();
}
const config = {
  instanceId: randomUUID(), chainId: 31337, chainName: 'Hardhat Local',
  rpcUrl: process.env.RPC_URL || 'http://127.0.0.1:8545', collection: await nft.getAddress(), market: marketAddress,
  blockNumber: receipt.blockNumber, blockHash: receipt.blockHash,
  collectionAbi: collectionArtifact.abi, marketAbi: marketArtifact.abi,
  createdAt: new Date().toISOString(),
};
await mkdir(runtime, { recursive: true });
await writeFile(path.join(runtime, 'deployment.json'), JSON.stringify(config, null, 2));
console.log(`Deployed NETPUNKS on chain ${config.chainId}: ${config.collection}`);
console.log('48 minted NFTs, 24 listings, 6 bids, and 5 sales are ready.');
provider.destroy();
