# Optional Sepolia Deployment

Complete and test both classroom contracts locally first. Sepolia deployment is an optional extension; it is not required to finish or run the local assignment. The archive contains configuration examples and scripts, but no deployed contracts, private environment files or funded wallets.

## Prepare configuration

```sh
npm run sepolia:setup
```

This creates `.env.sepolia` from `.env.sepolia.example` without overwriting an existing file. Edit the new file locally:

| Variable | Purpose |
| --- | --- |
| `SEPOLIA_RPC_URL` | Private Ethereum Sepolia RPC endpoint used by the deployer and API |
| `SEPOLIA_PRIVATE_KEY` | A dedicated test wallet key; never use a public Hardhat demo key |
| `SEPOLIA_METADATA_BASE_URL` | Final public HTTPS or IPFS metadata directory ending in `/` |
| `SEPOLIA_WALLET_RPC_URL` | Public endpoint for browser wallets; do not embed a provider API key |
| `PUBLIC_BASE_URL` | Public HTTPS origin when Express serves the metadata/images |
| `RPC_LOG_BLOCK_RANGE` | Event query window; reduce if the RPC provider restricts log ranges |

Fund the deployment address with Sepolia test ETH using an available faucet. Keep keys and private RPC endpoints on your machine; do not submit or share `.env.sepolia`. Local demo balances cannot fund a public test network.

## Publish metadata first

Set `IMAGE_BASE_URL` in `.env.sepolia` to the final public image directory, ending in `/` (for example, `https://your-domain.example/images/`). Then export:

```sh
npm run export:assets
```

The command exports the collection's images and JSON metadata into `exported-assets/`; inspect its output before uploading to public HTTPS or IPFS storage. The contract constructs `tokenURI` as the base directory followed by the numeric ID, with **no `.json` suffix**. Verify metadata and image links for IDs `0`, `42` and `9999` before deployment. The base URI is fixed in the constructor, so localhost URLs cannot serve public wallets.

## Check, deploy and start

```sh
npm run exercise:check
npm test
npm run sepolia:check
npm run deploy:sepolia
npm run dev:sepolia
```

The preflight checks configuration, URI format, chain ID `11155111`, deployer balance, pending transactions and estimated gas. It does not broadcast a deployment. Check metadata reachability yourself; URI format validation cannot prove that files are published.

Deployment creates the NFT contract and then the market linked to it. It waits for the configured confirmations and stores addresses, ABIs and receipts under `.runtime/sepolia/`. A new collection starts with zero minted NFTs; the local seed of 48 NFTs is not used. Existing deployment records prevent accidental duplicate deployment.

If deployment is interrupted, preserve the configuration and runtime records:

```sh
npm run sepolia:check
npm run deploy:sepolia -- --resume
```

Resume reuses the same signed transactions and checks their receipts. `.runtime/sepolia/pending.json` can contain signed transactions; retain it locally. Resolve nonce conflicts or stuck transactions before changing configuration or deleting records.

The default Sepolia website is `http://127.0.0.1:5174`; the API is `http://127.0.0.1:3002`. Connect a browser wallet and switch it to Sepolia. Local demo accounts are unavailable on that network. Restarting the website does not reset the public chain.

## Build for a server

```sh
npm ci
npm run build
npm run start:sepolia
```

The server needs the RPC configuration and `.runtime/sepolia/deployment.json`, but does not need the deployment private key. The API serves `dist/`, queries and `/docs/uml/`; place it behind an HTTPS reverse proxy. Default binding is `127.0.0.1:3002`. Set `HOST` and `PORT` explicitly for your hosting environment.

No cloud host is created or published by these instructions. Contract source verification is a separate step; compiler settings are Solidity `0.8.37`, optimizer enabled with `200` runs, EVM `cancun`.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| Missing configuration | Fill the required local variables; never paste a private key into a report |
| Wrong RPC network | Use Ethereum Sepolia, chain ID `11155111` |
| Insufficient test ETH | Fund the deployer address printed by the preflight |
| Pending deployment exists | Keep the same account/configuration and use `--resume` |
| Empty marketplace | Mint first, then approve and list or bid |
| API sync unavailable | Check RPC availability, quota and log-query limits |
| Missing images in external wallets | Check the final public metadata and image URIs |

The deployment tests in `npm test` use an isolated simulated network and spend no Sepolia test ETH.
