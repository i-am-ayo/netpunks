// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Student edition: complete N01-N07; preserve the interfaces and security modifiers.
contract NetPunks is ERC721, Ownable2Step, ReentrancyGuard {
    uint256 public constant MAX_SUPPLY = 10_000;
    uint256 public constant WALLET_LIMIT = 5;
    uint256 public totalMinted;
    uint256 public mintPrice = 0.005 ether;
    uint256 public mintProceeds;
    bool public mintOpen = true;
    string private metadataBase;
    mapping(address => uint256) public mintedPerWallet;
    mapping(uint256 => uint256) public ownershipVersion;
    mapping(uint256 => uint256) public approvalVersion;
    mapping(address => mapping(address => uint256)) public operatorVersion;

    error SaleClosed();
    error InvalidQuantity();
    error WalletLimit();
    error SoldOut();
    error IncorrectPayment();
    error NothingToWithdraw();
    error PaymentFailed();
    error ExerciseIncomplete(string exerciseId);
    event MintSettingsChanged(bool open, uint256 price);
    event Minted(uint256 indexed tokenId, address indexed minter, uint256 price);
    event MintProceedsWithdrawn(address indexed recipient, uint256 amount);

    constructor(string memory base) ERC721("NETPUNKS", "NETP") Ownable(msg.sender) {
        metadataBase = base;
    }

    function mint(uint256 quantity) external payable nonReentrant {
        uint256 unitPrice = mintPrice;
        // [N01] Mint preconditions.
        if (!mintOpen) revert SaleClosed();
        if (quantity == 0 || quantity > WALLET_LIMIT) revert InvalidQuantity();
        if (mintedPerWallet[msg.sender] + quantity > WALLET_LIMIT) revert WalletLimit();
        if (totalMinted + quantity > MAX_SUPPLY) revert SoldOut();
        if (msg.value != unitPrice * quantity) revert IncorrectPayment();

        // [N02] Sequential minting and accounting.
        uint256 firstId = totalMinted;
        totalMinted = firstId + quantity;
        mintedPerWallet[msg.sender] += quantity;
        mintProceeds += msg.value;
        for (uint256 i = 0; i < quantity; i++) {
            uint256 tokenId = firstId + i;
            _safeMint(msg.sender, tokenId);
            emit Minted(tokenId, msg.sender, unitPrice);
        }
    }

    function setMintSettings(bool open, uint256 price) external onlyOwner {
        // [N03] Update availability and unit price, then emit MintSettingsChanged.
        mintOpen = open;
        mintPrice = price;
        emit MintSettingsChanged(open, price);
    }

    function withdrawMintProceeds() external onlyOwner nonReentrant {
        // [N04] Withdraw mint proceeds using checks-effects-interactions.
        uint256 amount = mintProceeds;
        if (amount == 0) revert NothingToWithdraw();
        mintProceeds = 0;
        address recipient = owner();
        (bool ok, ) = recipient.call{value: amount}("");
        if (!ok) revert PaymentFailed();
        emit MintProceedsWithdrawn(recipient, amount);
    }

    function _baseURI() internal view override returns (string memory) { return metadataBase; }

    function approve(address to, uint256 tokenId) public override {
        super.approve(to, tokenId);
        // [N05] After a successful parent approval, advance this token approval version.
        approvalVersion[tokenId] += 1;
    }

    function setApprovalForAll(address operator, bool approved) public override {
        super.setApprovalForAll(operator, approved);
        // [N06] After the parent call, advance the version for this caller/operator pair.
        operatorVersion[msg.sender][operator] += 1;
    }

    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = super._update(to, tokenId, auth);
        // [N07] After the parent changes ownership, advance this token ownership version.
        ownershipVersion[tokenId] += 1;
        return from;
    }

    // Exercise sentinel: retained for reference; no call sites remain.
    function _exercise(string memory exerciseId) private pure {
        revert ExerciseIncomplete(exerciseId);
    }
}
