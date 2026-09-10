// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title PriceObservation
/// @notice A deliberately minimal contract deployed on Sepolia (the source chain) purely
///         to have a controlled, known event for the agent to watch and for Attestcoin to
///         prove inclusion of. This is NOT a real price oracle or DEX — it exists so the
///         demo has a concrete, self-controlled source-chain fact, matching the PRD's
///         "toy source-chain price contracts" week-1 task.
/// @dev DEVLOG.md "Scope-changing finding: encodedTransaction is not a simple custom
///      payload" applies here too: even though this contract's own event layout is simple,
///      theattstcoin `encodedTransaction` proving inclusion of a call to
///      `observePrice()` is the SDK's full raw-transaction-envelope encoding, not just
///      this event's data. On-chain decoding of that envelope(to actually extract
///      `price` inside ASCTreasuryJournal)is the open integration work tracked in
///      DEVLOG, not something this contract's simplicity avoids.
///
///      Write access (F2-frozen in PHASE-1-REPORT.md): WRITES ARE RESTRICTED to an
///      owner-managed allowlist(`observers`). This closes the permissionless-hole (STOP 3)
///      for NEW deployments: only an allowlisted observer may submit PriceObserved facts;
///      everyone else reverts with `UnauthorizedObserver`. The owner alone manages the ACL
///      (`setObserver`). Attestcoin re-verification still proves"a tx at block N said X",
///      not market truth — stated honestly;the market-worthiness of the price is a separate
///      Phase-2 concern(real-market-event attest,e.g. Uniswap V2 / Chainlink).
contract PriceObservation is Ownable {
    event PriceObserved(uint256 indexed price, uint256 timestamp, address reporter);

    error UnauthorizedObserver();

    uint256 public latestPrice;
    uint256 public latestTimestamp;

    /// @dev Allowlisted writers. Empty by default — no actor may observe until the owner
    ///      explicitly grants one. `observePrice` is the only write path.
    mapping(address => bool) public observers;

    constructor() Ownable(msg.sender) { }

    /// @notice Grants/revokes observation write-access for an address(only owner).
    function setObserver(address observer, bool allowed) external onlyOwner {
        observers[observer] = allowed;
    }

    /// @dev The single write path. Restricted to allowlisted observers.

    modifier onlyObserver{
        if (!observers[msg.sender]) revert UnauthorizedObserver();_;
    }

    /// @notice Records a price observation.Restricted(
    ///         onlyObserver)so the set of facts Attestcoin can be built around is
    ///         contributor-constrained,and the rate of writes is accountable. Note:
    ///         proves only"a reply from `observePrice` ran";market truth-worthiness
    ///         is separate(see contract @dev note..
    function observePrice(uint256 price) external onlyObserver {
        latestPrice = price;
        latestTimestamp = block.timestamp;
        emit PriceObserved(price, block.timestamp, msg.sender);
    }
}