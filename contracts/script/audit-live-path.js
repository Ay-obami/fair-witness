// Read-only readiness audit for the Sepolia -> Creditcoin-testnet Fair Witness path.
//
// Usage:
//   cd contracts && node script/audit-live-path.js
//
// This script accepts no private keys, never signs, and never broadcasts. It exits 2
// while a required source pool or other deployment precondition is missing.
const fs = require("fs");
const path = require("path");

function resolveEthers() {
  const candidates = [
    path.join(__dirname, "..", "..", "agent", "node_modules", "ethers"),
    path.join(__dirname, "..", "..", "node_modules", "ethers"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(candidate, "package.json"))) return require(candidate);
  }
  return require("ethers");
}

const ethers = resolveEthers();

function configuredUrls(primaryName, listName, defaults) {
  return [process.env[primaryName], ...(process.env[listName] ?? "").split(","), ...defaults]
    .map((value) => value?.trim())
    .filter((value, index, all) => Boolean(value) && all.indexOf(value) === index);
}

const SEPOLIA_RPC_URLS = configuredUrls("SEPOLIA_RPC_URL", "SEPOLIA_RPC_URLS", [
  "https://ethereum-sepolia-rpc.publicnode.com",
  "https://1rpc.io/sepolia",
  "https://gateway.tenderly.co/public/sepolia",
]);
const CREDITCOIN_RPC_URLS = configuredUrls("CC_RPC", "CC_RPC_URLS", [
  "https://rpc.cc3-testnet.creditcoin.network",
]);

const CONFIG = Object.freeze({
  sepolia: {
    chainId: 11155111n,
    attestcoinChainKey: 1n,
    factory: "0x0227628f3F023bb0B980b67D528571c95c6DaC1c",
    stable: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
    wctc: "0x9cE462d2B56C385d0B15AEFc74413896AEa34F2d",
    nttManager: "0x84be3c8f42d98b8b33504b14ae2309e6896faa41",
    wormholeChainId: 10002n,
    candidateFees: [100n, 500n, 3000n, 10000n],
  },
  creditcoin: {
    chainId: 102031n,
    blockProver: "0x0000000000000000000000000000000000000FD2",
    chainInfo: "0x0000000000000000000000000000000000000FD3",
    factory: "0xEcc68469F9c015A217215E19Fb6a183FE27aD1E9",
    router: "0x3f65634837F914F18dBc4Db3E9d8Aa8F547f3229",
    pool: "0x04a3227587a1D2b79f8AFE6F0e361fAbD6EEB6E9",
    wctc: "0x56072113e08015e1c40A3F3f656b1C1Fa78E329E",
    stable: "0xa1Cc4d7aa040eA903fd00c13E7b43f8e26cbB7F8",
    fee: 500n,
    wormholeChainId: 59n,
  },
  oracle: { twapWindowSeconds: 300, minimumCardinality: 16, maxProofAgeBlocks: 64, maxConfirmGapBlocks: 12 },
});

const FACTORY_ABI = ["function getPool(address,address,uint24) view returns (address)"];
const POOL_ABI = [
  "function factory() view returns (address)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function fee() view returns (uint24)",
  "function liquidity() view returns (uint128)",
  "function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)",
  "function observe(uint32[]) view returns (int56[],uint160[])",
];
const TOKEN_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function minter() view returns (address)",
  "function owner() view returns (address)",
];
const BASIC_TOKEN_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
];
const ROUTER_ABI = ["function factory() view returns (address)"];
const NTT_MANAGER_ABI = [
  "function chainId() view returns (uint16)",
  "function token() view returns (address)",
  "function getMode() view returns (uint8)",
  "function getThreshold() view returns (uint8)",
  "function getPeer(uint16) view returns ((bytes32 peerAddress,uint8 tokenDecimals))",
];
const CHAIN_INFO_ABI = [
  "function get_latest_attestation_height_and_hash(uint64) view returns ((uint64 height,bytes32 hash,bool isAttestation,bool exists))",
];

function sameAddress(a, b) {
  return ethers.getAddress(a) === ethers.getAddress(b);
}

function bytes32ToAddress(value) {
  return ethers.getAddress(`0x${value.slice(-40)}`);
}

