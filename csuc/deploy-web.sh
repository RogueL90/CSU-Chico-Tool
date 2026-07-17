#!/usr/bin/env bash
# Deploy the Call Willie web app to S3 + CloudFront.
#
# Live URL:      https://d3gmrc21asm6ic.cloudfront.net
# S3 bucket:     call-willie-web-304343190790 (us-west-2, private, OAC)
# Distribution:  E2B42LS75P2Q53
#
# Requires fresh AWS credentials in ~/.aws/credentials (Learner Lab
# rotates them each session). EXPO_PUBLIC_* values from .env are baked
# into the bundle at export time.
set -euo pipefail
cd "$(dirname "$0")"

BUCKET="call-willie-web-304343190790"
DISTRIBUTION="E2B42LS75P2Q53"
REGION="us-west-2"

echo "-- Building static web export..."
rm -rf dist
npx expo export --platform web

echo "-- Uploading to s3://${BUCKET}..."
# Content-hashed assets: cache forever
aws s3 sync dist/ "s3://$BUCKET/" \
  --exclude "*" --include "_expo/*" \
  --cache-control "public, max-age=31536000, immutable" \
  --region "$REGION" --delete
# Entry points: always revalidate
aws s3 sync dist/ "s3://$BUCKET/" \
  --exclude "_expo/*" \
  --cache-control "no-cache" \
  --region "$REGION" --delete

echo "-- Invalidating index.html..."
aws cloudfront create-invalidation \
  --distribution-id "$DISTRIBUTION" \
  --paths "/index.html" "/" \
  --query 'Invalidation.Status' --output text

echo "✅ Deployed: https://d3gmrc21asm6ic.cloudfront.net"
