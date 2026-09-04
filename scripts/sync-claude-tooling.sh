#!/usr/bin/env bash
# 把主目錄的 .claude/ 與 .agents/（Claude Code hooks/agents/skills）同步到
# 另一個 worktree。用複製而非 git merge/cherry-pick，因為這兩個目錄是專案工具
# 設定、不隨 feature 分支分岔，複製可以完全避開 .gitignore 之類的合併衝突。
#
# 何時需要用到：只有當某個 worktree 是從「今天這批 .claude/.agents commit
# 之前」的舊 commit 分岔出去、且之後也不會 merge/rebase feature/v2-major-update
# 時才需要。凡是今天之後才建立、且分支源頭已包含這批 commit 的新 worktree，
# 用 git worktree add 就會自動帶著，不需要跑這支腳本。
#
# 用法：scripts/sync-claude-tooling.sh <目標 worktree 的絕對路徑>

set -euo pipefail

MAIN_ROOT="$(git rev-parse --show-toplevel)"
TARGET="${1:?用法: scripts/sync-claude-tooling.sh <目標 worktree 絕對路徑>}"

if [ ! -d "$TARGET/.git" ] && [ ! -f "$TARGET/.git" ]; then
  echo "錯誤：$TARGET 看起來不是 git worktree（找不到 .git）" >&2
  exit 1
fi

for dir in .claude .agents; do
  rsync -a --delete \
    --exclude 'settings.local.json' \
    --exclude 'review-gate/' \
    "$MAIN_ROOT/$dir/" "$TARGET/$dir/"
done

echo "已同步 .claude/ 與 .agents/ 到 $TARGET"
echo "（.claude/settings.local.json 與 .claude/review-gate/ 依慣例不同步，個人設定/暫存狀態各自獨立）"
