import {before,beforeEach,after,test} from 'node:test';
import assert from 'node:assert/strict';
import hre from 'hardhat';

let connection,ethers,nft,market,owner,alice,bob,carol;
before(async()=>{connection=await hre.network.create('hardhat');ethers=connection.ethers;[owner,alice,bob,carol]=await ethers.getSigners();});
beforeEach(async()=>{nft=await ethers.deployContract('NetPunks',['https://assets.invalid/metadata/']);market=await ethers.deployContract('NetPunksMarket',[await nft.getAddress()]);});
after(()=>connection.close());
const eth=value=>ethers.parseEther(value);
const mint=async(count=1)=>nft.connect(alice).mint(count,{value:eth('0.005')*BigInt(count)});
async function listed(){await mint();await nft.connect(alice).approve(await market.getAddress(),0);await market.connect(alice).list(0,eth('0.02'),ethers.ZeroAddress);}
async function rejects(promise,name){
  await assert.rejects(promise,error=>{
    const data=error.data||error.info?.error?.data;
    for(const contract of [nft,market])try{if(contract.interface.parseError(data)?.name===name)return true;}catch{}
    return String(error).includes(name);
  },`Expected ${name}`);
}
test('classroom: overpayment is rejected and transferring cannot restore lifetime mint quota',async()=>{
  await rejects(nft.connect(alice).mint(1,{value:eth('0.006')}),'IncorrectPayment');
  await mint(5);await nft.connect(alice).transferFrom(alice.address,bob.address,0);
  await rejects(mint(),'WalletLimit');assert.equal(await nft.totalMinted(),5n);
});
test('classroom: failed safe receipt rolls back NFT ownership, version and listing validity',async()=>{
  await listed();const version=await nft.ownershipVersion(0);
  await assert.rejects(nft.connect(alice)['safeTransferFrom(address,address,uint256)'](alice.address,await market.getAddress(),0));
  assert.equal(await nft.ownerOf(0),alice.address);assert.equal(await nft.ownershipVersion(0),version);
  assert.equal((await market.getListing(0)).price,eth('0.02'));
});
test('classroom: raising your own bid escrows the full new amount and credits the old amount',async()=>{
  await mint();await market.connect(bob).placeBid(0,{value:eth('0.01')});await market.connect(bob).placeBid(0,{value:eth('0.02')});
  assert.equal(await market.pendingWithdrawals(bob.address),eth('0.01'));
  assert.equal((await market.bids(0)).amount,eth('0.02'));assert.equal(await ethers.provider.getBalance(await market.getAddress()),eth('0.03'));
  await market.connect(bob).withdraw();assert.equal(await ethers.provider.getBalance(await market.getAddress()),eth('0.02'));
});
test('classroom: self-bidding, nonexistent-token bidding and self-reserved listings are rejected',async()=>{
  await mint();await rejects(market.connect(alice).placeBid(0,{value:eth('0.01')}),'OwnToken');
  await assert.rejects(market.connect(bob).placeBid(999,{value:eth('0.01')}));
  await rejects(market.connect(alice).list(0,1n,alice.address),'OwnToken');
});
test('classroom: cancelling a listing preserves its active bid and escrow',async()=>{
  await listed();await market.connect(bob).placeBid(0,{value:eth('0.01')});await market.connect(alice).cancelListing(0);
  assert.equal((await market.getListing(0)).seller,ethers.ZeroAddress);assert.equal((await market.bids(0)).bidder,bob.address);
  assert.equal(await ethers.provider.getBalance(await market.getAddress()),eth('0.01'));assert.equal(await nft.ownerOf(0),alice.address);
});
test('classroom: a rejected NFT receiver rolls back bid acceptance and all seller credits',async()=>{
  await listed();const probe=await ethers.deployContract('WithdrawalProbe',[await market.getAddress()]);
  await probe.bid(0,{value:eth('0.01')});await assert.rejects(market.connect(alice).acceptBid(0,eth('0.01')));
  assert.equal(await nft.ownerOf(0),alice.address);assert.equal((await market.bids(0)).bidder,await probe.getAddress());
  assert.equal((await market.getListing(0)).price,eth('0.02'));assert.equal(await market.pendingWithdrawals(alice.address),0n);
  assert.equal(await ethers.provider.getBalance(await market.getAddress()),eth('0.01'));
});
test('classroom: mint proceeds and marketplace sale proceeds remain separate balances',async()=>{
  await listed();await market.connect(bob).buy(0,eth('0.02'),{value:eth('0.02')});
  assert.equal(await nft.mintProceeds(),eth('0.005'));assert.equal(await market.pendingWithdrawals(alice.address),eth('0.02'));
  await nft.withdrawMintProceeds();assert.equal(await ethers.provider.getBalance(await nft.getAddress()),0n);
  assert.equal(await ethers.provider.getBalance(await market.getAddress()),eth('0.02'));await market.connect(alice).withdraw();
  assert.equal(await ethers.provider.getBalance(await market.getAddress()),0n);
});
test('classroom: bid acceptance enforces ownership, approval and bid existence before settlement',async()=>{
  await mint();await rejects(market.connect(bob).acceptBid(0,0),'NotOwner');await rejects(market.connect(alice).acceptBid(0,0),'NotApproved');
  await nft.connect(alice).approve(await market.getAddress(),0);await rejects(market.connect(alice).acceptBid(0,0),'NoBid');
  await market.connect(bob).placeBid(0,{value:eth('0.01')});await nft.connect(alice).approve(ethers.ZeroAddress,0);
  await rejects(market.connect(alice).acceptBid(0,0),'NotApproved');assert.equal((await market.bids(0)).amount,eth('0.01'));
});
