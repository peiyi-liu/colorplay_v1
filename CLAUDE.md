# ColorPlay CLAUDE.md

@AGENTS.md

## Claude Code 專屬補充

本節只寫 Claude Code 專屬的行為。跨工具（Codex／Superpowers／其他自動化代理）共用的規則一律在上面的 `AGENTS.md`——那才是唯一真相來源。如果某項內容同時對 Codex 有意義，應該加進 `AGENTS.md`，不要加在這裡造成分岔。

### 常用 subagent 對應場景

- **Explore**：找檔案位置、追符號定義、跨多處或不確定命名慣例時的程式碼搜尋。單一目標、答案明確時直接用 Bash/grep，不必上 subagent。
- **codex:codex-rescue**：卡關超過合理嘗試次數、想要第二意見、需要更深入的 root cause 診斷，或想把一段實作直接交給 Codex CLI 執行時使用。
- **content-reviewer**（`.claude/agents/content-reviewer.md`，Codex 對應版本 `.codex/agents/content-reviewer.toml`）：題庫匯入前，或使用者要求「審題庫／內容 review」時使用。只審查、絕不修改檔案。
- **claude-code-guide**：使用者問 Claude Code／Claude API／Agent SDK 本身的用法時使用；先查是否有相關 running agent 可以續接，不要單純憑記憶回答（版本行為會變）。
- **general-purpose / Plan**：需要大範圍探索、跨模組影響分析，或要先產出架構型 plan 才能動手時使用。

Superpowers 技能（tdd、systematic-debugging、code-review、brainstorming、writing-plans……）的觸發規則由 `superpowers:using-superpowers` 統一管理，不在此重複；任務分級（S/M/L）以 `AGENTS.md` 第 7 節為準，不得為小任務升級儀式。

### review-gate Stop hook 協議

`.claude/hooks/review-gate.sh` 掛在 Stop 事件：只要 `.claude/review-gate/pending` 存在，收工前就會被攔下，要求跑一次 `/code-review`（或確認本次確實無程式變更）。解除方式是用 **Write 工具**建立 `.claude/review-gate/clear`（內容寫一行原因），由 hook 自己清掉狀態——**不要用 `rm` 直接刪 `pending`**，permission 分類器會擋，而且會繞過這個防呆設計本身的用意。超過 3 次提醒會自動放行並標記 `human-required-*`，代表需要人工確認 review 狀態。

Codex 側是 `.codex/hooks/review-gate.sh` ＋ `.codex/hooks.json`（同一份腳本邏輯的鏡像），行為對等，觸發時機是 Codex 自己的 Stop 事件。

### claude-mem／本機 memory 定位聲明

claude-mem 的 observations，以及 Claude Code 的 auto-memory（`~/.claude/projects/.../memory/*.md`）都只是**這個工具、這台機器**的加速記憶／個人化偏好記錄——Codex session、其他協作者都看不到，換一台機器或開一個乾淨的 Codex session 也不會繼承。

任何會影響專案走向的東西，一律要落地寫進：

- 規則／技術方向的變動 → `AGENTS.md`
- 進度／交接／下一步 → `docs/handoff.md`
- bug／可追蹤 task → GitHub Issues（見 `docs/agents/issue-tracker.md`）

memory 只能拿來加速「我自己記得多做過什麼」，不能當作跨工具溝通的管道。checkpoint 或 session 結束前，把值得留給下一個工具接手的內容寫進 `docs/handoff.md`，而不是只存進 memory 就結束。

### .codex/ 與 .claude/ 平行設定同步

如果這次 session 改了 `.claude/agents/**`、`.claude/hooks/**`，或其他 `.codex/` 也有對應版本的設定，**同一輪就要檢查並更新 `.codex/` 對應檔案**（格式會不同：agents 是 `.toml`，hooks 通常是同一份 shell script 邏輯），一起 commit。不要假設「反正下次 Codex session 會自己發現」——目前這套鏡像是手動維護，沒有自動檢查機制，兩邊完全可能長期不一致而沒人發現。細節規則見 `AGENTS.md`「平行工具設定鏡像」一節。
