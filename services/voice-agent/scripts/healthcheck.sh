#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
curl -fsS "http://127.0.0.1:7880" >/dev/null || true
curl -fsS "http://127.0.0.1:6333/readyz"
echo ok
