import { DatabaseSync } from 'node:sqlite';
import { readFile, mkdir } from 'node:fs/promises';
import { Contract, JsonRpcProvider, ZeroAddress } from 'ethers';
import { networkPaths, SEPOLIA } from '../shared/network.js';
import { traitsFor } from '../shared/art.js';

export async function createIndexer(options={}) {
  const paths = networkPaths(options.network);
  await mkdir(paths.directory, { recursive: true });
  let config=options.config;
  try { if(!config)config = JSON.parse(await readFile(paths.deployment,'utf8')); }
  catch { throw new Error(paths.network === 'sepolia' ? 'No Sepolia deployment found. Follow docs/SEPOLIA.md and run npm run deploy:sepolia.' : 'No deployment found. Run npm run dev, or start the chain and run npm run deploy:local.'); }
  if (!options.config && config.chainId !== (paths.network === 'sepolia' ? SEPOLIA.chainId : 31337)) throw new Error('Deployment record does not match APP_NETWORK.');
  const rpcUrl = config.chainId === SEPOLIA.chainId ? process.env.SEPOLIA_RPC_URL : process.env.RPC_URL || config.rpcUrl;
  if (!options.provider && !rpcUrl) throw new Error('Set SEPOLIA_RPC_URL in .env.sepolia before starting the API.');
  const provider = options.provider || new JsonRpcProvider(rpcUrl, undefined, { cacheTimeout: -1, batchMaxCount: 1 });
  const nft = new Contract(config.collection,config.collectionAbi,provider);
  const market = new Contract(config.market,config.marketAbi,provider);
  const logBlockRange = Number(options.logBlockRange || process.env.RPC_LOG_BLOCK_RANGE || (config.chainId === SEPOLIA.chainId ? 100 : 2000));
  if (!Number.isInteger(logBlockRange) || logBlockRange < 1 || logBlockRange > 2000) throw new Error('RPC_LOG_BLOCK_RANGE must be an integer from 1 to 2000.');
  const db = new DatabaseSync(options.databasePath || paths.database);
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT);
    CREATE TABLE IF NOT EXISTS tokens(id INTEGER PRIMARY KEY,owner TEXT,seller TEXT,price TEXT,onlyBuyer TEXT,bidder TEXT,bid TEXT);
    CREATE TABLE IF NOT EXISTS events(key TEXT PRIMARY KEY,kind TEXT,tokenId INTEGER,actor TEXT,other TEXT,amount TEXT,hash TEXT,block INTEGER,logIndex INTEGER,timestamp INTEGER);
  `);
  const getMeta = key => db.prepare('SELECT value FROM meta WHERE key=?').get(key)?.value;
  const setMeta = (key,value) => db.prepare('INSERT OR REPLACE INTO meta VALUES(?,?)').run(key,String(value));
  const reset = () => { db.exec('DELETE FROM tokens; DELETE FROM events; DELETE FROM meta;'); setMeta('instanceId',config.instanceId); };
  if (getMeta('instanceId') !== config.instanceId) reset();
  let inFlight, lastSync=0, settings;
  const eventNames = { Listed:'listed',ListingCancelled:'cancelled',Purchased:'sale',BidPlaced:'bid',BidWithdrawn:'bid-withdrawn',BidAccepted:'sale',Withdrawn:'withdrawal' };

  async function sync() {
    if (inFlight) return inFlight;
    if (Date.now()-lastSync < 1800 && settings) return;
    inFlight = (async () => {
      const [network, anchor, latest] = await Promise.all([provider.getNetwork(),provider.getBlock(config.blockNumber),provider.getBlockNumber()]);
      if (Number(network.chainId) !== config.chainId || anchor?.hash !== config.blockHash) throw new Error(config.chainId === 31337 ? 'Local chain has changed. Restart npm run dev to deploy and reseed.' : 'Sepolia RPC or deployment anchor does not match. Check the configured network and deployment record.');
      let cursor = Number(getMeta('cursor') || config.blockNumber-1);
      if (cursor >= config.blockNumber) {
        const previous = await provider.getBlock(cursor);
        if (previous?.hash !== getMeta('cursorHash')) { reset(); cursor=config.blockNumber-1; }
      }
      if (latest > cursor) {
        const touched = new Set();
        const approvals = new Set();
        const staged = [];
        const blockTimes = new Map();
        for (let start=cursor+1;start<=latest;start+=logBlockRange) {
          const logs = await provider.getLogs({ address:[config.collection,config.market],fromBlock:start,toBlock:Math.min(start+logBlockRange-1,latest) });
          const settledTransfers=new Set();
          for(const log of logs)if(log.address.toLowerCase()===config.market.toLowerCase()){
            const parsed=market.interface.parseLog(log);
            if(['Purchased','BidAccepted'].includes(parsed?.name))settledTransfers.add(`${log.transactionHash}:${parsed.args.tokenId}`);
          }
          for (const log of logs) {
            const isNft = log.address.toLowerCase() === config.collection.toLowerCase();
            const parsed = (isNft ? nft.interface : market.interface).parseLog(log);
            if (!parsed) continue;
            const a = parsed.args;
            if (a.tokenId !== undefined) touched.add(Number(a.tokenId));
            if (isNft && parsed.name === 'ApprovalForAll') approvals.add(a.owner.toLowerCase());
            let kind, actor='',other='',amount='0',tokenId=null;
            if (isNft && parsed.name === 'Transfer') {
              if(a.from===ZeroAddress || settledTransfers.has(`${log.transactionHash}:${a.tokenId}`))continue;
              kind = 'transfer'; actor=a.from;other=a.to;tokenId=Number(a.tokenId);
            } else if (isNft && parsed.name === 'Minted') {
              kind='mint';actor=a.minter;other=a.minter;tokenId=Number(a.tokenId);amount=String(a.price);
            } else if (!isNft && eventNames[parsed.name]) {
              kind=eventNames[parsed.name]; tokenId=a.tokenId !== undefined ? Number(a.tokenId) : null;
              actor=a.seller || a.bidder || a.account || ''; other=a.buyer || a.onlyBuyer || '';
              amount=String(a.price ?? a.amount ?? 0n);
            }
            if (!kind) continue;
            if (!blockTimes.has(log.blockNumber)) blockTimes.set(log.blockNumber,(await provider.getBlock(log.blockNumber)).timestamp);
            staged.push([`${log.transactionHash}:${log.index}`,kind,tokenId,actor,other,amount,log.transactionHash,log.blockNumber,log.index,blockTimes.get(log.blockNumber)]);
          }
        }
        for (const owner of approvals) for (const row of db.prepare('SELECT id FROM tokens WHERE lower(owner)=?').all(owner)) touched.add(row.id);
        const ids = [...touched];
        const updates=[];
        for (let i=0;i<ids.length;i+=20) {
          updates.push(...await Promise.all(ids.slice(i,i+20).map(async id => {
            const [owner,listing,bid] = await Promise.all([nft.ownerOf(id,{blockTag:latest}),market.getListing(id,{blockTag:latest}),market.bids(id,{blockTag:latest})]);
            return [id,owner,listing.seller,String(listing.price),listing.onlyBuyer,bid.bidder,String(bid.amount)];
          })));
        }
        const tip = await provider.getBlock(latest);
        db.exec('BEGIN');
        try {
          const insertEvent=db.prepare('INSERT OR IGNORE INTO events VALUES(?,?,?,?,?,?,?,?,?,?)');
          for (const row of staged) insertEvent.run(...row);
          const insertToken=db.prepare('INSERT OR REPLACE INTO tokens VALUES(?,?,?,?,?,?,?)');
          for (const row of updates) insertToken.run(...row);
          setMeta('cursor',latest);setMeta('cursorHash',tip.hash);db.exec('COMMIT');
        } catch(error) {db.exec('ROLLBACK');throw error;}
      }
      const [mintPrice,mintOpen,totalMinted,admin,mintProceeds] = await Promise.all([nft.mintPrice({blockTag:latest}),nft.mintOpen({blockTag:latest}),nft.totalMinted({blockTag:latest}),nft.owner({blockTag:latest}),nft.mintProceeds({blockTag:latest})]);
      settings={mintPrice:String(mintPrice),mintOpen,totalMinted:Number(totalMinted),admin,mintProceeds:String(mintProceeds)};
      lastSync=Date.now();
    })().finally(() => {inFlight=null;});
    return inFlight;
  }
  const allTokens = () => db.prepare('SELECT * FROM tokens ORDER BY id').all().map(row=>({...row,traits:traitsFor(row.id)}));
  function events({tokenId,kind,limit=50}={}) {
    const clauses=[],values=[];
    if (tokenId !== undefined) {clauses.push('tokenId=?');values.push(tokenId);}
    if (kind && kind !== 'all') {clauses.push('kind=?');values.push(kind);}
    return db.prepare(`SELECT * FROM events ${clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''} ORDER BY block DESC,logIndex DESC LIMIT ?`).all(...values,limit);
  }
  function stats() {
    const tokens=allTokens();
    const listings=tokens.filter(t=>t.price!=='0' && t.onlyBuyer===ZeroAddress);
    const sales=db.prepare("SELECT amount,timestamp FROM events WHERE kind='sale'").all();
    const sum=rows=>String(rows.reduce((total,row)=>total+BigInt(row.amount),0n));
    const floor=listings.reduce((min,t)=>min===0n || BigInt(t.price)<min ? BigInt(t.price) : min,0n);
    return {totalMinted:settings.totalMinted,totalSupply:10000,listed:listings.length,holders:new Set(tokens.map(t=>t.owner.toLowerCase())).size,floor:String(floor),volume:sum(sales),sales:sales.length,volume24h:sum(sales.filter(s=>s.timestamp>Date.now()/1000-86400))};
  }
  return {
    config,provider,nft,market,sync,allTokens,events,stats,
    get settings() {return settings;},
    invalidate() { lastSync=0; },
    close() {db.close();if(!options.provider)provider.destroy();},
  };
}
