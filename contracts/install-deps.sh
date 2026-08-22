#!/usr/bin/env bash
# Fetches contract dependencies into contracts/lib/ (gitignored, not vendored).
# Run once after cloning, before `forge build` / `forge test`.
set -euo pipefail
cd "$(dirname "$0")"

forge install --no-git foundry-rs/forge-std
forge install --no-git OpenZeppelin/openzeppelin-contracts

echo "Dependencies installed into contracts/lib/"
