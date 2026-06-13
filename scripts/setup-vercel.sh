#!/bin/sh
# One-shot Vercel project setup for this repo.
#
# Prereqs you have to do yourself (interactive — no script can automate):
#   1. Sign up at https://vercel.com (free Hobby tier).
#   2. `npx vercel login` — browser OAuth.
#
# Then run:   npm run vercel:setup
#       or:   sh scripts/setup-vercel.sh
#
# What this script does:
#   - Verifies you're logged into the Vercel CLI.
#   - Links this checkout to a Vercel project (creates .vercel/project.json,
#     which is gitignored — no account IDs leak into the repo).
#   - Reads ANTHROPIC_API_KEY from your shell env or local .env.
#   - Uploads it to production / preview / development scopes, skipping any
#     scope where it's already set.
#   - Triggers a production deploy.
#
# Re-running is safe: link is skipped if already linked, env-var upload is
# skipped per-scope if the var is already present.

set -e

# Use npx so we don't force a global Vercel install, and don't bloat
# devDependencies for contributors who aren't deploying.
VERCEL="npx --yes vercel"

# ----- 1. Login check -----
if ! $VERCEL whoami >/dev/null 2>&1; then
  echo "Not logged into Vercel CLI."
  echo "Run:   npx vercel login"
  echo "...then re-run this script."
  exit 1
fi
echo "✓ Logged in as $($VERCEL whoami 2>/dev/null)"

# ----- 2. Link this checkout to a Vercel project -----
if [ -f .vercel/project.json ]; then
  echo "✓ Already linked (.vercel/project.json exists)"
else
  echo "▶ Linking project…"
  $VERCEL link --yes
fi

# ----- 3. Read the Anthropic API key -----
if [ -z "$ANTHROPIC_API_KEY" ] && [ -f .env ]; then
  ANTHROPIC_API_KEY=$(grep -m1 '^ANTHROPIC_API_KEY=' .env 2>/dev/null \
    | sed -e 's/^ANTHROPIC_API_KEY=//' -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'\$//")
fi
if [ -z "$ANTHROPIC_API_KEY" ]; then
  echo "ANTHROPIC_API_KEY not found in shell env or .env."
  echo "Set it and re-run:"
  echo "  export ANTHROPIC_API_KEY=sk-ant-..."
  exit 1
fi

# Sanity-check shape; just a length floor — Anthropic keys are far longer than 30 chars.
key_len=${#ANTHROPIC_API_KEY}
if [ "$key_len" -lt 30 ]; then
  echo "ANTHROPIC_API_KEY looks too short ($key_len chars). Aborting before uploading."
  exit 1
fi

# ----- 4. Upload to each scope, skipping ones already set -----
for scope in production preview development; do
  if $VERCEL env ls "$scope" 2>/dev/null | grep -q '^ ANTHROPIC_API_KEY \|^ANTHROPIC_API_KEY '; then
    echo "✓ $scope already has ANTHROPIC_API_KEY (skip)"
  else
    echo "▶ Adding ANTHROPIC_API_KEY to $scope…"
    printf '%s\n' "$ANTHROPIC_API_KEY" | $VERCEL env add ANTHROPIC_API_KEY "$scope"
  fi
done

# ----- 5. First production deploy -----
echo "▶ Deploying to production…"
$VERCEL deploy --prod

echo
echo "Done. Verify with:  curl <your-deploy-url>/api/health"
