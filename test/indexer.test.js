import { before,beforeEach,afterEach,after,test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import hre from 'hardhat';
import { createIndexer } from '../server/indexer.js';

let connection,ethers,alice,bob,nft,market,indexer;
before(async()=>{connection=await hre.network.connect('hardhat');ethers=connection.ethers;[,alice,bob]=await ethers.getSigners();});
beforeEach(async()=>{
  nft=await ethers.deployContract('NetPunks',['http://localhost/api/metadata/']);
  market=await ethers.deployContract('NetPunksMarket',[await nft.getAddress()]);
  const receipt=await nft.deploymentTransaction().wait();
  const collectionArtifact=await hre.artifacts.readArtifact('NetPunks');
  const marketArtifact=await hre.artifacts.readArtifact('NetPunksMarket');
  const config={instanceId:randomUUID(),chainId:31337,collection:await nft.getAddress(),market:await market.getAddress(),blockNumber:receipt.blockNumber,blockHash:receipt.blockHash,collectionAbi:collectionArtifact.abi,marketAbi:marketArtifact.abi};
  indexer=await createIndexer({config,provider:ethers.provider,databasePath:':memory:'});
});
afterEach(()=>indexer.close());after(()=>connection.close());
const sync=async()=>{indexer.invalidate();await indexer.sync();};
const mint=async()=>nft.connect(alice).mint(1,{value:ethers.parseEther('0.005')});

test('indexer records the actual mint price and minter, not a zero-address free transfer',async()=>{
  await mint();await sync();
  const events=indexer.events();
  assert.equal(events.length,1);assert.equal(events[0].kind,'mint');
  assert.equal(events[0].actor,alice.address);assert.equal(events[0].amount,String(ethers.parseEther('0.005')));
  assert.equal(indexer.allTokens()[0].owner,alice.address);
});
test('a sale is indexed once, and independent transfers retain their own history',async()=>{
  await mint();await nft.connect(alice).approve(await market.getAddress(),0);
  const price=ethers.parseEther('0.02');await market.connect(alice).list(0,price,ethers.ZeroAddress);
  await market.connect(bob).buy(0,price,{value:price});await sync();
  assert.equal(indexer.events({kind:'sale'}).length,1);
  assert.equal(indexer.events({kind:'transfer'}).length,0);
  assert.equal(indexer.stats().sales,1);assert.equal(indexer.stats().volume,String(price));
  assert.equal(indexer.allTokens()[0].owner,bob.address);assert.equal(indexer.allTokens()[0].price,'0');
  await nft.connect(bob).transferFrom(bob.address,alice.address,0);await sync();
  assert.equal(indexer.events({kind:'transfer'}).length,1);
  assert.equal(indexer.allTokens()[0].owner,alice.address);
});
test('operator approval changes invalidate indexed listings, including after regrant',async()=>{
  await mint();await nft.connect(alice).setApprovalForAll(await market.getAddress(),true);
  await market.connect(alice).list(0,1n,ethers.ZeroAddress);await sync();
  assert.equal(indexer.allTokens()[0].price,'1');
  await nft.connect(alice).setApprovalForAll(await market.getAddress(),false);
  await nft.connect(alice).setApprovalForAll(await market.getAddress(),true);await sync();
  assert.equal(indexer.allTokens()[0].price,'0');assert.equal(indexer.stats().listed,0);
});
test('chain rollback rebuilds the index instead of retaining orphaned NFT ownership',async()=>{
  const snapshot=await ethers.provider.send('evm_snapshot',[]);
  await mint();await sync();assert.equal(indexer.allTokens().length,1);
  await ethers.provider.send('evm_revert',[snapshot]);await sync();
  assert.equal(indexer.allTokens().length,0);assert.equal(indexer.events().length,0);assert.equal(indexer.stats().totalMinted,0);
});
