// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title PriceObservation
/// @notice A deliberately minimal contract deployed on Sepolia (the source chain) purely
///         to have a controlled, known event for the agent to watch and for Attestcoin to
///         prove inclusion of. This is NOT a real price oracle or DEX — it exists so the
///         demo has a concrete, self-controlled source-chain fact, matching the PRD's
///         "toy source-chain price contracts" week-1 task.
/// @dev DEVLOG.md "Scope-changing finding: encodedTransaction is not a simple custom
///      payload" applies here: even though this contract's own event layout is simple,
///      the Attestcoin `encodedTransaction` proving inclusion of a call to
///      `observePrice()` is the SDK's full raw-transaction-envelope encoding, not just
///      this event's data. On-chain decoding of that envelope (to actually extract
///      `price` inside ASCTreasuryJournal) is the open integration work tracked in
///      DEVLOG, not something this contract's simplicity avoids.
contract PriceObservation {
    event PriceObserved(uint256 indexed price, uint256 timestamp, address reporter);

    uint256 public latestPrice;
    uint256 public latestTimestamp;

    /// @notice Records a price observation. Deliberately permissionless for a hackathon
    ///         demo — anyone can call it, which is fine since the agent treats it purely
    ///         as "a fact that happened on Sepolia," not as a trusted price feed in
    ///         itself. The trust comes from Attestcoin's proof of inclusion + the
    ///         contract-side rigid bounds, not from this function's access control.
    function observePrice(uint256 price) external {
        latestPrice = price;
        latestTimestamp = block.timestamp;
        emit PriceObserved(price, block.timestamp, msg.sender);
    }
}
