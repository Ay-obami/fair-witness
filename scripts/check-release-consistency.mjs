import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const read = (path) => readFileSync(resolve(root, path), "utf8");
const manifestPath = "contracts/deployments/controlled-demo-schema-v1-lifecycle.json";
const manifest = JSON.parse(read(manifestPath));

const current = {
  factory: manifest.destination?.factory,
  factoryDeploymentBlock: String(manifest.destination?.factoryDeploymentBlock ?? ""),
  faucet: manifest.destination?.faucet,
  adapter: manifest.destination?.adapter,
  validator: manifest.destination?.validator,
  sourceObserver: manifest.source?.observer,
  sourcePool: manifest.source?.pool,
};

for (const [name, value] of Object.entries(current)) {
  if (!value) throw new Error(`${manifestPath} is missing ${name}`);
}

const files = {
  readme: read("README.md"),
  runbook: read("docs/CONTROLLED_DEMO_RUNBOOK.md"),
  deployment: read("docs/DEPLOYMENT.md"),
  checklist: read("docs/PRE_SUBMISSION_CHECKLIST.md"),
  agentEnv: read("agent/.env.example"),
  frontendEnv: read("frontend/.env.example"),
  frontendConfig: read("frontend/src/lib/config.ts"),
  controlledDemo: read("frontend/src/lib/controlledDemo.ts"),
  runner: read("agent/src/schemaV1ProductRunner.ts"),
};

function requireText(fileName, content, value, description) {
  if (!content.includes(value)) {
    throw new Error(`${fileName} is missing ${description}: ${value}`);
  }
}

for (const [name, content] of [
  ["README.md", files.readme],
  ["docs/CONTROLLED_DEMO_RUNBOOK.md", files.runbook],
  ["docs/DEPLOYMENT.md", files.deployment],
  ["docs/PRE_SUBMISSION_CHECKLIST.md", files.checklist],
]) {
  requireText(name, content, current.factory, "current factory");
  requireText(name, content, current.faucet, "current faucet");
  requireText(name, content, current.factoryDeploymentBlock, "current factory deployment block");
}

requireText("agent/.env.example", files.agentEnv, `FACTORY_ADDRESS=${current.factory}`, "current factory");
requireText("agent/.env.example", files.agentEnv, `FACTORY_DEPLOYMENT_BLOCK=${current.factoryDeploymentBlock}`, "current deployment block");
requireText("frontend/.env.example", files.frontendEnv, `VITE_FACTORY_ADDRESS=${current.factory}`, "current factory");
requireText("frontend/.env.example", files.frontendEnv, `VITE_FACTORY_DEPLOYMENT_BLOCK=${current.factoryDeploymentBlock}`, "current deployment block");
requireText("frontend/.env.example", files.frontendEnv, `VITE_DEMO_FAUCET_ADDRESS=${current.faucet}`, "current faucet");

for (const [name, content] of [["frontend/src/lib/config.ts", files.frontendConfig], ["frontend/src/lib/controlledDemo.ts", files.controlledDemo]]) {
  requireText(name, content, current.factory, "current factory");
  requireText(name, content, current.faucet, "current faucet");
}

requireText(
  "agent/src/schemaV1ProductRunner.ts",
  files.runner,
  "controlled-demo-schema-v1-lifecycle.json",
  "canonical lifecycle manifest",
);

const historicalFactory = manifest.previous?.factory;
if (historicalFactory) {
  for (const [name, content] of [
    ["agent/.env.example", files.agentEnv],
    ["frontend/.env.example", files.frontendEnv],
    ["frontend/src/lib/config.ts", files.frontendConfig],
  ]) {
    if (content.includes(historicalFactory)) {
      throw new Error(`${name} still contains historical factory ${historicalFactory}`);
    }
  }
}

console.log("release consistency: OK", current);
