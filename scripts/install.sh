#!/bin/sh
# Install Career Atlas on macOS or Linux for a person or an AI assistant.
# Downloads the official Node.js 24 build into a private folder when no
# suitable Node exists, clones or updates the checkout, initializes private storage, builds the app, starts
# it, and installs assistant shortcuts for any agent it can detect.
#
#   curl -fsSL https://raw.githubusercontent.com/grahamnotgrant/career-atlas/main/scripts/install.sh | sh
#
# Environment: CAREER_ATLAS_DIR (checkout, default ~/career-atlas),
# CAREER_ATLAS_NODE (private Node folder), CAREER_FLOW_DATA (private data
# folder, default per platform), PORT.
set -eu

REPO="${CAREER_ATLAS_REPO:-https://github.com/grahamnotgrant/career-atlas.git}"
DIR="${CAREER_ATLAS_DIR:-$HOME/career-atlas}"
NEED=24

say() { printf '\n==> %s\n' "$*"; }
fail() { printf 'Career Atlas install stopped: %s\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }
major() { "$1" -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }

case "$(uname -s)" in
  Darwin|Linux) ;;
  *) fail "this script supports macOS and Linux. On Windows, install Node.js 24 from nodejs.org and Git, then follow README.md." ;;
esac

have git || fail "Git is required. macOS: run 'xcode-select --install'. Linux: install the git package, then rerun."

# Node: use an existing 24+, otherwise download the official Node.js build
# into a private folder and verify its published checksum. Nothing outside
# that folder changes; no package manager or third-party installer runs.
NODE_HOME="${CAREER_ATLAS_NODE:-$HOME/.local/share/career-atlas/node}"
if [ -x "$NODE_HOME/bin/node" ] && [ "$(major "$NODE_HOME/bin/node")" -ge "$NEED" ]; then
  PATH="$NODE_HOME/bin:$PATH"; export PATH
fi
if have node && [ "$(major node)" -ge "$NEED" ]; then
  say "Node $(node -v) found"
else
  case "$(uname -s)-$(uname -m)" in
    Darwin-arm64) PLATFORM=darwin-arm64 ;;
    Darwin-x86_64) PLATFORM=darwin-x64 ;;
    Linux-x86_64) PLATFORM=linux-x64 ;;
    Linux-aarch64|Linux-arm64) PLATFORM=linux-arm64 ;;
    *) fail "no official Node.js $NEED build for $(uname -s) $(uname -m); install Node $NEED yourself and rerun." ;;
  esac
  say "Downloading Node.js $NEED ($PLATFORM) into $NODE_HOME"
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  curl -fsSL "https://nodejs.org/dist/latest-v$NEED.x/SHASUMS256.txt" -o "$TMP/SHASUMS256.txt"
  TARBALL="$(grep -o "node-v$NEED\.[0-9.]*-$PLATFORM\.tar\.gz" "$TMP/SHASUMS256.txt" | head -n 1)"
  [ -n "$TARBALL" ] || fail "could not find a Node $NEED build for $PLATFORM in the published checksums."
  curl -fsSL "https://nodejs.org/dist/latest-v$NEED.x/$TARBALL" -o "$TMP/$TARBALL"
  EXPECTED="$(grep " $TARBALL\$" "$TMP/SHASUMS256.txt" | cut -d' ' -f1)"
  if have sha256sum; then ACTUAL="$(sha256sum "$TMP/$TARBALL" | cut -d' ' -f1)"; else ACTUAL="$(shasum -a 256 "$TMP/$TARBALL" | cut -d' ' -f1)"; fi
  [ "$ACTUAL" = "$EXPECTED" ] || fail "Node.js download checksum mismatch; nothing was installed."
  rm -rf "$NODE_HOME"
  mkdir -p "$NODE_HOME"
  tar -xzf "$TMP/$TARBALL" -C "$NODE_HOME" --strip-components=1
  PATH="$NODE_HOME/bin:$PATH"; export PATH
  [ "$(major node)" -ge "$NEED" ] || fail "Node $NEED did not run after extraction."
  say "Node $(node -v) ready. For later terminal sessions add to your shell profile: export PATH=\"$NODE_HOME/bin:\$PATH\""
fi

# Checkout: clone once, then fast-forward on later runs without touching local edits.
if [ -d "$DIR/.git" ]; then
  say "Updating $DIR"
  git -C "$DIR" pull --ff-only || say "Could not fast-forward; keeping the current checkout"
else
  say "Cloning into $DIR"
  git clone "$REPO" "$DIR"
fi
cd "$DIR"

say "Installing dependencies"
npm ci --no-audit --no-fund

say "Initializing private storage and building"
if ! npm run --silent atlas -- setup --commands=auto; then
  # No assistant detected on PATH: set up without shortcuts; they can be added later.
  npm run --silent atlas -- setup
fi

say "Starting Career Atlas"
npm run --silent atlas -- start
npm run --silent atlas -- doctor >/dev/null 2>&1 || true

cat <<EOF

Career Atlas is running at http://127.0.0.1:${PORT:-4317}
Checkout: $DIR
Records stay on this computer; see docs/PRIVACY.md.

Next: open this folder in your AI assistant and ask it to read AGENTS.md,
or run a shortcut if one was installed: \$career-start (Codex) or /career-start (Claude Code).
Stop later with: cd "$DIR" && npm run atlas -- stop
EOF
