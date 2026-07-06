#!/bin/bash
set -e

# Usage: ./push.sh "your commit message"

if [ -z "$1" ]; then
  echo "Error: Please provide a commit message."
  echo "Usage: ./push.sh \"your commit message\""
  exit 1
fi

echo ">> Adding files..."
git add .

echo ">> Committing..."
git commit -m "$1"

echo ">> Pushing to origin main..."
git push origin main

echo ">> Done!"