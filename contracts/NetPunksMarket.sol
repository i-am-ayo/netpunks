// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {NetPunks} from "./NetPunks.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Student edition: complete M01-M10. Escrow bids; credit proceeds/refunds for later withdrawal.
contract NetPunksMarket is ReentrancyGuard {
    NetPunks public immutable nft;
    struct Listing { address seller; uint256 price; address onlyBuyer; uint256 version; uint256 approvalVersion; uint256 operatorVersion; }
    struct Bid { address bidder; uint256 amount; }
    mapping(uint256 => Listing) private listings;
    mapping(uint256 => Bid) public bids;
    mapping(address => uint256) public pendingWithdrawals;

    error NotOwner();
    error NotApproved();
    error InvalidPrice();
    error NotForSale();
    error PriceChanged();
    error NotAllowedBuyer();
    error OwnToken();
    error BidTooLow();
    error NoBid();
    error NotBidder();
    error NothingToWithdraw();
    error PaymentFailed();
    error ExerciseIncomplete(string exerciseId);
    event Listed(uint256 indexed tokenId, address indexed seller, uint256 price, address onlyBuyer);
    event ListingCancelled(uint256 indexed tokenId, address indexed seller);
    event Purchased(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price);
    event BidPlaced(uint256 indexed tokenId, address indexed bidder, uint256 amount);
    event BidWithdrawn(uint256 indexed tokenId, address indexed bidder, uint256 amount);
    event BidAccepted(uint256 indexed tokenId, address indexed seller, address indexed buyer, uint256 price);
    event Withdrawn(address indexed account, uint256 amount);

    constructor(NetPunks collection) { nft = collection; }

    function _approved(address owner, uint256 tokenId) private view returns (bool approved) {
        // [M01] Accept token approval OR operator approval granted to this market.
        return nft.getApproved(tokenId) == address(this) || nft.isApprovedForAll(owner, address(this));
    }

    function getListing(uint256 tokenId) public view returns (Listing memory) {
        Listing memory listing = listings[tokenId];
        // [M02] Validate the stored listing; keep the final return for a valid record.
        if (listing.seller == address(0)) return Listing(address(0), 0, address(0), 0, 0, 0);
        if (nft.ownerOf(tokenId) != listing.seller) return Listing(address(0), 0, address(0), 0, 0, 0);
        if (listing.version != nft.ownershipVersion(tokenId)) return Listing(address(0), 0, address(0), 0, 0, 0);
        if (listing.approvalVersion != nft.approvalVersion(tokenId)) return Listing(address(0), 0, address(0), 0, 0, 0);
        if (listing.operatorVersion != nft.operatorVersion(listing.seller, address(this))) return Listing(address(0), 0, address(0), 0, 0, 0);
        if (!_approved(listing.seller, tokenId)) return Listing(address(0), 0, address(0), 0, 0, 0);
        return listing;
    }

    function list(uint256 tokenId, uint256 price, address onlyBuyer) external {
        // [M03] Create or replace a listing.
        if (nft.ownerOf(tokenId) != msg.sender) revert NotOwner();
        if (price == 0) revert InvalidPrice();
        if (onlyBuyer == msg.sender) revert OwnToken();
        if (!_approved(msg.sender, tokenId)) revert NotApproved();
        listings[tokenId] = Listing({
            seller: msg.sender,
            price: price,
            onlyBuyer: onlyBuyer,
            version: nft.ownershipVersion(tokenId),
            approvalVersion: nft.approvalVersion(tokenId),
            operatorVersion: nft.operatorVersion(msg.sender, address(this))
        });
        emit Listed(tokenId, msg.sender, price, onlyBuyer);
    }

    function cancelListing(uint256 tokenId) external {
        // [M04] Allow cancellation only by the recorded listing seller; otherwise NotOwner.
        if (listings[tokenId].seller != msg.sender) revert NotOwner();
        delete listings[tokenId];
        emit ListingCancelled(tokenId, msg.sender);
    }

    function buy(uint256 tokenId, uint256 expectedPrice) external payable nonReentrant {
        // [M05] Settle a fixed-price purchase atomically.
        Listing memory listing = getListing(tokenId);
        if (listing.seller == address(0)) revert NotForSale();
        if (listing.price != expectedPrice || msg.value != listing.price) revert PriceChanged();
        if (msg.sender == listing.seller) revert OwnToken();
        if (listing.onlyBuyer != address(0) && msg.sender != listing.onlyBuyer) revert NotAllowedBuyer();
        delete listings[tokenId];
        _refundBid(tokenId);
        pendingWithdrawals[listing.seller] += listing.price;
        nft.safeTransferFrom(listing.seller, msg.sender, tokenId);
        emit Purchased(tokenId, listing.seller, msg.sender, listing.price);
    }

    function placeBid(uint256 tokenId) external payable nonReentrant {
        // [M06] Place a new highest bid.
        address owner = nft.ownerOf(tokenId);
        if (msg.sender == owner) revert OwnToken();
        if (msg.value <= bids[tokenId].amount) revert BidTooLow();
        _refundBid(tokenId);
        bids[tokenId] = Bid({bidder: msg.sender, amount: msg.value});
        emit BidPlaced(tokenId, msg.sender, msg.value);
    }

    function withdrawBid(uint256 tokenId) external nonReentrant {
        // [M07] Only the current highest bidder can cancel; otherwise NotBidder.
        if (bids[tokenId].bidder != msg.sender) revert NotBidder();
        _refundBid(tokenId);
    }

    function acceptBid(uint256 tokenId, uint256 minimumPrice) external nonReentrant {
        // [M08] Let the holder accept the highest bid at execution time.
        if (nft.ownerOf(tokenId) != msg.sender) revert NotOwner();
        if (!_approved(msg.sender, tokenId)) revert NotApproved();
        Bid memory bid = bids[tokenId];
        if (bid.bidder == address(0)) revert NoBid();
        if (bid.bidder == msg.sender) revert OwnToken();
        if (bid.amount < minimumPrice) revert BidTooLow();
        delete bids[tokenId];
        delete listings[tokenId];
        pendingWithdrawals[msg.sender] += bid.amount;
        nft.safeTransferFrom(msg.sender, bid.bidder, tokenId);
        emit BidAccepted(tokenId, msg.sender, bid.bidder, bid.amount);
    }

    function _refundBid(uint256 tokenId) private {
        // [M09] Shared refund accounting.
        Bid memory bid = bids[tokenId];
        if (bid.bidder == address(0)) return;
        delete bids[tokenId];
        pendingWithdrawals[bid.bidder] += bid.amount;
        emit BidWithdrawn(tokenId, bid.bidder, bid.amount);
    }

    function withdraw() external nonReentrant {
        // [M10] Withdraw the caller's entire pending market balance.
        uint256 amount = pendingWithdrawals[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        pendingWithdrawals[msg.sender] = 0;
        (bool ok, ) = msg.sender.call{value: amount}("");
        if (!ok) revert PaymentFailed();
        emit Withdrawn(msg.sender, amount);
    }

    // Exercise sentinel: retained for reference; no call sites remain.
    function _exercise(string memory exerciseId) private pure {
        revert ExerciseIncomplete(exerciseId);
    }
}
