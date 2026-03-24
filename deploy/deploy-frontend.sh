#!/bin/bash
# =============================================================================
# WeThePeople — Frontend Deployment Reference
# =============================================================================
# The frontend deploys AUTOMATICALLY via Vercel on every GitHub push to main.
# This script is a reference — no manual steps are normally needed.
#
# Vercel configuration:
#   - Root directory: frontend
#   - Build command: npm run build (auto-detected from package.json)
#   - Output directory: dist (auto-detected from Vite)
#   - Node.js version: 20.x
#   - Framework: Vite
#
# Manual deploy (if auto-deploy is broken):
#   cd frontend && npx vercel --prod
#
# Preview deploy (for testing before merge):
#   cd frontend && npx vercel
# =============================================================================

set -euo pipefail

echo "=== WeThePeople Frontend Deploy ==="
echo ""
echo "The frontend auto-deploys via Vercel on push to main."
echo ""
echo "Current deployment:"
echo "  URL:    https://wethepeopleforus.com"
echo "  Source: GitHub -> Vercel (auto)"
echo "  Root:   frontend/"
echo ""
echo "To trigger a deploy: just push to main."
echo "  git push origin main"
echo ""
echo "For manual deploy (emergency only):"
echo "  cd frontend && npx vercel --prod"
echo ""
echo "To check deploy status:"
echo "  npx vercel ls"
