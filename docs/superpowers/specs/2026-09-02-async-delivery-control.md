# ColorPlay 平行開發控制契約

- 日期：2026-09-02（Asia/Taipei）
- 狀態：Owner 核准作為 rebaseline 後的派工規則
- Canonical base snapshot：`f0638b04d74a8a5071ceb36e7a2369527dc5d0b7`
- 相關：program rebaseline decision record、Phase 0/1 plans、section progression、
  Admin B design

> 檔名保留 `async-delivery-control` 以避免舊連結失效；本契約的正式含義是
> 「不同 phase／function 以獨立 worktree 平行開發」，不是單純等待後的
> asynchronous handoff。

## 1. Current pause and parallel work

Claude Code 使用量暫時到上限，只會暫停由該工具執行中的 Phase 0／1 work；不會
鎖住 repository、規格撰寫、read-only 稽核或其他獨立 product package。
經 2026-09-03 Git ancestry 重查，`f0638b0` 已包含 Phase 1 Local-gate tip
`3f0f16d`；因此 Admin B Local 開發可以作為獨立 lane 優先開始，不必等
Phase 0 Hosted readiness。

在其恢復前允許：

- 文件、spec、ADR、AC、implementation plan 與 supersession notice。
- Read-only inventory；必須標記 snapshot SHA/date，不得當成 current gate。
- 在不觸碰受保護 worktree 的前提下準備 exact-path patch／review checklist。
- 從已包含必要 lineage 的 committed exact SHA 建立獨立 Admin B
  worktree，執行 Local implementation、unit／integration 與不破壞共用 DB 的檢查。

在其恢復前仍不允許：

- 改動或重新 stage Phase 0 的 74-path staged WIP。
- 對 Phase 1 舊 worktree 補 commit、rebase、merge 或改寫歷史。
- 執行會 reset 共用 Local Supabase 的 gate。
- 因等待而跳過 Phase 0，先部署 Phase 1 Hosted 或開始 hosted data mutation。
- 在 dirty canonical checkout 整合產品碼。

## 2. Source-of-truth hierarchy

1. Phase gate 時的 `acceptance/ACCEPTANCE_CRITERIA.md`。
2. `spec/*.md` 的 2026-09-02 normative sections。
3. `docs/superpowers/specs/2026-09-02-*.md` 設計與 scope。
4. 對應 implementation plan。
5. Existing implementation。

舊設計／計畫若有 supersession notice，只作歷史證據。任何 worker 發現上位文件
互相矛盾，停止衝突範圍並回報，不自行選一份順眼的。

## 3. Work package envelope

每個平行工作包必須在 brief 開頭包含：

```text
Package ID:
Goal:
Exact base SHA:
Worktree/branch:
Owned files/modules:
Forbidden files/worktrees:
Required specs/AC IDs:
Allowed mutations:
Shared Local Supabase window:
Tests and expected result:
One reviewer / one review round:
Stop conditions:
Integration target and order:
```

缺 exact SHA、ownership 或 stop conditions 的工作包不可開始。Brief 已摘錄必要規格
時，worker 不需重讀整套 docs。

## 4. Worktree and Git rules

- Program integration 使用新 protected worktree／`codex/` branch，從 owner 指定的
  exact canonical SHA 建立。
- 每個 product package 使用自己的 worktree/branch；不得與 Phase 0/1 現有
  worktree 共用 checkout。
- 一次只將一個已核准 source 收進 program integration；先查 ancestry、migration
  range、semantic conflict，再跑 scoped gate。
- Exact-path stage，禁止 `git add -A`；不得 stage `docs/handoff.md`、`.tmp-*`、
  `docs/user-guides/` 等不屬於該 package 的 WIP。
- 不 reset、stash、force-push 或刪除其他 worker 的 worktree。Merge conflict 逐 hunk
  保留雙方語意，不用 whole-file ours/theirs 蒙混。
- Commit 完成不等於 push／merge／deploy 授權；每種外部 mutation 依 brief 明列。

## 5. Review and completion

- 每個 M 級 package 只有一位 reviewer、一輪 review；修復同輪 findings 後重跑
  affected checks，不另開多重 reviewer 儀式。
- Task completion 至少列：變更、AC、檔案、commands/results、residual risks。
- Phase completion 另需核准的 Local/Staging evidence、RLS negative、manifest、exact
  SHA 與 fixture cleanup；task green 不能宣稱 phase green。
