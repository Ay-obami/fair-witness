#!/usr/bin/env bash
# Fetch exact reviewed contract dependencies into contracts/lib/ (gitignored).
# Pinning matters because the deployed lifecycle factory commits to the exact
# FairWitnessTreasury creation-code hash.
set -euo pipefail
cd "$(dirname "$0")"

FORGE_STD_REV="7fdf81f9ceb2f6ebbb8f9f1c6c5274d5bcc9a1f5"
OPENZEPPELIN_REV="6bc7bf38645e87468779c8118f6ba4b8bc6d4067"

rm -rf lib/forge-std lib/openzeppelin-contracts
forge install --no-git "foundry-rs/forge-std@${FORGE_STD_REV}"
forge install --no-git "OpenZeppelin/openzeppelin-contracts@${OPENZEPPELIN_REV}"

printf 'Pinned Foundry dependencies:\n  forge-std %s\n  openzeppelin-contracts %s\n' \
  "$FORGE_STD_REV" "$OPENZEPPELIN_REV"
