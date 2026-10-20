// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
import {NetPunksMarket} from "../NetPunksMarket.sol";

contract WithdrawalProbe {
    NetPunksMarket public immutable market;
    bool public reentrySucceeded;
    constructor(NetPunksMarket target) { market = target; }
    function bid(uint256 id) external payable { market.placeBid{value: msg.value}(id); }
    function withdraw() external { market.withdraw(); }
    receive() external payable {
        (bool ok,) = address(market).call(abi.encodeCall(market.withdraw, ()));
        reentrySucceeded = ok;
    }
}
