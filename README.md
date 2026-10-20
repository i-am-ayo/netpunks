# NETPUNKS - Smart Contract Classroom

Complete the core Solidity code, test your implementation, and run an NFT marketplace built with **Hardhat 3, Vue 3, Express 5 and SQLite**.

This is the student edition. The frontend, API, deployment scripts, artwork generator and tests are supplied. The two contracts contain **17 exercises** with **English logic hints**. Complete the placeholders in `contracts/NetPunks.sol` and `contracts/NetPunksMarket.sol`.

## 1. Install the prerequisites

- Install **Node.js 24.x LTS**, which includes npm, from the [official Node.js downloads](https://nodejs.org/en/download). The project minimum is Node.js 22.13. See the [Node.js release schedule](https://nodejs.org/en/about/previous-releases) and [Hardhat Node.js support](https://hardhat.org/docs/reference/nodejs-support).
- Use a code editor such as VS Code.
- Have an internet connection for the initial `npm ci` dependency download.
- Extract the ZIP before running commands. Open a terminal in the extracted folder containing `package.json`.

No global Hardhat, separate Solidity installation, database server, Python, MetaMask, RPC key or faucet is required for the local exercise. Commands below work in macOS/Linux terminals and Windows PowerShell with Node.js installed.

Check your tools:

```sh
node --version
npm --version
```

## 2. Download the dependencies

From the project root:

```sh
npm ci
npm run doctor
```

Keep `package-lock.json`. `npm ci` installs the versions recorded in that file, including the local Solidity compiler and platform-specific Hardhat dependencies. The archive intentionally does not contain `node_modules`.

## 3. Understand the starter state

```sh
npm run compile
npm run exercise:check
```

The supplied starter **compiles**. Unreachable-code, unused-variable and mutability warnings are expected while the placeholders always revert, including warnings pointing into inherited OpenZeppelin code. Complete the exercises rather than editing dependency files to silence these warnings. The exercise check intentionally exits with an error and lists the 17 unfinished tasks.

Each placeholder has this form:

```solidity
// TODO [N01] Read the English logic hints here.
_exercise("N01");
```

Replace the placeholder call with your implementation. Keep the function signatures, state layout, events, custom errors, imports and security modifiers. You may leave the English comments and the `_exercise` helper itself in place.

Unfinished calls revert with `ExerciseIncomplete(taskId)`. Merely deleting a placeholder does not implement the business rules and will not pass the behavior tests. `npm run dev` is deliberately blocked while active placeholders remain.

## 4. Complete the exercises in stages

Read [EXERCISES.md](docs/classroom/EXERCISES.md) for the full checklist, dependencies, expected behavior and test mapping.

Recommended order:

1. Ownership hook: **N07**.
2. Minting: **N01, N02**.
3. Issuance management and approvals: **N03-N06**.
4. Approval and valid listings: **M01-M04**.
5. Shared refund accounting: **M09**.
6. Purchases, bids and bid acceptance: **M05-M08**.
7. Market withdrawal: **M10**.

Compile frequently. After completing the NFT stage:

```sh
npm run test:nft
```

After completing both contracts:

```sh
npm run exercise:check
npm run test:contracts
npm test
npm run build
```

The first test command focuses on the NFT behavior in the original contract tests. `test:contracts` also runs the additional classroom edge cases. `npm test` checks the complete application, including indexing, API behavior, wallets, artwork and the isolated Sepolia deployment simulation. These tests create their own simulated chains and do not require a running development node.

## 5. Run the completed application

Once your implementation passes the tests:

```sh
npm run dev
```

The launcher compiles the contracts, starts a local Hardhat chain, deploys both contracts, creates sample transactions, and starts Express and Vue. It prints the final website URL.

Default addresses:

| Service | Address |
| --- | --- |
| Website | [http://127.0.0.1:5173](http://127.0.0.1:5173) |
| API health | [http://127.0.0.1:3001/api/health](http://127.0.0.1:3001/api/health) |
| Local chain | `http://127.0.0.1:8545`, chain ID `31337` |

Keep the terminal open. **Ctrl+C** stops all three services. Restarting starts a fresh local chain and resets local NFTs and transactions. Browser language, theme and favorites are stored separately.

### Classroom walkthrough

1. Switch the website to **English** using the language selector if desired.
2. Select **Connect wallet**, choose demo account A, then connect. There are **19 demo users (A-S) and one collection admin**. Local accounts start with 10,000 test ETH.
3. Mint an NFT and find it in **My collection**. Each wallet has a lifetime mint allowance of five NFTs.
4. List it for sale. Approve that NFT when prompted.
5. Switch to another demo account to buy it or place a bid.
6. Switch back to the seller to accept a bid or withdraw the sale proceeds.
7. Connect the collection admin, then open **My collection > Manage mint** to change mint settings or withdraw mint proceeds.

The launcher seeds 48 NFTs, 24 listings, six bids and five sales through actual local transactions. Some demo accounts already participated in those transactions; their remaining mint allowance reflects that history. The demo accounts and their public development keys are for local testing only.

### If ports are already in use

Stop your previous local instance, or create a `.env` file from `.env.example` and choose three different available ports:

```dotenv
LOCAL_CHAIN_PORT=18545
PORT=13001
WEB_PORT=15173
```

Then run `npm run dev` again. The classroom launcher automatically aligns the local RPC URL, metadata URL and frontend API proxy with these ports. Without an explicit `WEB_PORT`, it may select an available port between 5173 and 5183.

## 6. Read the diagrams and artwork explanation

While the application is running, open **UML Atlas** in the main navigation and choose English. You can also open [the English atlas](docs/uml/en/index.html) directly from disk; its images are embedded for offline reading.

- Diagram 13: `NetPunks` contract flowchart.
- Diagram 14: `NetPunksMarket` contract flowchart.
- [Avatar generation explainer](docs/uml/en/index.html#avatar-generation): different IDs produce different deterministic artwork; a fixed ID remains stable.
- PNG, SVG and editable draw.io sources are included. Independent function panels do not imply a mandatory call sequence.

## 7. Troubleshooting

| Symptom | What to check |
| --- | --- |
| `node` / `npm` is not found | Install Node.js and reopen your terminal. |
| `npm ci` cannot download packages | Check your internet connection and npm registry/proxy settings. Keep the lockfile. |
| Native Hardhat module is missing | Install on the current machine using `npm ci`; do not copy another machine's `node_modules`. |
| SQLite import fails | Upgrade to Node.js 24.x and run `npm ci` again. |
| `ExerciseIncomplete` or the launcher reports unfinished tasks | Implement the listed task in the two contract files. |
| A contract test fails after placeholders are gone | Read the expected custom error and assertions; check the task dependencies and event/accounting behavior. |
| Compilation succeeds but startup fails during seeding | Run `npm run test:contracts`; seeded transactions exercise approvals, listing, purchases and bids. |
| The page is offline | Keep `npm run dev` running and use the exact URL printed by the launcher. |
| A mint reaches the wallet cap | Use another demo user. Transferring an NFT does not restore lifetime mint allowance. |
| Assets disappear after restart | This is expected for the fresh local development chain. |

## 8. Submission

Submit the two completed `.sol` files and your short English report: design choices, passing test output, one end-to-end transaction example, and an explanation of checks-effects-interactions and listing invalidation. Follow your instructor's exact submission rules.

Do not submit `node_modules`, `.runtime`, `artifacts`, `cache`, private `.env` files or private keys. Advanced Sepolia preparation is documented separately in [docs/SEPOLIA.md](docs/SEPOLIA.md); finish and verify the local exercise first.
