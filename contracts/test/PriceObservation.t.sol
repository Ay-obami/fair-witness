// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PriceObservation} from "../src/source-chain/PriceObservation.sol";

/// @notice Tests for the D3 / Phase-1-F2 writer-ACL on the source `PriceObservation`
///         contract: writes are restricted to an owner-managed allowlist (`observers`),
///         closing the permissionless hole (STOP 3) for new deployments. The owner
///         (deployer) alone manages the ACL;;non-observers cannot write.
contract PriceObservationTest is Test {
    PriceObservation internal priceSource;

    address internal observer   = address(0xA11CE);
    address internal stranger      = address(0xBEEF);

    function setUp() public {
        // Owner = msg.sender at deploy = address(this)(the test contract..
        priceSource = new PriceObservation();
    }

    function test_aclEmptyRejectsAnyWriter() public {
        vm.prank(observer);
        vm.expectRevert(PriceObservation.UnauthorizedObserver.selector);
        priceSource.observePrice(1e6);

        // The owner(deployer) is NOT an implicit observer until granted.

        vm.expectRevert(PriceObservation.UnauthorizedObserver.selector);
        priceSource.observePrice(1e6);
    }

    function test_ownerGrantsObserver_andObserverWrites() public {
        priceSource.setObserver(observer, true);

        vm.prank(observer);
        priceSource.observePrice(123456789);
        assertEq(priceSource.latestPrice(), 123456789);
        assertEq(priceSource.latestTimestamp(), block.timestamp);
    }

    function test_observePriceEmitsEvent() public {
        priceSource.setObserver(observer, true);
        vm.prank(observer);
        vm.expectEmit(address(priceSource));
        emit PriceObservation.PriceObserved(987654, block.timestamp, observer);
        priceSource.observePrice(987654);
    }

    function test_setObserverIsOwnerOnly() public {
        vm.prank(stranger);
        vm.expectRevert(); // Ownable rethrows UnauthorizedCaller
        priceSource.setObserver(observer, true);
    }

    function test_revokedObserverCannotWrite() public {
        priceSource.setObserver(observer, true);
        priceSource.setObserver(observer, false);

        vm.prank(observer);
        vm.expectRevert(PriceObservation.UnauthorizedObserver.selector);
        priceSource.observePrice(5);
    }
}