- Historical CI、Vercel `READY`、HTTP 200 或 deployed feature SHA 都不是 current
  release proof。

## 6. Shared Local Supabase coordination

Phase 0 與 Phase 1 共用 `project_id=colorplay` 的 Local Supabase。任何
`supabase db reset`、`pnpm test:db` 或 destructive fixture preparation 前必須取得
exclusive window；看不到 active connection 不等於得到同意。

能使用 pure unit／static contract 的 package先跑不破壞性檢查。需要 DB 的 package
排入單一序列，不平行 reset。

## 7. Parallel dependency lanes

```text
committed R0 docs + exact base containing Phase 1 Local lineage
├─ Release lane: Phase 0 candidate → restore proof → protected merge
│                                  └→ fresh Staging → Phase 1 Hosted
├─ Admin lane: Admin B Local implementation → reviewed candidate → Local gate
│                                                        └→ wait at Hosted gate
└─ Content/Learning lane: Phase 2A → Phase 2B → Phase 3 progression
                                           └→ Phase 4 UI closeout
                                           └→ Phase 5 F2／Phase 6 依各自 interface 依賴接續

Integration owner: 一次只收一個 reviewed candidate
Hosted/release: 仍等 Release lane 與當次 Owner 授權
```

Lane 之間可平行開發；lane 內箭頭是不可跳過的 interface／data
dependency。Admin B 是當前 Owner 優先 Local lane；Phase 0 不阻擋它開發，但仍
阻擋 Admin B 整合後的 Hosted gate。Admin C 不在任何 active lane。

Owner 於 2026-09-03 選定 Admin B 為單一完整垂直 lane：同一專屬 worktree／
candidate 依計畫順序收斂 DB、Auth／Edge、typed UI interface、真實 UI、review 與
Local gate。不得把這些層拆成可各自整合的 sibling branches；需要平行的是
Admin B 與 Phase 0 兩條 lane，而不是在 Admin B 內製造第二套控制面或半成品整合。

## 8. Parallelism rules

可以平行的是 ownership 不重疊、有獨立 worktree／branch、且不搶 Local
Supabase reset 的 package。例如 Phase 0 staged review 可與 Admin B Local
implementation 平行；後者不觸碰 Phase 0/1 舊 worktrees，也不先做 Hosted。
不可平行：

- 兩個 package 同時新增／重排 migrations。
- Learning progression server contract 與另一 package 同時改
  `create_quiz_session`／`finalize_quiz_session`。
- Admin B 與 Phase 1 Hosted remediation 同時改 Admin command policies。
- 任一 source integration 與 canonical branch上的直接產品開發。

共用 hot paths（router、AppShell、global styles/tokens、`src/types/database.ts`、
`supabase/**`）在同一時間只有一個 owner。其他 lane 可依已固定的 interface
開發 adapter／view-model，但不各自改一份 shared contract。

衝突風險是「不同分支都綠，合併後少掉語意」。建議改成先鎖 interface owner，
下游只依 interface 寫 adapter/view-model，等 owner package 合併後再接線。

## 9. Hosted boundary

- Phase 0 合併前，不建新的 Phase 1 Staging gate。
- Hosted run 前記錄 Git SHA、Vercel project/deployment/domain、Supabase ref、migration
  head、fixture identities、planned writes、cleanup owner。
- Staging 與 Production credentials/data 不混用；Preview／Staging public bundle
  target 必須檢查。
- Hosted mutation、fixture 建立、promotion 與 Production release 都需當次 owner
  授權；設計文件不是永久授權。

## 10. Resume checklist for Phase 0/1

Claude Code 恢復後，不從舊對話文字直接續跑。先：

1. 重查 worktree path、branch、HEAD/MERGE_HEAD、staged/unstaged/untracked。
2. 比對 approved plan、current rebaseline record 與 supersession。
3. Phase 0 確認原 74-path staged tree 未被任何文件工作碰觸。
4. Phase 1 確認 Local-gate commits/lineage 已進 canonical，但 Hosted gate仍未執行。
5. 取得共用 Local Supabase exclusive window後才跑 destructive checks。
6. 回傳 bounded checkpoint，由 Owner/Codex 發下一個明確 package。
