import { Contract, ContractFactory, Transaction, Wallet, HDNodeWallet, formatEther, getCreateAddress, keccak256 } from 'ethers';
import { randomUUID } from 'node:crypto';
import { SEPOLIA } from '../../shared/network.js';

export class DeploymentError extends Error {}
const requireValue = (ok, message) => { if (!ok) throw new DeploymentError(message); };

export function publicHttps(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    return url.protocol === 'https:' && !url.username && !url.password &&
      !/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|::1$|f[cd][0-9a-f]*:|fe80:)/.test(host) &&
      !host.endsWith('.localhost') && !host.endsWith('.local') && !host.includes('example.') && host !== 'example.com';
  } catch { return false; }
}

export function readSepoliaSettings(env) {
  const missing = ['SEPOLIA_RPC_URL','SEPOLIA_PRIVATE_KEY','SEPOLIA_METADATA_BASE_URL'].filter(key => !env[key]?.trim());
  requireValue(!missing.length, `Fill in .env.sepolia first. Missing: ${missing.join(', ')}. No transaction was sent.`);
  requireValue(publicHttps(env.SEPOLIA_RPC_URL), 'SEPOLIA_RPC_URL must be a public HTTPS Sepolia RPC endpoint.');
  const walletRpcUrl = env.SEPOLIA_WALLET_RPC_URL || SEPOLIA.rpcUrl;
  requireValue(publicHttps(walletRpcUrl), 'SEPOLIA_WALLET_RPC_URL must be a public HTTPS endpoint without credentials.');
  requireValue(/^0x[0-9a-fA-F]{64}$/.test(env.SEPOLIA_PRIVATE_KEY), 'SEPOLIA_PRIVATE_KEY must be 0x followed by 64 hex digits.');
  // Hardhat's public development mnemonic is unsafe on any public network.
  let address;
  try { address = new Wallet(env.SEPOLIA_PRIVATE_KEY).address; } catch { throw new DeploymentError('Invalid Sepolia private key.'); }
  const demoRoot = HDNodeWallet.fromPhrase('test test test test test test test test test test test junk', undefined, "m/44'/60'/0'/0");
  requireValue(!Array.from({ length: 20 }, (_, i) => demoRoot.deriveChild(i).address).includes(address), 'Do not use a public Hardhat demo private key on Sepolia. Create a new test-only wallet.');
  const metadataBaseUrl = env.SEPOLIA_METADATA_BASE_URL.trim();
  const httpsMetadata = publicHttps(metadataBaseUrl) && !new URL(metadataBaseUrl).search && !new URL(metadataBaseUrl).hash;
  requireValue(metadataBaseUrl.endsWith('/') && (httpsMetadata || /^ipfs:\/\/[a-zA-Z0-9]{20,}(\/[^?#]*)?\/$/.test(metadataBaseUrl)),
    'SEPOLIA_METADATA_BASE_URL must be a final public HTTPS URL or ipfs://directory-CID/ ending in /.');
  const confirmations = Number(env.SEPOLIA_CONFIRMATIONS || 2);
  requireValue(Number.isInteger(confirmations) && confirmations >= 1 && confirmations <= 20, 'SEPOLIA_CONFIRMATIONS must be an integer from 1 to 20.');
  return { rpcUrl: env.SEPOLIA_RPC_URL, privateKey: env.SEPOLIA_PRIVATE_KEY, address, walletRpcUrl, metadataBaseUrl, confirmations };
}

// Kept separate from CLI/filesystem so the same deployment path can be rehearsed on an isolated chain.
export async function deploySepolia({ provider, signer, artifacts, settings, store, deploy = false, resume = false, log = console.log }) {
  const network = await provider.getNetwork();
  requireValue(Number(network.chainId) === SEPOLIA.chainId, 'Wrong RPC network: expected Sepolia (11155111). No transaction was sent.');
  const deployer = await signer.getAddress();
  const completed = await store.read('deployment.json');
  if (completed) {
    requireValue(!deploy, 'A Sepolia deployment already exists. Use npm run dev:sepolia; automatic redeployment is disabled.');
    requireValue(await provider.getCode(completed.collection) !== '0x' && await provider.getCode(completed.market) !== '0x', 'Saved Sepolia deployment has missing contract code. Check the RPC and deployment record.');
    log(`Sepolia deployment already exists: ${completed.collection} / ${completed.market}`);
    return completed;
  }
  let pending = await store.read('pending.json');
  const fingerprints = Object.fromEntries(Object.entries(artifacts).map(([name, artifact]) => {
    requireValue(artifact.bytecode?.length > 2, `Missing ${name} bytecode. Run npm run compile.`);
    return [name, keccak256(artifact.bytecode)];
  }));
  if (pending) {
    requireValue(pending.deployer === deployer && pending.metadataBaseUrl === settings.metadataBaseUrl && pending.chainId === SEPOLIA.chainId &&
      JSON.stringify(pending.fingerprints) === JSON.stringify(fingerprints), 'Pending deployment does not match this wallet, metadata URI, or compiled contracts. Restore the original configuration before resuming.');
    requireValue(!deploy || resume, 'A pending deployment exists. Run npm run deploy:sepolia -- --resume to continue it.');
  }
  const nonce = pending?.nonce ?? await provider.getTransactionCount(deployer, 'pending');
  if (!pending) requireValue(nonce === await provider.getTransactionCount(deployer, 'latest'), 'This wallet has pending transactions. Wait for them before deploying.');
  const collection = getCreateAddress({ from: deployer, nonce });
  const market = getCreateAddress({ from: deployer, nonce: nonce + 1 });
  const factories = {
    collection: new ContractFactory(artifacts.collection.abi, artifacts.collection.bytecode, signer),
    market: new ContractFactory(artifacts.market.abi, artifacts.market.bytecode, signer),
  };
  const requests = {
    collection: await factories.collection.getDeployTransaction(settings.metadataBaseUrl),
    market: await factories.market.getDeployTransaction(collection),
  };
  const fees = await provider.getFeeData();
  const fee = fees.maxFeePerGas ?? fees.gasPrice;
  requireValue(fee > 0n, 'RPC returned no usable gas fee. Retry later.');
  const feeFields = fees.maxFeePerGas != null ? { type: 2, maxFeePerGas: fee, maxPriorityFeePerGas: fees.maxPriorityFeePerGas ?? 0n } : { type: 0, gasPrice: fee };
  const gas = {};
  let required = 0n;
  for (const name of ['collection', 'market']) {
    // A persisted signed transaction is recovered with its original nonce and fees.
    if (pending?.[name]) {
      if (!(await provider.getTransactionReceipt(pending[name].hash))) {
        const saved = Transaction.from(pending[name].raw);
        required += saved.gasLimit * (saved.maxFeePerGas ?? saved.gasPrice);
      }
      continue;
    }
    gas[name] = (await provider.estimateGas({ ...requests[name], from: deployer })) * 120n / 100n;
    required += gas[name] * fee;
  }
  const balance = await provider.getBalance(deployer);
  log(`Network: Sepolia (11155111)\nDeployer: ${deployer}\nBalance: ${formatEther(balance)} test ETH\nMetadata: ${settings.metadataBaseUrl}\nRemaining deployment fee cap (20% gas margin): ${formatEther(required)} test ETH`);
  requireValue(balance >= required, 'Insufficient Sepolia test ETH for the estimated deployment fee cap. Fund the displayed address, then check again.');
  if (!deploy) {
    log(pending ? 'Dry run passed. Use --resume to continue the saved deployment. No transaction was sent.' : 'Dry run passed. Two contracts will be deployed; no NFTs or sample trades will be created. No transaction was sent.');
    return { deployer, collection, market, required: String(required), dryRun: true };
  }
  if (!pending) {
    pending = { instanceId: randomUUID(), chainId: SEPOLIA.chainId, deployer, nonce, metadataBaseUrl: settings.metadataBaseUrl, fingerprints, createdAt: new Date().toISOString() };
    await store.write('pending.json', pending);
  }
  const receipts = {};
  for (const [index, name] of ['collection', 'market'].entries()) {
    if (!pending[name]) {
      requireValue(await provider.getTransactionCount(deployer, 'pending') === nonce + index, 'Wallet nonce changed. Stop other wallet transactions and check the pending deployment before resuming.');
      const raw = await signer.signTransaction({ ...requests[name], ...feeFields, gasLimit: gas[name], chainId: SEPOLIA.chainId, nonce: nonce + index });
      const hash = Transaction.from(raw).hash;
      pending[name] = { hash, raw, address: name === 'collection' ? collection : market };
      // Save BEFORE broadcast: timeouts or interruptions cannot accidentally create a second NFT contract.
      await store.write('pending.json', pending);
    }
    const step = pending[name];
    requireValue(Transaction.from(step.raw).hash === step.hash && Transaction.from(step.raw).from === deployer &&
      Transaction.from(step.raw).data === requests[name].data && Transaction.from(step.raw).nonce === nonce + index &&
      Number(Transaction.from(step.raw).chainId) === SEPOLIA.chainId, 'Saved deployment transaction does not match the expected constructor or wallet.');
    let receipt = await provider.getTransactionReceipt(step.hash);
    if (!receipt) {
      const transaction = await provider.getTransaction(step.hash);
      if (!transaction) {
        requireValue(await provider.getTransactionCount(deployer, 'latest') <= nonce + index, 'Saved nonce was consumed by another transaction. Inspect the wallet on Sepolia Etherscan before proceeding.');
        await provider.broadcastTransaction(step.raw);
      }
      log(`${name}: ${SEPOLIA.explorerUrl}/tx/${step.hash}`);
    }
    // Also recheck confirmations on resume when a receipt already exists.
    receipt = await provider.waitForTransaction(step.hash, settings.confirmations, 180_000);
    requireValue(receipt?.status === 1 && receipt.contractAddress === step.address && await provider.getCode(step.address) !== '0x', 'Deployment did not confirm successfully. Inspect the saved transaction; do not delete pending.json.');
    receipts[name] = receipt;
  }
  const nft = new Contract(collection, artifacts.collection.abi, provider);
  const marketplace = new Contract(market, artifacts.market.abi, provider);
  requireValue(await nft.owner() === deployer && await marketplace.nft() === collection, 'Post-deployment contract linkage or owner check failed. Keep the pending record for inspection.');
  const config = {
    ...SEPOLIA, rpcUrl: settings.walletRpcUrl, instanceId: pending.instanceId, collection, market,
    metadataBaseUrl: settings.metadataBaseUrl, deployer,
    blockNumber: receipts.collection.blockNumber, blockHash: receipts.collection.blockHash,
    collectionAbi: artifacts.collection.abi, marketAbi: artifacts.market.abi,
    transactions: { collection: pending.collection.hash, market: pending.market.hash },
    constructorArguments: { collection: [settings.metadataBaseUrl], market: [collection] },
    createdAt: pending.createdAt,
  };
  await store.write('deployment.json', config);
  log(`Deployment complete.\nNFT: ${SEPOLIA.explorerUrl}/address/${collection}\nMarket: ${SEPOLIA.explorerUrl}/address/${market}`);
  return config;
}
