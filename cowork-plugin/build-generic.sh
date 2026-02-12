#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEMPLATE_DIR="$SCRIPT_DIR/template"
DIST_DIR="$SCRIPT_DIR/dist"
TMP_DIR=$(mktemp -d)

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Building Generic SendSign Cowork Plugin"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Create dist directory if it doesn't exist
mkdir -p "$DIST_DIR"

# Copy template to temp directory
echo "📦 Copying template files..."
cp -r "$TEMPLATE_DIR/.claude-plugin" "$TMP_DIR/"

# Replace placeholders with generic instructions
echo "🔧 Replacing placeholders with generic instructions..."
if [[ "$OSTYPE" == "darwin"* ]]; then
  # macOS
  sed -i '' 's|{{SENDSIGN_URL}}|https://YOUR-SUBDOMAIN.sendsign.dev|g' "$TMP_DIR/.claude-plugin/.mcp.json"
  sed -i '' 's|{{API_KEY}}|YOUR_API_KEY_HERE|g' "$TMP_DIR/.claude-plugin/.mcp.json"
else
  # Linux
  sed -i 's|{{SENDSIGN_URL}}|https://YOUR-SUBDOMAIN.sendsign.dev|g' "$TMP_DIR/.claude-plugin/.mcp.json"
  sed -i 's|{{API_KEY}}|YOUR_API_KEY_HERE|g' "$TMP_DIR/.claude-plugin/.mcp.json"
fi

# Create zip
echo "📦 Creating zip file..."
cd "$TMP_DIR"
zip -q -r "$DIST_DIR/sendsign-cowork-plugin.zip" .claude-plugin/

# Cleanup temp directory
rm -rf "$TMP_DIR"

echo ""
echo "✅ Built: $DIST_DIR/sendsign-cowork-plugin.zip"
echo ""
echo "This generic plugin contains placeholder values:"
echo "  - SENDSIGN_URL: https://YOUR-SUBDOMAIN.sendsign.dev"
echo "  - API_KEY: YOUR_API_KEY_HERE"
echo ""
echo "Users will need to manually edit .mcp.json after unzipping."
echo "For personalized plugins with real credentials, use:"
echo "  GET /api/plugin/download?apiKey=YOUR_KEY"
echo ""
