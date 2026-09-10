// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ControlledDemoFaucet} from "../src/demo/ControlledDemoFaucet.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";

contract FactoryRegistryStub {
    mapping(address => bool) public isFactoryTreasury;
    function setTreasury(address treasury, bool allowed) external { isFactoryTreasury[treasury] = allowed; }
}

contract ControlledDemoFaucetTest is Test {
    FactoryRegistryStub internal factory;
    MockERC20 internal wctc;
    MockERC20 internal stable;
    ControlledDemoFaucet internal faucet;
    address internal treasury = address(0xBEEF);

    function setUp() public {
        factory = new FactoryRegistryStub();
        wctc = new MockERC20("fwWCTC", "fwWCTC", 18);
        stable = new MockERC20("fwUSD", "fwUSD", 6);
        faucet = new ControlledDemoFaucet(address(wctc), address(stable), 70 ether, 30_000_000);
        faucet.configureFactory(address(factory));
        wctc.mint(address(faucet), 700 ether);
        stable.mint(address(faucet), 300_000_000);
        factory.setTreasury(treasury, true);
    }

    function test_claimFundsFactoryTreasuryOnce() public {
        faucet.claim(treasury);
        assertEq(wctc.balanceOf(treasury), 70 ether);
        assertEq(stable.balanceOf(treasury), 30_000_000);
        assertTrue(faucet.claimed(treasury));

        vm.expectRevert(ControlledDemoFaucet.AlreadyClaimed.selector);
        faucet.claim(treasury);
    }

    function test_claimRejectsNonFactoryTreasury() public {
        address stranger = address(0xCAFE);
        vm.expectRevert(ControlledDemoFaucet.NotFactoryTreasury.selector);
        faucet.claim(stranger);
    }

    function test_claimRevertsWhenUnderfundedWithoutConsumingClaim() public {
        ControlledDemoFaucet empty = new ControlledDemoFaucet(address(wctc), address(stable), 1 ether, 1_000_000);
        empty.configureFactory(address(factory));
        vm.expectRevert(ControlledDemoFaucet.FaucetUnderfunded.selector);
        empty.claim(treasury);
        assertFalse(empty.claimed(treasury));
    }

    function test_factoryMustBeConfiguredOnceByDeployer() public {
        ControlledDemoFaucet fresh = new ControlledDemoFaucet(address(wctc), address(stable), 1 ether, 1_000_000);
        vm.expectRevert(ControlledDemoFaucet.FactoryNotConfigured.selector);
        fresh.claim(treasury);

        vm.prank(address(0xCAFE));
        vm.expectRevert(ControlledDemoFaucet.NotConfigurator.selector);
        fresh.configureFactory(address(factory));

        fresh.configureFactory(address(factory));
        assertTrue(fresh.factoryConfigured());
        assertEq(address(fresh.FACTORY()), address(factory));

        vm.expectRevert(ControlledDemoFaucet.FactoryAlreadyConfigured.selector);
        fresh.configureFactory(address(factory));
    }
}
