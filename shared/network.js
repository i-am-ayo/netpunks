import path from 'node:path';
import { runtime } from './paths.js';

export const SEPOLIA = Object.freeze({
  chainId: 11155111, chainName: 'Sepolia', testnet: true,
  rpcUrl: 'https://rpc.sepolia.org', explorerUrl: 'https://sepolia.etherscan.io',
});

export function networkPaths(network = process.env.APP_NETWORK || 'local') {
  if (!['local', 'sepolia'].includes(network)) throw new Error('APP_NETWORK must be local or sepolia.');
  const directory = network === 'local' ? runtime : path.join(runtime, network);
  return { network, directory, deployment: path.join(directory, 'deployment.json'), database: path.join(directory, 'index.sqlite') };
}

// Only these deployment fields may reach the browser. RPC credentials stay in the server environment.
export function publicDeployment(config) {
  const keys = ['instanceId','chainId','chainName','testnet','rpcUrl','explorerUrl','collection','market','blockNumber','blockHash','collectionAbi','marketAbi','metadataBaseUrl','createdAt','transactions'];
  return Object.fromEntries(keys.filter(key => config[key] !== undefined).map(key => [key, config[key]]));
}
