// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title ControlledDemoToken
/// @notice Fixed-supply token for the explicitly controlled public-testnet demo markets.
/// @dev This token is not bridged, pegged, redeemable, or intended to represent economic value.
contract ControlledDemoToken is ERC20 {
    uint8 private immutable _demoDecimals;

    error InvalidDemoTokenConfiguration();

    constructor(string memory name_, string memory symbol_, uint8 decimals_, address recipient_, uint256 supply_)
        ERC20(name_, symbol_)
    {
        if (recipient_ == address(0) || supply_ == 0 || (decimals_ != 6 && decimals_ != 18)) {
            revert InvalidDemoTokenConfiguration();
        }
        _demoDecimals = decimals_;
        _mint(recipient_, supply_);
    }

    function decimals() public view override returns (uint8) {
        return _demoDecimals;
    }
}
