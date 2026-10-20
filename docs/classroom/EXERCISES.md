# Contract Exercises

Implement the 17 tasks in the two supplied contracts. English logic hints sit immediately above each `_exercise("ID");` call. Replace that call with working Solidity, keeping the public interfaces, events, custom errors and security modifiers.

The constructor, storage definitions, ERC-721 base implementation, access control inheritance and reentrancy guard are supplied. You are responsible for the application rules and their state transitions. The starter compiles but intentionally reverts when an unfinished branch is reached.

## Learning goals

- Enforce exact payments, a fixed collection cap and lifetime mint allowances.
- Distinguish ownership, per-token approval and operator approval.
- Prevent stale listings from reviving after transfers or reapproval.
- Separate bid escrow from funds available for withdrawal.
- Apply checks-effects-interactions and reason about atomic rollback.
- Connect contract events to the Express index and Vue interface.

## Task checklist

Suggested marks total **100**. `N` tasks belong to `contracts/NetPunks.sol`; `M` tasks belong to `contracts/NetPunksMarket.sol`.

| Done | ID | Function / responsibility | Required behavior | Marks |
| --- | --- | --- | --- | ---: |
| [ ] | N01 | `mint` checks | Open sale; quantity 1-5; lifetime wallet allowance; supply cap; exact ETH | 8 |
| [ ] | N02 | `mint` execution | Reserve consecutive IDs and update quota/proceeds before safe receiver callbacks; emit each mint | 10 |
| [ ] | N03 | `setMintSettings` | Update availability and unit price; emit the settings event; zero price is valid | 4 |
| [ ] | N04 | `withdrawMintProceeds` | Owner only; clear accounting before payment; revert failed payments; emit the withdrawal | 6 |
| [ ] | N05 | `approve` hook | Advance the token approval version after the inherited approval succeeds | 4 |
| [ ] | N06 | `setApprovalForAll` hook | Advance the caller/operator version for grants and revocations | 4 |
| [ ] | N07 | `_update` hook | Advance ownership version after the inherited ownership update; keep its return value | 4 |
| [ ] | M01 | `_approved` | Accept token approval OR operator approval granted to this market | 4 |
| [ ] | M02 | `getListing` | Return an empty listing when ownership, any version or current approval is invalid | 8 |
| [ ] | M03 | `list` | Owner only; positive price; optional buyer; approval; snapshot all versions and emit | 7 |
| [ ] | M04 | `cancelListing` | Recorded seller only; delete listing and emit; leave bids and balances alone | 3 |
| [ ] | M05 | `buy` | Recheck valid listing, quoted price, exact value and buyer; credit funds and deliver NFT | 10 |
| [ ] | M06 | `placeBid` | Existing NFT; not its owner; strictly higher positive full escrow; refund-credit prior bid | 7 |
| [ ] | M07 | `withdrawBid` | Current bidder only; use the shared refund routine without sending ETH | 4 |
| [ ] | M08 | `acceptBid` | Owner and approval; existing eligible bid above the floor; clear records and settle escrow | 8 |
| [ ] | M09 | `_refundBid` | Delete an existing bid, credit its original bidder and emit; absent bid does nothing | 4 |
| [ ] | M10 | `withdraw` | Withdraw caller's pending credit once; clear before payment; revert failure; emit | 5 |

The machine-readable version is [exercises.json](exercises.json).

## Work in dependency order

1. Complete **N07**, then **N01-N02**. `_safeMint` reaches the overridden ownership hook, so leaving N07 unfinished prevents minting.
2. Complete **N03-N06** and run `npm run test:nft`.
3. Complete **M01-M04**. Listing validation relies on all three version mappings.
4. Complete **M09** before **M05-M08**. Purchases, bid replacement and bid cancellation all depend on refund accounting.
5. Complete **M10**, then run the full contract tests and application tests.

Compile after each small change. To focus on a named test while other features are unfinished:

```sh
npm run compile
node --test --test-name-pattern="listings require" test/contracts.test.js
```

Unrelated tests may fail until their dependencies are implemented. Do not weaken assertions or remove tests to make the exercise check pass.

## Core rules to explain in your submission

### Minting and roles

Token IDs start at zero and increase sequentially. The collection cap is 10,000; each address can mint at most five NFTs over its lifetime. Sending an NFT away does not restore mint quota. Initial mint price is 0.005 local test ETH. Both underpayment and overpayment revert. Availability and price are configurable by the collection owner; marketplace funds belong to their credited users.

The collection inherits `Ownable2Step`: an ownership handover requires a proposal followed by acceptance from the proposed owner. The market has no administrator who can withdraw other users' pending balances.

### Listings and approvals

Listing does not escrow the NFT. Its owner authorizes the market to transfer it. A listing stores snapshots of ownership, token approval and owner/operator approval versions. Any mismatched version makes the listing invalid, even if a token returns to the seller or approval is later granted again. Returning an empty listing in a view query does not erase the stored record.

Listing prices must be positive. A zero `onlyBuyer` means a public listing. Repricing replaces a listing. A purchase compares the current price with both `expectedPrice` and the attached payment. Check buyer restrictions before settling.

### Escrow and pending withdrawals

Each NFT has one highest bid. A new bid must attach its entire amount, even when the same bidder raises a previous bid. The old amount becomes withdrawable credit. Cancelling a bid creates credit; it does not immediately send ETH.

Buying at a fixed price clears the active bid and credits its refund, while crediting the purchase payment to the seller. Accepting a bid uses the escrow already held by the market. `minimumPrice` protects the accepted amount; it does not lock the identity of the bidder.

Pending credit is paid only by `withdraw()`. Mint proceeds live in the NFT contract and are paid separately by `withdrawMintProceeds()`. Each withdrawal checks for a positive amount, updates accounting before the external call, and reverts if that call fails. Keep the supplied `nonReentrant` modifiers.

### Atomicity and events

A failing safe NFT receiver reverts the entire business transaction, including ownership changes, balances, version counters and events. A previous approval transaction remains successful. Emit the existing events with the correct IDs, addresses and amounts: the API indexer relies on them.

## Test mapping

| Tasks | Main behavior tests |
| --- | --- |
| N01-N03, N07 | Consecutive mint IDs, exact payment, paused mint, owner-only settings, permanent wallet quota |
| N04 | Owner-only primary proceeds withdrawal and zero-balance rejection |
| N05-N07, M01-M04 | Token/operator authorization, transfer away and back, revoke/regrant invalidation, cancellation |
| M05, M09-M10 | Atomic purchase, changed quote, private buyer, active bid refund, seller withdrawal |
| M06-M09 | Higher bid escrow, own-bid replacement, cancellation, minimum accepted price and clearing listings |
| M10 | Withdrawal once, accounting conservation and reentrancy probe |
| Cross-contract | Failed NFT receipt rollback, separate mint/market funds and acceptance permission checks |
| Events and integration | `test/indexer.test.js` checks indexing and balances; the seeded application exercises actual events |

`test/contracts.test.js` covers the original contract behavior. `test/classroom.test.js` adds classroom edge cases. `test/sepolia.test.js` simulates deployment without contacting Sepolia. The supplied suite is feedback, not an exhaustive proof of correctness; review every rule in the hints, including event arguments and failure rollback.

## Final verification

```sh
npm run exercise:check
npm run test:contracts
npm test
npm run build
npm run dev
```

The placeholder check only finds active sentinel calls. Removing them without implementing the rules is insufficient. Complete the account-switching walkthrough in the root [README](../../README.md) and explain your state changes in a short English submission report.

Do not submit dependency folders, compiled artifacts, runtime wallets/databases or private environment files.
