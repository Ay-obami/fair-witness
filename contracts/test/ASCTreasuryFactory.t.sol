// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestBase} from "./helpers/TestBase.sol";
import {ASCTreasuryJournal} from "../src/ASCTreasuryJournal.sol";
import {ASCTreasuryFactory} from "../src/ASCTreasuryFactory.sol";

/// @notice Factory tests for the V2 multi-tenant pivot. The factory must deploy fresh,
///         independent treasury instances whose guardrail values are frozen immutably per
///         instance — the "no shared contract with mutable per-user settings" guarantee.
contract ASCTreasuryFactoryTest is TestBase {
    ASCTreasuryFactory internal factory;

    /// @dev A deliberately different profile from the fixture's defaults, used as Tenant B.
    function tenantBGuardrails() internal pure returns (ASCTreasuryJournal.Guardrails memory g) {
        g = ASCTreasuryJournal.Guardrails({
            maxTradeSize: 10e6, // 10 USDC
            maxSlippageBps: 200, // 2%
            minArbWidthBps: 120,
            maxDriftBps: 150,
            maxConfirmGapBlocks: 30,
            maxActionsPerEpoch: 3,
            epochLength: 1 days
        });
    }

    function setUp() public override {
        super.setUp();
        factory = new ASCTreasuryFactory(
            address(verifier),
            address(router),
            address(usdc),
            address(quote),
            address(priceSource)
        );
    }

    // -------------------------------------------------------------------
    // Deploy correctness: the instance exists, is owned by the caller-chosen
    // owner, binds the factory's canonical chain config, and carries EXACTLY the
    // guardrail values requested — as immutable getters, not settable storage.
    // -------------------------------------------------------------------

    function test_FactoryDeploysInstanceWithRequestedGuardrails() public {
        address tenant = makeAddr("tenant_a");

        ASCTreasuryJournal deployed = factory.createTreasury(tenant, defaultGuardrails());

        assertEq(deployed.owner(), tenant, "instance must be owned by the requested tenant");
        assertEq(address(deployed.VERIFIER()), address(verifier), "must bind canonical verifier");
        assertEq(address(deployed.DEX_ROUTER()), address(router), "must bind canonical dex router");
        assertEq(address(deployed.BASE_ASSET()), address(usdc), "must bind canonical base asset");
        assertEq(deployed.QUOTE_ASSET(), address(quote), "must bind canonical quote asset");
        assertEq(deployed.PRICE_CONTRACT(), address(priceSource), "must bind canonical price contract");

        assertEq(deployed.MAX_TRADE_SIZE(), defaultGuardrails().maxTradeSize);
        assertEq(deployed.MAX_SLIPPAGE_BPS(), defaultGuardrails().maxSlippageBps);
        assertEq(deployed.MIN_ARB_WIDTH_BPS(), defaultGuardrails().minArbWidthBps);
        assertEq(deployed.MAX_DRIFT_BPS(), defaultGuardrails().maxDriftBps);
        assertEq(deployed.MAX_CONFIRM_GAP_BLOCKS(), defaultGuardrails().maxConfirmGapBlocks);
        assertEq(deployed.MAX_ACTIONS_PER_EPOCH(), defaultGuardrails().maxActionsPerEpoch);
        assertEq(deployed.EPOCH_LENGTH(), defaultGuardrails().epochLength);

        // Fresh instance: empty journal, empty registry — nothing shared with anything else.
        assertEq(deployed.journalLength(), 0, "new instance must start with an empty journal");
        assertFalse(deployed.registeredAgents(agent), "new instance must start with no registered agents");
    }
function test_TreasuryDeployedEventEmittedWithAddressAndOwner() public {
        address tenant = makeAddr("event_tenant");
        // First CREATE out of the factory — read the factory's real nonce rather than
        // assuming 0, so the pre-computed address is exactly what the chain will produce.
        // (A stage-2 sign-up flow would use this same trick to show the user their
        // incoming contract address before the tx confirms.)
        uint256 factoryNonce = vm.getNonce(address(factory));
        address expectedInstance = vm.computeCreateAddress(address(factory), factoryNonce);

        vm.expectEmit(true, true, false, true, address(factory));
        emit ASCTreasuryFactory.TreasuryDeployed(
            expectedInstance,
            tenant,
            defaultGuardrails().maxTradeSize,
            defaultGuardrails().maxSlippageBps,
            defaultGuardrails().minArbWidthBps,
            defaultGuardrails().maxDriftBps,
            defaultGuardrails().maxConfirmGapBlocks,
            defaultGuardrails().maxActionsPerEpoch,
            defaultGuardrails().epochLength
        );

        ASCTreasuryJournal deployed = factory.createTreasury(tenant, defaultGuardrails());
        assertEq(address(deployed), expectedInstance, "CREATE address must match the pre-computation");
    }

    // -------------------------------------------------------------------
    // Immutability per instance (the non-negotiable): two instances with
    // different guardrails must carry those differences forever, and there
    // must be NO surface on the instance for anyone (owner included) to
    // change them after deployment.
    // -------------------------------------------------------------------

    function test_GuardrailsAreImmutableAndPerInstance() public {
        address tenantA = makeAddr("tenant_a");
        address tenantB = makeAddr("tenant_b");

        ASCTreasuryJournal a = factory.createTreasury(tenantA, defaultGuardrails());
        ASCTreasuryJournal b = factory.createTreasury(tenantB, tenantBGuardrails());

        // Instances are distinct and carry their own values.
        assertTrue(address(a) != address(b), "two deployments must never share an address");
        assertEq(a.MAX_TRADE_SIZE(), 5e6, "tenant A trade cap");
        assertEq(b.MAX_TRADE_SIZE(), 10e6, "tenant B trade cap");
        assertEq(a.MAX_SLIPPAGE_BPS(), 150, "tenant A slippage");
        assertEq(b.MAX_SLIPPAGE_BPS(), 200, "tenant B slippage");
        assertEq(a.MAX_DRIFT_BPS(), 100, "tenant A drift");
        assertEq(b.MAX_DRIFT_BPS(), 150, "tenant B drift");
        assertEq(a.MAX_ACTIONS_PER_EPOCH(), 6, "tenant A rate limit");
        assertEq(b.MAX_ACTIONS_PER_EPOCH(), 3, "tenant B rate limit");

        // Repeated reads are stable — they are immutables, not one-shot config.
        assertEq(a.MAX_ACTIONS_PER_EPOCH(), 6, "immutables must not change between reads");
        assertEq(b.MAX_ACTIONS_PER_EPOCH(), 3, "immutables must not change between reads");

        // No setter surface exists: probing the obvious selector must fail even as the owner.
        bytes4 setter =
            bytes4(keccak256("setGuardrails((uint256,uint256,uint256,uint256,uint256,uint256,uint256))"));
        vm.prank(tenantA);
        (bool setterOk,) = address(a).call(abi.encodeWithSelector(setter, defaultGuardrails()));
        assertFalse(setterOk, "no setGuardrails surface may exist on an instance");
    }
// -------------------------------------------------------------------
    // Non-interference: real executions on one instance must leave a second
    // instance's journal, balances, epoch counters, and rate-limit state
    // completely untouched.
    // -------------------------------------------------------------------

    function test_TwoInstancesDoNotInterfere() public {
        address tenantA = makeAddr("tenant_a");
        address tenantB = makeAddr("tenant_b");

        ASCTreasuryJournal a = factory.createTreasury(tenantA, defaultGuardrails());
        ASCTreasuryJournal b = factory.createTreasury(tenantB, tenantBGuardrails());

        // Both tenants fund and register submitters for THEIR OWN instance only.
        usdc.mint(address(a), 100e6);
        usdc.mint(address(b), 200e6);
        vm.prank(tenantA);
        a.registerAgent(agent);
        vm.prank(tenantB);
        b.registerAgent(agent);

        // Execute one fully-valid arbitrage against instance A.
        (
            ASCTreasuryJournal.ProofData memory src,
            ASCTreasuryJournal.ProofData memory confirm,
            uint256 srcPrice,
            uint256 confPrice
        ) = buildHappyPathProofs(0);
        bytes32 factKey = factKeyOf(src);
        uint256 nonce = deterministicNonce(factKey, srcPrice, confPrice);

        uint256 aUsdcBefore = usdc.balanceOf(address(a));
        uint256 bUsdcBefore = usdc.balanceOf(address(b));

        vm.prank(agent);
        a.executeArbitrage(src, confirm, nonce, keccak256("tenant A run"));

        // A moved funds and journaled; B did neither.
        assertEq(a.journalLength(), 1, "A must journal its execution");
        assertLt(usdc.balanceOf(address(a)), aUsdcBefore, "A's funds must move");
        assertEq(b.journalLength(), 0, "B's journal must stay empty");
        assertEq(usdc.balanceOf(address(b)), bUsdcBefore, "B's funds must stay untouched");

        // Epoch rate-limit accounting is per-instance, not shared.
        uint256 epoch = block.timestamp / a.EPOCH_LENGTH();
        assertEq(a.actionsInEpoch(epoch), 1, "A's epoch counter increments");
        assertEq(b.actionsInEpoch(epoch), 0, "B's epoch counter must stay zero");

        // And a replay against A does not touch B's journal either (reverts on A only).
        vm.prank(agent);
        vm.expectRevert(ASCTreasuryJournal.ActionAlreadyExecuted.selector);
        a.executeArbitrage(src, confirm, nonce, keccak256("replay on A"));
        assertEq(b.journalLength(), 0, "B still unaffected after A's replay revert");
    }

    // -------------------------------------------------------------------
    // Invalid inputs: neither the factory nor a direct deployment may ever
    // produce an instance carrying zero/nonsensical guardrails, and the
    // factory must refuse nonsense chain configs.
    // -------------------------------------------------------------------

    function test_FactoryRevertsOnZeroGuardrails() public {
        ASCTreasuryJournal.Guardrails memory bad = defaultGuardrails();
        bad.maxTradeSize = 0;
        vm.expectRevert(ASCTreasuryFactory.InvalidGuardrails.selector);
        factory.createTreasury(makeAddr("z"), bad);

        bad = defaultGuardrails();
        bad.maxSlippageBps = 0;
        vm.expectRevert(ASCTreasuryFactory.InvalidGuardrails.selector);
        factory.createTreasury(makeAddr("z"), bad);

        bad = defaultGuardrails();
        bad.maxActionsPerEpoch = 0;
        vm.expectRevert(ASCTreasuryFactory.InvalidGuardrails.selector);
        factory.createTreasury(makeAddr("z"), bad);

        bad = defaultGuardrails();
        bad.maxSlippageBps = 10_001; // over BPS_DENOMINATOR — impossible bps
        vm.expectRevert(ASCTreasuryFactory.InvalidGuardrails.selector);
        factory.createTreasury(makeAddr("z"), bad);
    }

    function test_DirectTreasuryDeploymentWithInvalidGuardrailsReverts() public {
        // The constructor is the authority: an instance with bad bounds must not be able
        // to exist even when deployed OUTSIDE the factory.
        ASCTreasuryJournal.Guardrails memory bad = defaultGuardrails();
        bad.epochLength = 0;
        vm.expectRevert(ASCTreasuryJournal.InvalidGuardrails.selector);
        new ASCTreasuryJournal(
            address(verifier),
            address(router),
            address(usdc),
            address(quote),
            address(priceSource),
            makeAddr("direct"),
            bad
        );
    }

    function test_FactoryRevertsOnInvalidChainConfig() public {
        vm.expectRevert(ASCTreasuryFactory.InvalidChainConfig.selector);
        new ASCTreasuryFactory(address(0), address(router), address(usdc), address(quote), address(priceSource));

        vm.expectRevert(ASCTreasuryFactory.InvalidChainConfig.selector);
        new ASCTreasuryFactory(address(verifier), address(router), address(usdc), address(0), address(priceSource));
    }
}