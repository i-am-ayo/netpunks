import { before,beforeEach,after,test } from 'node:test';
import assert from 'node:assert/strict';
import hre from 'hardhat';

let connection,ethers,nft,market,owner,alice,bob,carol;
const paid=quantity=>({value:ethers.parseEther('0.005')*BigInt(quantity)});
before(async()=>{connection=await hre.network.connect('hardhat');ethers=connection.ethers;[owner,alice,bob,carol]=await ethers.getSigners();});
beforeEach(async()=>{
  nft=await ethers.deployContract('NetPunks',['http://localhost:3001/api/metadata/']);
  market=await ethers.deployContract('NetPunksMarket',[await nft.getAddress()]);
  await nft.waitForDeployment();await market.waitForDeployment();
});
after(async()=>{await connection.close();});
async function mintAndList(price='0.02',buyer=ethers.ZeroAddress){
  await nft.connect(alice).mint(1,paid(1));
  await nft.connect(alice).approve(await market.getAddress(),0);
  await market.connect(alice).list(0,ethers.parseEther(price),buyer);
}
async function rejects(promise,name){
  await assert.rejects(promise,error=>{
    const data=error.data || error.info?.error?.data;
    if(typeof data==='string')for(const contract of [nft,market])try{if(contract.interface.parseError(data)?.name===name)return true;}catch{}
    return String(error).includes(name);
  },`Expected ${name}`);
}

