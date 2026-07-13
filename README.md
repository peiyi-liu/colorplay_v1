# ColorPlay React + Supabase 開發規範包 v2

這個資料夾可直接複製到新專案根目錄，作為 VS Code Codex 與 Superpowers 的專案上下文。v2 新增 Flat Design、認知負荷、虛擬鍵盤、Dialog／Back、Icon 隱喻與狀態可視性的完整規格及量化驗收。

## 建議放置方式

```text
colorplay/
├─ AGENTS.md
├─ spec/
├─ acceptance/
├─ docs/superpowers/specs/
└─ legacy/colorplay-prototype.html
```

## 使用順序

1. 將現有 HTML 原型另存為 `legacy/colorplay-prototype.html`。
2. 將本包的 `AGENTS.md`、`spec/`、`acceptance/`、`docs/` 放入 repo。
3. 在 Codex 開始工作前要求它先讀 `AGENTS.md`。
4. 第一個實作工作不要直接「完成整個平台」，而是依 `spec/10-migration-roadmap.md` 分階段。
5. 每個階段先用 Superpowers brainstorming，核准設計後建立 implementation plan。
6. 每個 PR 列出對應 acceptance IDs。
7. release 前執行真實 Supabase + headed Playwright acceptance。
8. UI release candidate 額外提供真實手機軟體鍵盤與 Android Back 操作證據。

## 仍需由專案負責人決定的項目

這些不是遺漏，而是會影響研究與部署的決策：

- Supabase Auth 採 Email/password 或 magic link。
- React 靜態網站部署平台。
- 正式資料保存期限與研究倫理規定。
- 教師是否能關閉／匿名化排行榜。
- Production Supabase 方案與備份等級。

決定後請建立 ADR，並同步修改相關 spec 與 acceptance。

## 重要提醒

- Supabase publishable／anon key 可以在瀏覽器出現；安全依賴 RLS。`service_role` 絕不可放前端。
- 驗收不得使用 mock application API。
- 沒有實際 UI 截圖、序列證據與 DB/network proof，不得宣稱完成。
- Flat Design、自然配對、虛擬鍵盤、Dialog、Icon 語意與狀態可視性依 `spec/07-ui-visual-system.md` 與 `AC-UI-008`～`AC-UI-015` 驗收。
- Desktop resize 或 device emulation 不得冒充真實 OS 軟體鍵盤／Android Back 證據。
