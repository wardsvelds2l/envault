#!/usr/bin/env bash
# multi-env.sh — bootstrap a project with three separate vaults.
#
# Use case: you have a project that deploys to dev, staging, and
# production with different secrets in each. Keeping all secrets in a
# single vault means everyone with the dev password can also read
# production, which is rarely what you want.
#
# This script creates three vault files with three different master
# passwords and walks you through adding one variable to each. Edit
# the `add` lines to match your real secrets.
#
# Usage:
#   ./examples/multi-env.sh
#
# After running, commit all three vault files. The CI workflows for
# each environment will load the matching master password from a
# distinct secret.
set -euo pipefail

ENVAULT="${ENVAULT:-envault}"

if ! command -v "$ENVAULT" >/dev/null 2>&1; then
  echo "envault not found in PATH. Install it with: npm install -g envault" >&2
  exit 1
fi

VAULT_DIR="${VAULT_DIR:-.}"

prompt_password() {
  local label="$1"
  local pw1 pw2
  while true; do
    read -r -s -p "Master password for ${label} vault: " pw1
    echo
    read -r -s -p "Confirm: " pw2
    echo
    if [[ "$pw1" == "$pw2" && -n "$pw1" ]]; then
      printf '%s' "$pw1"
      return 0
    fi
    echo "Passwords do not match (or were empty). Try again." >&2
  done
}

add_var() {
  local vault_file="$1"
  local key="$2"
  local value="$3"
  if [[ -z "$value" ]]; then
    echo "Skipping $key (no value provided)." >&2
    return 0
  fi
  ENVVAULT_PASSWORD="$4" "$ENVAULT" --vault "$vault_file" add "$key=$value"
}

echo "==> Creating dev vault (.env.vault.dev)"
DEV_PW="$(prompt_password dev)"
ENVVAULT_PASSWORD="$DEV_PW" "$ENVAULT" --vault "$VAULT_DIR/.env.vault.dev" init

echo
echo "==> Creating staging vault (.env.vault.staging)"
STAGING_PW="$(prompt_password staging)"
ENVVAULT_PASSWORD="$STAGING_PW" "$ENVAULT" --vault "$VAULT_DIR/.env.vault.staging" init

echo
echo "==> Creating production vault (.env.vault.production)"
PROD_PW="$(prompt_password production)"
ENVVAULT_PASSWORD="$PROD_PW" "$ENVAULT" --vault "$VAULT_DIR/.env.vault.production" init

echo
echo "==> Adding one variable per vault"
read -r -p "DATABASE_URL for dev (e.g. postgres://localhost/dev): " DEV_DB
add_var "$VAULT_DIR/.env.vault.dev"        DATABASE_URL "$DEV_DB"   "$DEV_PW"

read -r -p "DATABASE_URL for staging: " STG_DB
add_var "$VAULT_DIR/.env.vault.staging"    DATABASE_URL "$STG_DB"   "$STAGING_PW"

read -r -p "DATABASE_URL for production: " PRD_DB
add_var "$VAULT_DIR/.env.vault.production" DATABASE_URL "$PRD_DB"   "$PROD_PW"

cat <<EOF

Done. You now have three independent vaults:

  $VAULT_DIR/.env.vault.dev
  $VAULT_DIR/.env.vault.staging
  $VAULT_DIR/.env.vault.production

Each has its own master password. Commit all three files. In CI, set
the matching password as ENVVAULT_PASSWORD for the right job:

  dev job       -> ENVVAULT_PASSWORD=<dev password>     envault --vault .env.vault.dev run -- npm test
  staging job   -> ENVVAULT_PASSWORD=<staging password> envault --vault .env.vault.staging run -- npm test
  production    -> ENVVAULT_PASSWORD=<prod password>    envault --vault .env.vault.production run -- deploy.sh

Store the three passwords in your password manager under separate
entries. Rotate them on a schedule (see ../examples/rotate-after-compromise.md).
EOF
