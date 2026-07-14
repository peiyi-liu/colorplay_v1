#!/usr/bin/env bash
set -euo pipefail

expected='733216166f40879647f12fd1db70faecaaa13c1a3178d3a95b24cce4c707f7fc'
test "$(git branch --show-current)" = 'main'
test -f legacy/colorplay-original.html
test "$(shasum -a 256 legacy/colorplay-original.html | awk '{print $1}')" = "$expected"
git check-ignore -q AGENTS.md && exit 1
git check-ignore -q spec/00-project-charter.md && exit 1
git check-ignore -q docs/superpowers/specs/2026-07-13-colorplay-platform-foundation-design.md && exit 1
git ls-files --error-unmatch AGENTS.md >/dev/null
git ls-files --error-unmatch acceptance/ACCEPTANCE_CRITERIA.md >/dev/null
git ls-files --error-unmatch legacy/colorplay-original.html >/dev/null
! git ls-files --error-unmatch .DS_Store >/dev/null 2>&1
