import { reactive } from 'vue';
import { BrowserProvider, JsonRpcProvider, Contract, Interface, parseEther, ZeroAddress, isAddress } from 'ethers';
import { api } from './api.js';
import { parseDemoAccountIndex } from '../../shared/demo-accounts.js';

export const wallet=reactive({address:'',balance:'0',pending:'0',minted:0,owned:[],bids:[],mode:'',chainId:0,loading:false});
let provider,signer,config;
const sessionKey=()=>`netpunks-wallet-${config?.chainId || 31337}`;
export function configureWallet(value){config=value;}
export const canUseDemo=()=>config?.chainId===31337 && ['127.0.0.1','localhost'].includes(location.hostname);
export async function refreshWallet(){
  if(!wallet.address)return;
  Object.assign(wallet,await api(`/wallet/${wallet.address}`));
}
export async function connectDemo(index=14){
  if(!canUseDemo())throw new Error('体验账户只允许在本地 Hardhat 网络使用');
  index=parseDemoAccountIndex(index);
  if(index===null)throw new Error('请选择有效的本地体验账户');
  provider?.destroy?.();
  provider=new JsonRpcProvider(config.rpcUrl,undefined,{cacheTimeout:-1});
  const chain=await provider.getNetwork();
  if(chain.chainId!==31337n)throw new Error('体验账户网络不正确');
  signer=await provider.getSigner(index);
  Object.assign(wallet,{address:await signer.getAddress(),mode:`demo-${index}`,chainId:31337});
  sessionStorage.setItem(sessionKey(),String(index));
  await refreshWallet();
}
export async function connectInjected(){
  if(!window.ethereum)throw new Error(canUseDemo()?'未检测到钱包插件，请安装 MetaMask，或选择本地体验账户':'未检测到钱包插件，请安装 MetaMask 或兼容钱包');
  await window.ethereum.request({method:'eth_requestAccounts'});
  await switchNetwork();
  provider=new BrowserProvider(window.ethereum);
  signer=await provider.getSigner();
  Object.assign(wallet,{address:await signer.getAddress(),mode:'injected',chainId:Number((await provider.getNetwork()).chainId)});
  sessionStorage.setItem(sessionKey(),'injected');
  await refreshWallet();
}
export async function switchNetwork(){
  const chainId=`0x${config.chainId.toString(16)}`;
  try{await window.ethereum.request({method:'wallet_switchEthereumChain',params:[{chainId}]});}
  catch(error){
    if(error.code!==4902)throw error;
    await window.ethereum.request({method:'wallet_addEthereumChain',params:[{chainId,chainName:config.chainName,nativeCurrency:{name:'Ether',symbol:'ETH',decimals:18},rpcUrls:[config.rpcUrl],...(config.explorerUrl?{blockExplorerUrls:[config.explorerUrl]}:{})}]});
  }
}
export function disconnectWallet(){
  provider?.destroy?.();provider=null;signer=null;
  Object.assign(wallet,{address:'',balance:'0',pending:'0',minted:0,owned:[],bids:[],mode:'',chainId:0});
  sessionStorage.removeItem(sessionKey());sessionStorage.removeItem('netpunks-wallet');
}
export async function restoreWallet(){
  const saved=sessionStorage.getItem(sessionKey()) || (config.chainId===31337?sessionStorage.getItem('netpunks-wallet'):null);
  if(canUseDemo() && parseDemoAccountIndex(saved)!==null)await connectDemo(parseDemoAccountIndex(saved));
  else if(saved==='injected' && window.ethereum){
    const accounts=await window.ethereum.request({method:'eth_accounts'});
    const chainId=Number(await window.ethereum.request({method:'eth_chainId'}));
    if(accounts.length && chainId===config.chainId){
      provider=new BrowserProvider(window.ethereum);signer=await provider.getSigner();
      Object.assign(wallet,{address:await signer.getAddress(),mode:'injected',chainId});await refreshWallet();
    }
  }
}
export async function execute(action,{id,price,quantity,to,onlyBuyer}={},onStatus=()=>{}){
  if(!signer)throw new Error('请先连接钱包');
  if(wallet.mode==='injected'){
    const current=Number(await window.ethereum.request({method:'eth_chainId'}));
    if(current!==config.chainId)throw new Error('钱包网络已变化，请重新连接当前网站网络');
  }
  const nft=new Contract(config.collection,config.collectionAbi,signer);
  const market=new Contract(config.market,config.marketAbi,signer);
  const send=async(txPromise)=>{onStatus('请在钱包中确认');const tx=await txPromise;onStatus('交易已提交，等待链上确认');return tx.wait();};
  const approve=async()=>{
    const allowed=await nft.isApprovedForAll(wallet.address,config.market);
    const tokenApproved=allowed ? true : (await nft.getApproved(id)).toLowerCase()===config.market.toLowerCase();
    if(!tokenApproved){onStatus('先授权这一枚 NFT');await send(nft.approve(config.market,id));}
  };
  if(action==='mint')return send(nft.mint(quantity,{value:BigInt(config.mintPrice)*BigInt(quantity)}));
  if(action==='list'){
    if(onlyBuyer && !isAddress(onlyBuyer))throw new Error('请输入有效的买家地址');
    const value=parseEther(price);if(value<=0n)throw new Error('价格必须大于 0');
    await approve();return send(market.list(id,value,onlyBuyer || ZeroAddress));
  }
  if(action==='buy')return send(market.buy(id,BigInt(price),{value:BigInt(price)}));
  if(action==='bid'){
    const value=parseEther(price);if(value<=0n)throw new Error('出价必须大于 0');
    return send(market.placeBid(id,{value}));
  }
  if(action==='accept'){await approve();return send(market.acceptBid(id,BigInt(price)));}
  if(action==='cancel')return send(market.cancelListing(id));
  if(action==='withdrawBid')return send(market.withdrawBid(id));
  if(action==='withdraw')return send(market.withdraw());
  if(action==='transfer'){
    if(!isAddress(to)||to===ZeroAddress)throw new Error('请输入有效的接收地址');
    return send(nft['safeTransferFrom(address,address,uint256)'](wallet.address,to,id));
  }
  if(action==='settings')return send(nft.setMintSettings(quantity,parseEther(price)));
  if(action==='mintWithdraw')return send(nft.withdrawMintProceeds());
  throw new Error('操作不存在');
}
const messages={
  SaleClosed:'铸造尚未开放',WalletLimit:'已达到每地址 5 枚的铸造上限',SoldOut:'系列已售罄',InvalidQuantity:'请选择 1 至 5 枚',
  IncorrectPayment:'铸造价格已变化，请刷新后重试',NotForSale:'挂单已失效，请刷新',PriceChanged:'售价已变化，请刷新后确认',
  NotAllowedBuyer:'这是指定买家的挂单',OwnToken:'不能交易自己持有的 NFT',BidTooLow:'出价需要高于当前出价，或原出价已变化',
  NotOwner:'你已不是这枚 NFT 的持有者',NotBidder:'这笔出价已被替代或撤回',NoBid:'当前没有有效出价',NothingToWithdraw:'当前没有可提取余额',
  NotApproved:'授权状态已变化，请重新授权后重试',InvalidPrice:'价格必须大于 0',ERC721NonexistentToken:'这枚 NFT 尚未铸造或不存在',ERC721InvalidReceiver:'接收地址无法接收这枚 NFT',
};
export function explainError(error){
  if(error.code===4001||error.code==='ACTION_REJECTED')return '你已取消钱包确认';
  if(error.code==='INSUFFICIENT_FUNDS')return config?.chainId===11155111?'钱包余额不足，请准备 Sepolia 测试 ETH':'钱包余额不足，请使用本地测试 ETH';
  const data=error.data || error.info?.error?.data;
  if(typeof data==='string' && config)for(const abi of [config.collectionAbi,config.marketAbi])try{
    const name=new Interface(abi).parseError(data)?.name;
    if(messages[name])return messages[name];
  }catch{}
  const text=error.info?.error?.message || error.shortMessage || error.message || '操作失败，请重试';
  for(const [key,value]of Object.entries(messages))if(text.includes(key))return value;
  return text.length>180 ? '交易未完成，请刷新状态后重试' : text;
}
