# M31 Local圖片條件式快取修復審查

Task級接受；Root唯一reviewer／一輪／0 findings。WB4／AC-PERF-003前置，不是容量或phase PASS。

## 問題與行為

Native25的7個圖片請求已觀測Root fetch304/no Location→REDIRECT_BLOCK→dispose，沒有fulfill。Local攔截器將所有3xx阻擋，誤封鎖了快取驗證回應。現在只對same-app-origin、actual Image GET，首次forward從完整allHeaders移除If-None-Match與If-Modified-Since，保留其他header與原map，仍單次fetch／maxRedirects0／maxRetries0。沒有validators時維持原options；fresh意外304仍failed並dispose，不假造200。真正其他3xx、POST、API、foreign或非圖片處理保持。

## 規範與證據界線

[HTTP304語義](https://www.rfc-editor.org/rfc/rfc9110.html#name-304-not-modified)與[Playwright routing停用HTTP cache](https://playwright.dev/docs/api/class-browsercontext#browser-context-route)支持避免依賴攔截快取body的工程修法。[allHeaders完整性](https://playwright.dev/docs/api/class-request#request-all-headers)與本機官方SDK1.65.1 _innerFetch的explicit headers replacement已核，避免用不完整headers遺失Cookie/Auth。Native25 request validators原值沒有留存，首次移除validators是工程修正，不宣稱原header已觀測；不回填Native24／23 cause。

## 檔案與測試

精確4檔：browser-runtime207行、new whole-site-functional-static-cache.test272行、browser.test123行、image-transport.test435行。有效actual installed handler RED→GREEN；43功能files635tests與final3files56窄回歸PASS，type/lint/globalformat/import/diff全0。Root獨立2files29tests／745ms PASS。初test lint與Root brief format失敗log均保留；不重跑無關capacity208／產品build／Phase8 gate。所有headers僅記memory，不輸出其值；無新增body讀取、重試或expected豁免。

## 保護與審查紀錄

packet .git/m31-static-image-conditional/validation.json SHA d91936fec4ee19c4fecb46fffc7d19ed50d76bfe8bbd995ccefa249f38e7d905／43records17checks；Root .git/m31-root-review.json SHAc42d55b69334dc1b83b7de9b8fa9ce1472cda76f7b3324f96b05fca3b109de11。Root核全部4files與行限、2197unowned actualGit blobs/symlinkbytes、operator44／Original7trueprefix與歷史261records保持。Native25 finalfailure與完整cold custody已留，Root8951cfade7ea78075dd40cb97096d3b2879d0c5212614809327b634a67aa7aea。未改產品、PNG、dependency、Original或Hosted。

## 下一步與限制

控制測試是synthetic actual-handler契約，尚待Linux真實驗證。Root exact7paths commit／clean、fresh special remote bd7b9a0，正常新Source pushattempt1 Native26 six-person→15legs，非PASS即停止升級並保留全資料；不GHrerun。40／60尚未run，US$0／cap5，Hosted／Production／真寄信NONE。
