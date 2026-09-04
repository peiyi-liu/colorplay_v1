#!/usr/bin/env bash
# Stop hook：實作 task 收工前強制走過一輪 /code-review。
# 約定：/implement 開始時用 Write 工具建立 .claude/review-gate/pending；
#       /code-review 完成（或確認無程式變更）時用 Write 工具建立 .claude/review-gate/clear，
#       實際刪除由本 hook 執行——auto mode 分類器會擋 Claude 跑 rm，但擋不到 hook。
# 防迴圈：attempts 計數超過上限即放行並改標 human-required。

set -u
DIR="${CLAUDE_PROJECT_DIR:-.}/.claude/review-gate"
PENDING="$DIR/pending"
ATTEMPTS="$DIR/attempts"
MAX_ATTEMPTS=3

# 沒有進行中的實作 task → 直接放行（一般問答/查詢 session 不受影響）
[ -f "$PENDING" ] || exit 0

# 解除訊號：clear 檔存在 → hook 自行清理狀態後放行
if [ -f "$DIR/clear" ]; then
  rm -f "$PENDING" "$ATTEMPTS" "$DIR/clear"
  exit 0
fi

count=0
[ -f "$ATTEMPTS" ] && count=$(cat "$ATTEMPTS" 2>/dev/null || echo 0)
count=$((count + 1))

if [ "$count" -gt "$MAX_ATTEMPTS" ]; then
  mv "$PENDING" "$DIR/human-required-$(date +%Y%m%d-%H%M%S)"
  rm -f "$ATTEMPTS"
  echo "review-gate：已達 ${MAX_ATTEMPTS} 次上限，放行並標記 human-required，請人工確認 review 狀態。" >&2
  exit 0
fi

echo "$count" > "$ATTEMPTS"
echo "review-gate：本 task 尚未完成 code review（第 ${count}/${MAX_ATTEMPTS} 次提醒）。請執行 /code-review 審查本次變更。review 完成後（或本次確實無程式變更時），用 Write 工具建立 .claude/review-gate/clear 檔（內容寫一行原因）即可解除；不要用 rm，權限分類器會擋。" >&2
exit 2