async function selectProvider(label, expectedChainId, urls) {
  let lastError;
  for (const url of urls) {
    try {
      const provider = new ethers.JsonRpcProvider(url, Number(expectedChainId), { staticNetwork: true });
      const network = await provider.getNetwork();
      if (network.chainId !== expectedChainId) {
        throw new Error(`expected chain ${expectedChainId}, received ${network.chainId}`);
      }
      await provider.getBlockNumber();
      return provider;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`${label} RPC selection failed across ${urls.length} endpoint(s): ${lastError}`);
}

async function inspectPool(provider, expected) {
  const pool = new ethers.Contract(expected.pool, POOL_ABI, provider);
  const [code, factory, token0, token1, fee, liquidity, slot0] = await Promise.all([
    provider.getCode(expected.pool),
    pool.factory(),
    pool.token0(),
    pool.token1(),
    pool.fee(),
    pool.liquidity(),
    pool.slot0(),
  ]);
  let observe300 = true;
  let observeError = null;
  try {
    await pool.observe([CONFIG.oracle.twapWindowSeconds, 0]);
  } catch (error) {
    observe300 = false;
    observeError = String(error.shortMessage ?? error.message ?? error).slice(0, 300);
  }
  return {
    address: ethers.getAddress(expected.pool),
    codeBytes: (code.length - 2) / 2,
    identityMatches:
      code !== "0x" && sameAddress(factory, expected.factory) &&
      sameAddress(token0, expected.token0) && sameAddress(token1, expected.token1) && fee === expected.fee,
    factory: ethers.getAddress(factory),
    token0: ethers.getAddress(token0),
    token1: ethers.getAddress(token1),
    fee: fee.toString(),
    liquidity: liquidity.toString(),
    unlocked: slot0[6],
    observationCardinality: Number(slot0[3]),
    observationCardinalityNext: Number(slot0[4]),
    observe300: { succeeds: observe300, error: observeError },
  };
}

async function inspectNttLink(sepoliaProvider, ccProvider) {
  const sourceManager = new ethers.Contract(CONFIG.sepolia.nttManager, NTT_MANAGER_ABI, sepoliaProvider);
  const [sourceCode, sourceChainId, sourceToken, sourceMode, sourceThreshold, ccPeer] = await Promise.all([
    sepoliaProvider.getCode(CONFIG.sepolia.nttManager),
    sourceManager.chainId(),
    sourceManager.token(),
    sourceManager.getMode(),
    sourceManager.getThreshold(),
    sourceManager.getPeer(CONFIG.creditcoin.wormholeChainId),
  ]);
  const ccManagerAddress = bytes32ToAddress(ccPeer.peerAddress);
  const ccManager = new ethers.Contract(ccManagerAddress, NTT_MANAGER_ABI, ccProvider);
  const [ccCode, ccChainId, ccToken, ccMode, ccThreshold, sourcePeer] = await Promise.all([
    ccProvider.getCode(ccManagerAddress),
    ccManager.chainId(),
    ccManager.token(),
    ccManager.getMode(),
    ccManager.getThreshold(),
    ccManager.getPeer(CONFIG.sepolia.wormholeChainId),
  ]);
  const ccPeerBackAddress = bytes32ToAddress(sourcePeer.peerAddress);
  const ccPeerToken = new ethers.Contract(ccToken, TOKEN_ABI, ccProvider);
  const [ccTokenCode, ccTokenName, ccTokenSymbol, ccTokenSupply, ccTokenMinter, ccTokenOwner] = await Promise.all([
    ccProvider.getCode(ccToken),
    ccPeerToken.name(),
    ccPeerToken.symbol(),
    ccPeerToken.totalSupply(),
    ccPeerToken.minter().catch(() => null),
    ccPeerToken.owner().catch(() => null),
  ]);
  return {
    sourceManager: ethers.getAddress(CONFIG.sepolia.nttManager),
    sourceManagerCodeBytes: (sourceCode.length - 2) / 2,
    sourceChainId: sourceChainId.toString(),
    sourceToken: ethers.getAddress(sourceToken),
    sourceMode: Number(sourceMode),
    sourceThreshold: Number(sourceThreshold),
    creditcoinPeer: ccManagerAddress,
    creditcoinPeerTokenDecimals: Number(ccPeer.tokenDecimals),
    creditcoinPeerCodeBytes: (ccCode.length - 2) / 2,
    creditcoinPeerChainId: ccChainId.toString(),
    creditcoinPeerToken: ethers.getAddress(ccToken),
    creditcoinPeerTokenCodeBytes: (ccTokenCode.length - 2) / 2,
    creditcoinPeerTokenMetadata: {
      name: ccTokenName,
      symbol: ccTokenSymbol,
      totalSupply: ccTokenSupply.toString(),
      minter: ccTokenMinter === null ? null : ethers.getAddress(ccTokenMinter),
      owner: ccTokenOwner === null ? null : ethers.getAddress(ccTokenOwner),
    },
    creditcoinPeerMode: Number(ccMode),
    creditcoinPeerThreshold: Number(ccThreshold),
    creditcoinPeerBack: ccPeerBackAddress,
    bidirectionalPeerMatch: sameAddress(ccPeerBackAddress, CONFIG.sepolia.nttManager),
    penguinWctcMatchesPeerToken: sameAddress(ccToken, CONFIG.creditcoin.wctc),
  };
}

function artifact(relativePath) {
  const fullPath = path.join(__dirname, "..", relativePath);
  if (!fs.existsSync(fullPath)) return { path: relativePath, exists: false };
  const value = JSON.parse(fs.readFileSync(fullPath, "utf8"));
  return {
    path: relativePath,
    exists: true,
    creationBytecodeBytes: (value.bytecode.object.length - 2) / 2,
    runtimeBytecodeBytes: (value.deployedBytecode.object.length - 2) / 2,
  };
}

async function main() {
  const [sepoliaProvider, ccProvider] = await Promise.all([
    selectProvider("Sepolia", CONFIG.sepolia.chainId, SEPOLIA_RPC_URLS),
    selectProvider("Creditcoin", CONFIG.creditcoin.chainId, CREDITCOIN_RPC_URLS),
  ]);
  const sourceFactory = new ethers.Contract(CONFIG.sepolia.factory, FACTORY_ABI, sepoliaProvider);
  const sourceToken = new ethers.Contract(CONFIG.sepolia.wctc, TOKEN_ABI, sepoliaProvider);
  const sourceStable = new ethers.Contract(CONFIG.sepolia.stable, TOKEN_ABI, sepoliaProvider);
  const destinationFactory = new ethers.Contract(CONFIG.creditcoin.factory, FACTORY_ABI, ccProvider);
  const destinationWctc = new ethers.Contract(CONFIG.creditcoin.wctc, BASIC_TOKEN_ABI, ccProvider);
  const router = new ethers.Contract(CONFIG.creditcoin.router, ROUTER_ABI, ccProvider);
  const chainInfo = new ethers.Contract(CONFIG.creditcoin.chainInfo, CHAIN_INFO_ABI, ccProvider);

  const [sourceHead, sourceFactoryCode, sourceTokenCode, sourceTokenName, sourceTokenSymbol,
    sourceTokenDecimals, sourceTokenSupply, sourceTokenMinter, sourceTokenOwner, stableCode,
    stableDecimals, destinationFactoryPool, routerCode, routerFactory, latestAttestation,
    blockProverProbe, sourcePools, destinationWctcCode, destinationWctcName,
    destinationWctcSymbol, destinationWctcDecimals, destinationWctcSupply,
    destinationWctcNativeBalance, destinationWctcAddressOnSepoliaCode] = await Promise.all([
    sepoliaProvider.getBlockNumber(),
    sepoliaProvider.getCode(CONFIG.sepolia.factory),
    sepoliaProvider.getCode(CONFIG.sepolia.wctc),
    sourceToken.name(),
    sourceToken.symbol(),
    sourceToken.decimals(),
    sourceToken.totalSupply(),
    sourceToken.minter(),
    sourceToken.owner(),
    sepoliaProvider.getCode(CONFIG.sepolia.stable),
    sourceStable.decimals(),
    destinationFactory.getPool(CONFIG.creditcoin.wctc, CONFIG.creditcoin.stable, CONFIG.creditcoin.fee),
    ccProvider.getCode(CONFIG.creditcoin.router),
    router.factory(),
    chainInfo.get_latest_attestation_height_and_hash(CONFIG.sepolia.attestcoinChainKey),
    ccProvider.call({ to: CONFIG.creditcoin.blockProver, data: "0xdeadbeef" }).then(
      () => ({ rejectsUnknownSelector: false }),
      (error) => ({ rejectsUnknownSelector: String(error.shortMessage ?? error.message ?? error).includes("Unknown selector") })
    ),
    Promise.all(CONFIG.sepolia.candidateFees.map(async (fee) => ({
      fee: fee.toString(),
      pool: await sourceFactory.getPool(CONFIG.sepolia.stable, CONFIG.sepolia.wctc, fee),
    }))),
    ccProvider.getCode(CONFIG.creditcoin.wctc),
    destinationWctc.name(),
    destinationWctc.symbol(),
    destinationWctc.decimals(),
    destinationWctc.totalSupply(),
    ccProvider.getBalance(CONFIG.creditcoin.wctc),
    sepoliaProvider.getCode(CONFIG.creditcoin.wctc),
  ]);

  const destinationPool = await inspectPool(ccProvider, {
    pool: CONFIG.creditcoin.pool,
    factory: CONFIG.creditcoin.factory,
    token0: CONFIG.creditcoin.wctc,
    token1: CONFIG.creditcoin.stable,
    fee: CONFIG.creditcoin.fee,
  });
  const artifacts = [
    artifact("out/EthereumV3MarketObserver.sol/EthereumV3MarketObserver.json"),
    artifact("out/VerifiedMarketFactValidator.sol/VerifiedMarketFactValidator.json"),
    artifact("out/PenguinV3Adapter.sol/PenguinV3Adapter.json"),
    artifact("out/FairWitnessTreasuryFactory.sol/FairWitnessTreasuryFactory.json"),
  ];
  const nttLink = await inspectNttLink(sepoliaProvider, ccProvider);
  const linkedDestinationPools = await Promise.all(CONFIG.sepolia.candidateFees.map(async (fee) => ({
    fee: fee.toString(),
    pool: await destinationFactory.getPool(nttLink.creditcoinPeerToken, CONFIG.creditcoin.stable, fee),
  })));

  const nonzeroSourcePools = sourcePools.filter(({ pool }) => pool !== ethers.ZeroAddress);
  const nonzeroLinkedDestinationPools = linkedDestinationPools.filter(({ pool }) => pool !== ethers.ZeroAddress);
  const blockers = [];
  if (sourceFactoryCode === "0x" || sourceTokenCode === "0x" || stableCode === "0x") blockers.push("Sepolia source contract code missing");
  if (sourceTokenName !== "Wrapped CTC" || sourceTokenSymbol !== "WCTC" || sourceTokenDecimals !== 18n) blockers.push("Sepolia WCTC metadata mismatch");
  if (sourceTokenSupply === 0n) blockers.push("Sepolia representation of PenguinSwap WCTC has zero supply");
  if (nttLink.sourceMode === 1 && !sameAddress(sourceTokenMinter, CONFIG.sepolia.nttManager)) {
    blockers.push(`Sepolia WCTC burn/mint NTT manager is not token minter; current minter is ${ethers.getAddress(sourceTokenMinter)}`);
  }
  if (stableDecimals !== 6n) blockers.push("Sepolia USDC decimals mismatch");
  if (nttLink.sourceManagerCodeBytes === 0 || nttLink.creditcoinPeerCodeBytes === 0 ||
      nttLink.sourceChainId !== CONFIG.sepolia.wormholeChainId.toString() ||
      nttLink.creditcoinPeerChainId !== CONFIG.creditcoin.wormholeChainId.toString() ||
      !sameAddress(nttLink.sourceToken, CONFIG.sepolia.wctc) || !nttLink.bidirectionalPeerMatch) {
    blockers.push("Sepolia/Creditcoin WCTC NTT peer configuration invalid");
  }
  if (!nttLink.penguinWctcMatchesPeerToken) {
    blockers.push(`Sepolia WCTC peer token ${nttLink.creditcoinPeerToken} does not match PenguinSwap WCTC ${CONFIG.creditcoin.wctc}`);
  }
  if (nonzeroLinkedDestinationPools.length === 0) {
    blockers.push("no PenguinSwap USD-TCoin pool exists for the Creditcoin token linked to Sepolia WCTC at fee 100, 500, 3000, or 10000");
  }
  if (nonzeroSourcePools.length === 0) blockers.push("no Sepolia Uniswap V3 USDC/WCTC pool exists at fee 100, 500, 3000, or 10000");
  if (!sameAddress(destinationFactoryPool, CONFIG.creditcoin.pool)) blockers.push("destination factory/pool mismatch");
  if (routerCode === "0x" || !sameAddress(routerFactory, CONFIG.creditcoin.factory)) blockers.push("destination router provenance mismatch");
  if (!destinationPool.identityMatches || !destinationPool.unlocked || BigInt(destinationPool.liquidity) === 0n) blockers.push("destination pool state/configuration invalid");
  if (destinationPool.observationCardinality < CONFIG.oracle.minimumCardinality) blockers.push(`destination cardinality ${destinationPool.observationCardinality} < ${CONFIG.oracle.minimumCardinality}`);
  if (!latestAttestation.exists || !latestAttestation.isAttestation) blockers.push("Attestcoin Sepolia chain key 1 has no latest attestation");
  if (!blockProverProbe.rejectsUnknownSelector) blockers.push("BlockProver precompile behavior not recognized");
  if (artifacts.some((value) => !value.exists || value.creationBytecodeBytes === 0)) blockers.push("deployment artifact missing");

  const report = {
    generatedAt: new Date().toISOString(),
    mode: "READ_ONLY_NO_BROADCAST",
    chains: { source: { name: "Sepolia", chainId: "11155111", attestcoinChainKey: "1" }, destination: { name: "Creditcoin testnet", chainId: "102031" } },
    source: {
      factory: CONFIG.sepolia.factory,
      stable: CONFIG.sepolia.stable,
      wctc: CONFIG.sepolia.wctc,
      wctcMetadata: {
        name: sourceTokenName,
        symbol: sourceTokenSymbol,
        decimals: Number(sourceTokenDecimals),
        totalSupply: sourceTokenSupply.toString(),
        minter: ethers.getAddress(sourceTokenMinter),
        owner: ethers.getAddress(sourceTokenOwner),
      },
      candidatePools: sourcePools.map(({ fee, pool }) => ({ fee, pool: ethers.getAddress(pool) })),
      nttLink,
    },
    destination: {
      pool: destinationPool,
      router: CONFIG.creditcoin.router,
      factory: ethers.getAddress(routerFactory),
      wctcMetadata: {
        address: ethers.getAddress(CONFIG.creditcoin.wctc),
        codeBytes: (destinationWctcCode.length - 2) / 2,
        name: destinationWctcName,
        symbol: destinationWctcSymbol,
        decimals: Number(destinationWctcDecimals),
        totalSupply: destinationWctcSupply.toString(),
        nativeBackingBalance: destinationWctcNativeBalance.toString(),
        supplyEqualsNativeBacking: destinationWctcSupply === destinationWctcNativeBalance,
        sameAddressCodeBytesOnSepolia: (destinationWctcAddressOnSepoliaCode.length - 2) / 2,
      },
      linkedWctcCandidatePools: linkedDestinationPools.map(({ fee, pool }) => ({ fee, pool: ethers.getAddress(pool) })),
    },
    attestcoin: {
      sourceHead: sourceHead.toString(),
      latestHeight: latestAttestation.height.toString(),
      lagBlocks: latestAttestation.exists ? (BigInt(sourceHead) - latestAttestation.height).toString() : null,
      exists: latestAttestation.exists,
      isAttestation: latestAttestation.isAttestation,
      blockProverRejectsUnknownSelector: blockProverProbe.rejectsUnknownSelector,
    },
    artifacts,
    blockers,
    nextRequiredDecision: sourceTokenSupply === 0n ||
      (nttLink.sourceMode === 1 && !sameAddress(sourceTokenMinter, CONFIG.sepolia.nttManager))
      ? "The external NTT owner must activate the Sepolia representation and assign its burn/mint manager before tokens can be bridged. Do not create or fund a source pool until live state proves this is operational."
      : !nttLink.penguinWctcMatchesPeerToken
      ? "Identify a Sepolia representation provably linked to PenguinSwap WCTC, or a Creditcoin market for the NTT-linked peer token. Do not infer asset identity from the WCTC ticker."
      : nonzeroSourcePools.length === 0
        ? "Create and honestly label a controlled Sepolia USDC/WCTC Uniswap V3 pool, or select another verified comparable Sepolia market. Do not substitute WETH/USDC for WCTC/USD."
        : "Verify candidate pool liquidity, activity, cardinality, token access, and price semantics before freezing it.",
    ready: blockers.length === 0,
  };
  console.log(JSON.stringify(report, null, 2));
  if (blockers.length > 0) process.exitCode = 2;
}

main().catch((error) => {
  console.error(`READINESS AUDIT FAILED: ${error.stack ?? error}`);
  process.exit(1);
});
