# 複習卡 Markdown 開源套件研究

日期：2026-08-27

## 結論

本階段建議採用 `react-markdown` + `remark-gfm` 作為唯一的共用顯示核心，外層由 ColorPlay 實作薄薄一層 `ReviewCardMarkdown`：本機預覽頁與學生閱讀頁共用這個元件，只替換圖片 resolver（本機 object URL 或正式 signed URL）。本機輸入區使用既有 React 控制式 `textarea` 即可。2026-08-27 後續需求加入 `==螢光標記==`，採 remark 官方 plugin 清單標示為新版相容的 MIT 套件 [`remark-flexible-markers`](https://github.com/ipikuka/remark-flexible-markers)，輸出語意化 `<mark>`，不開放 raw HTML 或任意色碼。

不建議 fork 或複製任一開源編輯器的原始碼。這會把上游安全修補、React 相容性與 CSS 維護責任永久轉移到 ColorPlay；直接依賴 MIT 套件並封裝產品契約，比「複製後修改」更可控。

`MDXEditor` 適合未來 Admin 的所見即所得編輯階段，但對目前「Google Sheet 撰寫 Markdown、在本機即時預覽」過重。`@uiw/react-md-editor` 雖可快速產生左右分割畫面，卻自帶另一套 preview pipeline；若學生端另用安全 renderer，就可能出現本機預覽和學生實際顯示不一致。

## 評估範圍

本研究只使用專案官方文件、官方 GitHub repository、package manifest、license 與 release 記錄，評估：

- Markdown 字串是否能直接保存
- GFM 表格
- `review-media:P301` 自訂圖片來源
- raw HTML／XSS 預設行為
- React 19／Vite 相容性證據
- 本機即時預覽及後續手機介面適配
- 官方 source 可證明的依賴面
- license 與近期維護活動

## 候選比較

| 項目                | `react-markdown` + `remark-gfm`                                                                                                                                                                                                                                                                                                                                                         | `MDXEditor`                                                                                                                                                                                                                                                   | `@uiw/react-md-editor`                                                                                                                                                                                                                                                                                                        |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 定位                | Markdown 字串到 React elements 的 renderer；不是編輯器。[官方說明](https://github.com/remarkjs/react-markdown/blob/main/readme.md#what-is-this)                                                                                                                                                                                                                                         | React 所見即所得 Markdown 編輯器，接受並輸出 Markdown 字串。[Overview](https://mdxeditor.dev/editor/docs/overview)                                                                                                                                            | 以 `textarea` 為基礎、附工具列與即時預覽的 Markdown 編輯器。[README](https://github.com/uiwjs/react-md-editor#readme)                                                                                                                                                                                                         |
| 保存格式            | 只讀取字串來 render，不會重新序列化或改寫 Sheet 內容。                                                                                                                                                                                                                                                                                                                                  | `markdown` 是初始值，`onChange`／`getMarkdown()` 輸出字串；MDAST ↔ Lexical 往返可能正規化原始寫法。[Getting started](https://mdxeditor.dev/editor/docs/getting-started)                                                                                       | `value`／`onChange` 都是字串；編輯器本體是控制式 textarea。[README props](https://github.com/uiwjs/react-md-editor#props)                                                                                                                                                                                                     |
| GFM 表格            | 使用 `remark-gfm`，官方範例會輸出標準 table elements。[react-markdown plugin 範例](https://github.com/remarkjs/react-markdown/blob/main/readme.md#use-a-plugin)、[remark-gfm](https://github.com/remarkjs/remark-gfm#what-is-this)                                                                                                                                                      | `tablePlugin()` 支援 GFM table，並有列、欄、alignment UI；HTML table 不支援。[Tables](https://mdxeditor.dev/editor/docs/tables)                                                                                                                               | 官方宣告支援 GFM；底層 preview 依賴 `remark-gfm`。[README](https://github.com/uiwjs/react-md-editor#features)、[preview manifest](https://github.com/uiwjs/react-markdown-preview/blob/master/core/package.json)                                                                                                              |
| 自訂圖片 resolver   | 可用 `urlTransform` 嚴格放行 `review-media:P\d+`，再用 `components.img` 換成 ColorPlay media 元件。[Options](https://github.com/remarkjs/react-markdown/blob/main/readme.md#options)、[Components](https://github.com/remarkjs/react-markdown/blob/main/readme.md#appendix-b-components)                                                                                                | `imagePreviewHandler(imageSource)` 可把代號解析為預覽 URL。[API](https://mdxeditor.dev/editor/api/type-aliases/ImagePreviewHandler)；但圖片 resize 會輸出 HTML `<img>`，需關閉 resize 才符合受限 Markdown。[Images](https://mdxeditor.dev/editor/docs/images) | `previewOptions` 繼承 ReactMarkdown props，因此可提供 `urlTransform`／`components.img`。[preview options](https://github.com/uiwjs/react-markdown-preview/blob/master/core/README.md#options-props)                                                                                                                           |
| raw HTML／XSS       | raw HTML 預設不當作 DOM 執行；不要加入 `rehype-raw`。官方指出啟用 raw HTML 有風險且約增加 60 KB min+gzip。[HTML](https://github.com/remarkjs/react-markdown/blob/main/readme.md#appendix-a-html-in-markdown)                                                                                                                                                                            | 預設會處理 HTML node，可用 `suppressHtmlProcessing` 關閉。[HTML support](https://mdxeditor.dev/editor/docs/html-support)、[Props](https://mdxeditor.dev/editor/api/interfaces/MDXEditorProps)；它是 authoring UI，不應當學生端安全 renderer。                 | source 預設 `skipHtml = true`，但自行把 `urlTransform` 預設改為 identity；若開啟 HTML 才加入 `rehype-raw`。官方仍明確警告不可信 Markdown 必須 sanitize。[preview source](https://github.com/uiwjs/react-markdown-preview/blob/master/core/src/preview.tsx)、[Security](https://github.com/uiwjs/react-md-editor#security)     |
| React 19／Vite 證據 | peer dependency 為 React `>=18`，repo 開發依賴使用 React 19；套件為 ESM-only 且支援 modern bundlers。Vite 8 仍需由 ColorPlay build/typecheck 實證。[manifest](https://github.com/remarkjs/react-markdown/blob/main/package.json)、[Compatibility](https://github.com/remarkjs/react-markdown/blob/main/readme.md#compatibility)                                                         | manifest 明列 React／ReactDOM `>=18                                                                                                                                                                                                                           |                                                                                                                                                                                                                                                                                                                               | >=19`，開發環境使用 React 19，build script 使用 Vite；官方另提供 Vite sample。[manifest](https://github.com/mdx-editor/editor/blob/main/package.json)、[Getting started](https://mdxeditor.dev/editor/docs/getting-started) | peer range `>=16.8.0` 不排除 React 19，提供 ESM entry；但 repo 的測試／型別 dev dependency 仍是 React 18，沒有找到官方 React 19 或 Vite 8 驗證證據。[package manifest](https://github.com/uiwjs/react-md-editor/blob/master/core/package.json)、[root manifest](https://github.com/uiwjs/react-md-editor/blob/master/package.json) |
| 本機與手機適配      | renderer 不綁 UI，最容易套用既有學生版 CSS；textarea／preview 切換方式由 ColorPlay 控制。圖片、表格橫向捲動與分頁仍需產品 CSS。                                                                                                                                                                                                                                                         | 桌面所見即所得能力最完整，但 Lexical、Radix 與工具列互動增加手機版適配面；目前需求用不到其 authoring 功能。                                                                                                                                                   | 已有 `live`／`edit`／`preview` 模式與 toolbar，適合快速 demo；官方未提供可引用的 mobile 支援保證。[Props](https://github.com/uiwjs/react-md-editor#props)                                                                                                                                                                     |
| 依賴面              | manifest 列出 11 個直接依賴，`remark-gfm` 列出 6 個；兩者 ESM 且 `sideEffects: false`。官方未提供可固定引用的核心 bundle 數字。[react-markdown manifest](https://github.com/remarkjs/react-markdown/blob/main/package.json)、[remark-gfm manifest](https://github.com/remarkjs/remark-gfm/blob/main/package.json)                                                                       | manifest 包含 Lexical、CodeMirror、Radix UI 與多個 MDAST/Micromark 套件；依賴面明顯較廣，但官方沒有固定 bundle 數字，不應自行估算。[manifest](https://github.com/mdx-editor/editor/blob/main/package.json)                                                    | core 有 4 個直接依賴，但其 preview package再帶入 `react-markdown`、`rehype-raw`、GFM、highlight 等套件；可用 `nohighlight` entry 排除 Prism highlight。[core manifest](https://github.com/uiwjs/react-md-editor/blob/master/core/package.json)、[nohighlight](https://github.com/uiwjs/react-md-editor#remove-code-highlight) |
| License             | `react-markdown`、`remark-gfm` 都是 MIT。[licenses](https://github.com/remarkjs/react-markdown/blob/main/license) [remark-gfm license](https://github.com/remarkjs/remark-gfm/blob/main/license)                                                                                                                                                                                        | MIT。[LICENSE](https://github.com/mdx-editor/editor/blob/main/LICENSE)                                                                                                                                                                                        | MIT。[LICENSE](https://github.com/uiwjs/react-md-editor/blob/master/LICENSE)                                                                                                                                                                                                                                                  |
| 維護活動（查證日）  | `react-markdown` 最新穩定版 10.1.0 為 2025-03-07；main 最後 commit 為 2025-04-21，2026 仍有 PR／Actions 活動。`remark-gfm` 最新 4.0.1，main 最後 commit 為 2025-02-10。[releases](https://github.com/remarkjs/react-markdown/releases)、[commits](https://github.com/remarkjs/react-markdown/commits/main/)、[remark-gfm commits](https://github.com/remarkjs/remark-gfm/commits/main/) | v4.2.2 發布於 2026-08-26，近期仍持續修正 table 與 dependency security。[releases](https://github.com/mdx-editor/editor/releases)                                                                                                                              | v4.1.2 發布於 2026-08-21，近期仍有 editor command 修正。[releases](https://github.com/uiwjs/react-md-editor/releases)                                                                                                                                                                                                         |

## 建議實作邊界

### 1. 共用 renderer

封裝單一 `ReviewCardMarkdown`，只暴露：

```ts
type ReviewCardMarkdownProps = {
  markdown: string;
  resolveMedia: (code: string) => ReviewCardResolvedMedia | null;
};
```

本機 preview 與學生頁不得自行配置各自的 Markdown plugins。兩者共用：

- `react-markdown`
- `remark-gfm`
- `remark-flexible-markers`（只公開 `==文字==` 的單一 ColorPlay 螢光樣式）
- 同一份 element allowlist
- 同一份 `review-media:` URL 規則
- 同一組學生閱讀 typography／table／image components

差異只應是 `resolveMedia` 的資料來源：本機 preview 使用使用者選取的 local object URL；學生頁使用 canonical RPC 回傳的 media metadata 與 private Storage signed URL。

### 2. 圖片 URI 安全規則

`react-markdown` 的 `defaultUrlTransform` 不允許未知 scheme，所以 `review-media:P301` 預設會被清除。[官方 source](https://github.com/remarkjs/react-markdown/blob/main/lib/index.js#L460-L487) 自訂 transform 必須：

1. 只在 element 是 `img` 且 property 是 `src` 時處理。
2. 只接受完整符合 `^review-media:(P\d+)$` 的值。
3. 解析失敗時顯示有代號的錯誤 placeholder，不發出 network request。
4. 其他 URL 一律交回 `defaultUrlTransform`，不可使用 identity transform；官方明確指出不安全的自訂 URL transform 會重新打開 XSS 風險。[Security](https://github.com/remarkjs/react-markdown/blob/main/readme.md#security)

### 3. 受限 Markdown

使用 `allowedElements`／`allowElement` 限定第一版，例如：

```text
h1 h2 h3 p br strong em mark blockquote ul ol li img
table thead tbody tr th td
```

不要加入 `rehype-raw`、MDX、iframe、style、script 或任意 HTML。Markdown parser 通常採寬鬆解析，因此「附件代號不存在、圖片缺少 alt、超過字數、使用不支援語法」仍必須由 ColorPlay validator 額外檢查，不能把 renderer 當 validation gate。

### 4. 本機預覽工具

目前不需要引入完整 editor component：

- 左側使用 controlled textarea 保存原始 Markdown 字串。
- 右側直接 render `ReviewCardMarkdown`。
- 圖片代號由本機 file picker 建立暫時 mapping。
- 錯誤面板使用正式 validator 結果。
- 窄螢幕以「編輯／預覽」切換；桌面才並排。

這樣測試的不是一個近似的 GitHub Markdown 畫面，而是學生真正會使用的 renderer。

## 未採用候選的後續用途

### MDXEditor

未來 Admin 若確認需要 Word／Google Docs 式所見即所得，可另外做 scoped spike。屆時至少必須：

- `suppressHtmlProcessing={true}`
- 關閉圖片 resize，避免輸出 HTML `<img>`
- 只註冊核准的 headings、lists、quote、table、image plugins
- 透過 `imagePreviewHandler` 解析 `review-media:`
- 驗證 MDAST ↔ Lexical round-trip 不會破壞既有 Sheet Markdown

MDXEditor 官方自己也說 read-only mode 不應用來呈現消費內容，而應另用 renderer。[MDXEditor props](https://mdxeditor.dev/editor/api/interfaces/MDXEditorProps)

### @uiw/react-md-editor

若未來只想快速加入 Markdown toolbar，可參考其 command API 或採用 headless utilities；但不應直接採用其預設 preview 作為正式契約。預設雖忽略 raw HTML，卻使用 identity `urlTransform`，並加入 GitHub alert、GFM 等非 ColorPlay 自行定義的 pipeline；開啟 HTML 後還會加入 `rehype-raw`。這和正式學生 renderer 的嚴格 URL／element allowlist 不一致。

## 最終建議

1. 現階段採用 `react-markdown` + `remark-gfm`，只採用 library，不 fork 上游 component。
2. 建立 ColorPlay 自有且共用的 `ReviewCardMarkdown` 安全薄層。
3. 本機 preview 自行組合 textarea、validator、media mapping 與共用 renderer。
4. `MDXEditor` 留到 Admin authoring 階段再 spike；`@uiw/react-md-editor` 不進入正式 renderer pipeline。
