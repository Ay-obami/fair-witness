// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IFairWitnessFactoryRegistry {
    function isFactoryTreasury(address treasury) external view returns (bool);
}

/// @title ControlledDemoFaucet
/// @notice Public-testnet onboarding faucet for Fair Witness controlled demo assets.
/// @dev This contract is deliberately outside the protocol security boundary. It can
///      only transfer fixed amounts to factory-created treasuries and each treasury may
///      claim once. The controlled tokens have no economic value, bridge, or redemption.
contract ControlledDemoFaucet {
    using SafeERC20 for IERC20;

    IFairWitnessFactoryRegistry public immutable FACTORY;
    IERC20 public immutable WCTC;
    IERC20 public immutable STABLE;
    uint256 public immutable WCTC_AMOUNT;
    uint256 public immutable STABLE_AMOUNT;

    mapping(address treasury => bool) public claimed;

    error InvalidConfiguration();
    error NotFactoryTreasury();
    error AlreadyClaimed();
    error FaucetUnderfunded();

    event DemoAssetsClaimed(address indexed treasury, address indexed caller, uint256 wctcAmount, uint256 stableAmount);

    constructor(address factory_, address wctc_, address stable_, uint256 wctcAmount_, uint256 stableAmount_) {
        if (
            factory_ == address(0) || wctc_ == address(0) || stable_ == address(0)
                || factory_.code.length == 0 || wctc_.code.length == 0 || stable_.code.length == 0
                || wctcAmount_ == 0 || stableAmount_ == 0
        ) revert InvalidConfiguration();
        FACTORY = IFairWitnessFactoryRegistry(factory_);
        WCTC = IERC20(wctc_);
        STABLE = IERC20(stable_);
        WCTC_AMOUNT = wctcAmount_;
        STABLE_AMOUNT = stableAmount_;
    }

    function claim(address treasury) external {
        if (!FACTORY.isFactoryTreasury(treasury)) revert NotFactoryTreasury();
        if (claimed[treasury]) revert AlreadyClaimed();
        if (WCTC.balanceOf(address(this)) < WCTC_AMOUNT || STABLE.balanceOf(address(this)) < STABLE_AMOUNT) {
            revert FaucetUnderfunded();
        }

        // Mark before transfers. SafeERC20 reverts the entire transaction if either
        // transfer fails, restoring this flag automatically.
        claimed[treasury] = true;
        WCTC.safeTransfer(treasury, WCTC_AMOUNT);
        STABLE.safeTransfer(treasury, STABLE_AMOUNT);
        emit DemoAssetsClaimed(treasury, msg.sender, WCTC_AMOUNT, STABLE_AMOUNT);
    }
}