test('ERC-721 mint reserves consecutive IDs, proceeds, and permanent wallet quota',async()=>{
  await nft.connect(alice).mint(3,paid(3));
  assert.equal(await nft.ownerOf(2),alice.address);
  assert.equal(await nft.totalMinted(),3n);
  assert.equal(await nft.mintProceeds(),ethers.parseEther('0.015'));
  assert.equal(await nft.mintedPerWallet(alice.address),3n);
  assert.equal(await nft.tokenURI(2),'http://localhost:3001/api/metadata/2');
  assert.equal(await nft.supportsInterface('0x80ac58cd'),true);
  await nft.connect(alice).transferFrom(alice.address,bob.address,0);
  assert.equal(await nft.mintedPerWallet(alice.address),3n);
});
test('mint rejects incorrect payment, invalid quantities and per-wallet overflow',async()=>{
  await rejects(nft.connect(alice).mint(1,{value:1n}),'IncorrectPayment');
  await rejects(nft.connect(alice).mint(0),'InvalidQuantity');
  await rejects(nft.connect(alice).mint(6,paid(6)),'InvalidQuantity');
  await nft.connect(alice).mint(5,paid(5));
  await rejects(nft.connect(alice).mint(1,paid(1)),'WalletLimit');
});
test('only the owner can configure minting; paused mint is rejected',async()=>{
  await assert.rejects(nft.connect(alice).setMintSettings(false,0));
  await nft.setMintSettings(false,0);
  await rejects(nft.connect(alice).mint(1),'SaleClosed');
  await nft.setMintSettings(true,0);
  await nft.connect(alice).mint(1);
  assert.equal(await nft.totalMinted(),1n);
  assert.equal(await nft.MAX_SUPPLY(),10000n);
});
test('only the owner can withdraw primary mint proceeds, once',async()=>{
  await nft.connect(alice).mint(2,paid(2));
  await assert.rejects(nft.connect(bob).withdrawMintProceeds());
  await nft.withdrawMintProceeds();
  assert.equal(await nft.mintProceeds(),0n);
  assert.equal(await ethers.provider.getBalance(await nft.getAddress()),0n);
  await rejects(nft.withdrawMintProceeds(),'NothingToWithdraw');
});
test('listings require ownership, positive price, and explicit token authorization',async()=>{
  await nft.connect(alice).mint(1,paid(1));
  await rejects(market.connect(bob).list(0,1n,ethers.ZeroAddress),'NotOwner');
  await rejects(market.connect(alice).list(0,0n,ethers.ZeroAddress),'InvalidPrice');
  await rejects(market.connect(alice).list(0,1n,ethers.ZeroAddress),'NotApproved');
  await nft.connect(alice).approve(await market.getAddress(),0);
  await market.connect(alice).list(0,1n,ethers.ZeroAddress);
  await market.connect(alice).cancelListing(0);
  assert.equal((await market.getListing(0)).price,0n);
});
test('buy atomically transfers NFT and credits seller without paying a marketplace fee',async()=>{
  await mintAndList();const price=ethers.parseEther('0.02');
  await market.connect(bob).buy(0,price,{value:price});
  assert.equal(await nft.ownerOf(0),bob.address);
  assert.equal(await market.pendingWithdrawals(alice.address),price);
  assert.equal((await market.getListing(0)).price,0n);
  await market.connect(alice).withdraw();
  assert.equal(await market.pendingWithdrawals(alice.address),0n);
  assert.equal(await ethers.provider.getBalance(await market.getAddress()),0n);
});
test('a changed sale price cannot be accepted with the old quoted amount',async()=>{
  await mintAndList();
  await market.connect(alice).list(0,ethers.parseEther('0.03'),ethers.ZeroAddress);
  await rejects(market.connect(bob).buy(0,ethers.parseEther('0.02'),{value:ethers.parseEther('0.02')}),'PriceChanged');
  assert.equal(await nft.ownerOf(0),alice.address);
});
test('private listings only settle for the designated buyer',async()=>{
  await mintAndList('0.02',bob.address);const price=ethers.parseEther('0.02');
  await rejects(market.connect(carol).buy(0,price,{value:price}),'NotAllowedBuyer');
  await market.connect(bob).buy(0,price,{value:price});
  assert.equal(await nft.ownerOf(0),bob.address);
});
test('a transfer away and back never reactivates an earlier listing',async()=>{
  await mintAndList();
  await nft.connect(alice).transferFrom(alice.address,bob.address,0);
  await nft.connect(bob).transferFrom(bob.address,alice.address,0);
  await nft.connect(alice).approve(await market.getAddress(),0);
  assert.equal((await market.getListing(0)).price,0n);
  await rejects(market.connect(bob).buy(0,ethers.parseEther('0.02'),{value:ethers.parseEther('0.02')}),'NotForSale');
});
test('revoked approval disables settlement even if a listing remains indexed',async()=>{
  await mintAndList();await nft.connect(alice).approve(ethers.ZeroAddress,0);
  assert.equal((await market.getListing(0)).seller,ethers.ZeroAddress);
  await rejects(market.connect(bob).buy(0,ethers.parseEther('0.02'),{value:ethers.parseEther('0.02')}),'NotForSale');
});
test('revoking and regranting token or operator approval cannot revive stale listings',async()=>{
  await mintAndList();
  await nft.connect(alice).approve(ethers.ZeroAddress,0);
  await nft.connect(alice).approve(await market.getAddress(),0);
  assert.equal((await market.getListing(0)).price,0n);
  await nft.connect(alice).setApprovalForAll(await market.getAddress(),true);
  await market.connect(alice).list(0,1n,ethers.ZeroAddress);
  await nft.connect(alice).setApprovalForAll(await market.getAddress(),false);
  await nft.connect(alice).setApprovalForAll(await market.getAddress(),true);
  assert.equal((await market.getListing(0)).price,0n);
});
test('outbidding preserves the old bidder refund and fully escrows the new bid',async()=>{
  await nft.connect(alice).mint(1,paid(1));
  await market.connect(bob).placeBid(0,{value:ethers.parseEther('0.01')});
  await rejects(market.connect(carol).placeBid(0,{value:ethers.parseEther('0.01')}),'BidTooLow');
  await market.connect(carol).placeBid(0,{value:ethers.parseEther('0.02')});
  assert.equal((await market.bids(0)).bidder,carol.address);
  assert.equal(await market.pendingWithdrawals(bob.address),ethers.parseEther('0.01'));
  assert.equal(await ethers.provider.getBalance(await market.getAddress()),ethers.parseEther('0.03'));
});
test('a withdrawn bid can only be refunded once',async()=>{
  await nft.connect(alice).mint(1,paid(1));
  await market.connect(bob).placeBid(0,{value:ethers.parseEther('0.01')});
  await rejects(market.connect(carol).withdrawBid(0),'NotBidder');
  await market.connect(bob).withdrawBid(0);
  await rejects(market.connect(bob).withdrawBid(0),'NotBidder');
  await market.connect(bob).withdraw();
  assert.equal(await market.pendingWithdrawals(bob.address),0n);
  await rejects(market.connect(bob).withdraw(),'NothingToWithdraw');
});
test('accepting a bid protects the minimum price and clears any listing',async()=>{
  await mintAndList();const amount=ethers.parseEther('0.01');
  await market.connect(bob).placeBid(0,{value:amount});
  await rejects(market.connect(alice).acceptBid(0,amount+1n),'BidTooLow');
  await market.connect(alice).acceptBid(0,amount);
  assert.equal(await nft.ownerOf(0),bob.address);
  assert.equal((await market.bids(0)).amount,0n);
  assert.equal((await market.getListing(0)).price,0n);
  assert.equal(await market.pendingWithdrawals(alice.address),amount);
});
test('a fixed-price sale refunds the active bid without losing or double spending escrow',async()=>{
  await mintAndList();const bid=ethers.parseEther('0.01'),price=ethers.parseEther('0.02');
  await market.connect(carol).placeBid(0,{value:bid});
  await market.connect(bob).buy(0,price,{value:price});
  assert.equal((await market.bids(0)).amount,0n);
  assert.equal(await market.pendingWithdrawals(carol.address),bid);
  assert.equal(await market.pendingWithdrawals(alice.address),price);
  await market.connect(alice).withdraw();await market.connect(carol).withdraw();
  assert.equal(await ethers.provider.getBalance(await market.getAddress()),0n);
});
test('a malicious refund recipient cannot reenter withdraw',async()=>{
  await nft.connect(alice).mint(1,paid(1));
  const probe=await ethers.deployContract('WithdrawalProbe',[await market.getAddress()]);
  await probe.bid(0,{value:ethers.parseEther('0.01')});
  await market.connect(bob).placeBid(0,{value:ethers.parseEther('0.02')});
  await probe.withdraw();
  assert.equal(await probe.reentrySucceeded(),false);
  assert.equal(await ethers.provider.getBalance(await probe.getAddress()),ethers.parseEther('0.01'));
  assert.equal(await ethers.provider.getBalance(await market.getAddress()),ethers.parseEther('0.02'));
});
