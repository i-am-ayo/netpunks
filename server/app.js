import express from 'express';
import path from 'node:path';
import { isAddress,parseEther } from 'ethers';
import { root } from '../shared/paths.js';
import { publicDeployment } from '../shared/network.js';
import { imageSvg, metadataFor, MAX_SUPPLY, traitCounts } from '../shared/art.js';

export function createApp(indexer) {
  const app=express();
  app.disable('x-powered-by');
  app.use((req,res,next)=>{res.set('X-Content-Type-Options','nosniff');next();});
  const validId=value=>/^\d+$/.test(value) && Number(value)<MAX_SUPPLY;
  const syncError=error=>indexer.config.chainId===31337 ? error.message : 'Sepolia 数据同步暂时不可用，请稍后重试';
  app.get('/api/health',async(req,res)=>{
    try {await indexer.sync();res.json({ok:true,chainId:indexer.config.chainId});}
    catch(error){res.status(503).json({ok:false,error:syncError(error)});}
  });
  app.get('/api/punks/:id/image.svg',(req,res)=>{
    if (!validId(req.params.id)) return res.status(404).json({error:'NFT 编号不存在'});
    res.type('image/svg+xml').set('Cache-Control','public, max-age=86400').send(imageSvg(req.params.id));
  });
  app.get('/api/metadata/:id',(req,res)=>{
    if (!validId(req.params.id)) return res.status(404).json({error:'NFT 编号不存在'});
    const imageBase=process.env.PUBLIC_BASE_URL ? new URL('/api/punks/',process.env.PUBLIC_BASE_URL).href :
      process.env.METADATA_BASE_URL ? new URL('../punks/',process.env.METADATA_BASE_URL).href : `http://127.0.0.1:${process.env.PORT || 3001}/api/punks/`;
    res.json(metadataFor(Number(req.params.id), imageBase));
  });
  app.use('/api',async(req,res,next)=>{
    try {if(req.query.fresh==='1')indexer.invalidate();await indexer.sync();next();}
    catch(error) {res.status(503).json({error:syncError(error)});}
  });
  app.get('/api/config',(req,res)=>res.json({...publicDeployment(indexer.config),...indexer.settings,maxSupply:MAX_SUPPLY,walletLimit:5,traitCounts}));
  app.get('/api/stats',(req,res)=>res.json(indexer.stats()));
  app.get('/api/punks',(req,res)=>{
    let tokens=indexer.allTokens();
    const {q,type,hair,eyes,status,owner,bidder,sort,ids,minPrice,maxPrice} = req.query;
    if(ids){const selected=new Set(String(ids).split(',').filter(id=>/^\d+$/.test(id)).map(Number));tokens=tokens.filter(t=>selected.has(t.id));}
    try {
      if(minPrice){const min=parseEther(String(minPrice));if(min<0n)throw Error();tokens=tokens.filter(t=>t.price!=='0'&&BigInt(t.price)>=min);}
      if(maxPrice){const max=parseEther(String(maxPrice));if(max<0n)throw Error();tokens=tokens.filter(t=>t.price!=='0'&&BigInt(t.price)<=max);}
    }catch{return res.status(400).json({error:'请输入有效的 ETH 价格，最多 18 位小数'});}
    if (q) {const search=String(q).replace('#','').trim().toLowerCase();tokens=tokens.filter(t=>String(t.id).includes(search) || t.traits.type.toLowerCase().includes(search));}
    for (const [key,value] of Object.entries({type,hair,eyes})) if (value) tokens=tokens.filter(t=>t.traits[key]===value);
    if (owner) {if(!isAddress(owner)) return res.status(400).json({error:'无效的钱包地址'});tokens=tokens.filter(t=>t.owner.toLowerCase()===owner.toLowerCase());}
    if (bidder) {if(!isAddress(bidder)) return res.status(400).json({error:'无效的钱包地址'});tokens=tokens.filter(t=>t.bidder.toLowerCase()===bidder.toLowerCase());}
    if (status==='listed') tokens=tokens.filter(t=>t.price!=='0');
    if (status==='bids') tokens=tokens.filter(t=>t.bid!=='0');
    if (sort==='price-asc' || sort==='price-desc') tokens.sort((a,b)=>{
      if(a.price==='0')return b.price==='0'?a.id-b.id:1;if(b.price==='0')return -1;
      const cmp=BigInt(a.price)<BigInt(b.price)?-1:BigInt(a.price)>BigInt(b.price)?1:0;return sort==='price-desc'?-cmp:cmp;
    });
    if (sort==='newest') tokens.sort((a,b)=>b.id-a.id);
    const total=tokens.length;
    const page=Math.max(1,Math.min(10000,Number(req.query.page)||1));
    const limit=Math.max(1,Math.min(100,Number(req.query.limit)||20));
    res.json({items:tokens.slice((page-1)*limit,page*limit),total,page,limit});
  });
  app.get('/api/punks/:id',(req,res)=>{
    if (!validId(req.params.id)) return res.status(404).json({error:'NFT 编号不存在'});
    const token=indexer.allTokens().find(t=>t.id===Number(req.params.id));
    if (!token) return res.status(404).json({error:'这个 NFT 还未铸造'});
    res.json({...token,events:indexer.events({tokenId:token.id,limit:30})});
  });
  app.get('/api/activity',(req,res)=>res.json(indexer.events({kind:req.query.kind,limit:100})));
  app.get('/api/wallet/:address',async(req,res,next)=>{
    try {
      const address=req.params.address;
      if(!isAddress(address))return res.status(400).json({error:'无效的钱包地址'});
      const [balance,pending,minted] = await Promise.all([indexer.provider.getBalance(address),indexer.market.pendingWithdrawals(address),indexer.nft.mintedPerWallet(address)]);
      const tokens=indexer.allTokens();
      res.json({balance:String(balance),pending:String(pending),minted:Number(minted),owned:tokens.filter(t=>t.owner.toLowerCase()===address.toLowerCase()),bids:tokens.filter(t=>t.bidder.toLowerCase()===address.toLowerCase())});
    } catch(error){next(error);}
  });
  app.use('/api',(req,res)=>res.status(404).json({error:'接口不存在'}));
  if (process.env.NODE_ENV==='production') {
    app.use('/docs/uml',express.static(path.join(root,'docs/uml')));
    app.use(express.static(path.join(root,'dist')));
    app.get('/{*path}',(req,res)=>res.sendFile(path.join(root,'dist/index.html')));
  }
  app.use((error,req,res,next)=>{console.error('API request failed.');res.status(500).json({error:'服务暂时不可用，请稍后重试'});});
  return app;
}
