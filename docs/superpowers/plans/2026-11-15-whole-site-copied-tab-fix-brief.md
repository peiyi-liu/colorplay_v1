# WB4 Auth補丁 — 複製分頁的獨立登入通知

狀態：已由root的真Chromium／正式client模組／installedSDK＋owned fakeAuth重現，排B2唯一review ACCEPTED後執行；現在不擴B2。仍同一worker、root唯一review，final candidate freeze之前完成。這是既有獨立分頁契約的bug修復，不更動backend認證或安全架構。

## 已知缺陷與證據界線

原生window.open會複製sessionStorage，連同`colorplay-auth-tab-id`。當前createTabScopedAuthStorageKey直接重用該id，兩頁SDK開相同BroadcastChannel。Root primary `.git/copied-tab-broadcast-probe.json` 的三項實際結果：清原session後重新登入不同身份，copy的canonical為null卻收first的SIGNED_IN S1；first canonical為S1卻收copy SIGNED_IN S2；copy logout使仍存S1的first收SIGNED_OUT。正式client檔hash與9086吻合，六次請求只到自有假Auth，0產品／Hosted／身份建立，全資源關閉。

這確認client的跨頁通知缺陷；尚非完整App UI／後端越權證據。與兩頁仍共用同一server session時的合法撤銷分開：後者不能改成保留已撤銷token有效。

## Ownership與必要行為

worker只擁有 `src/lib/supabase/browser-client.ts`、`browser-client.test.ts`及必要獨立相鄰direct regression test；若必須小型tab-storage helper列精確path給root後可拆，單檔500內。不得改AuthBootstrap／repository／logout／後端／grant／spec業務規則／套件／DB／全域BroadcastChannel；不新建fixture/不開服務。不是獨自在codebase，不能revert他人或碰dirty原root產品碼。

修法由worker以最小方案實作並解釋：廣播通道的身份不能只相信複製來的持久tab id；新document應有彼此獨立的channel身份，同一document多次取client／key仍穩定。若document初始化需要換key，必須從該頁目前官方sessionStorage的canonical資料安全搬移，保留同頁reload可恢復、legacy key migration、當前scoped優先與logout清除。可以使用非秘密的document-local marker／等效最小機制；不自行改token內容、換backend session、持久化秘密到localStorage／額外app store或改Auth scope。關閉頁面仍結束該頁登入。

明確避免只在window.opener存在時臨時換key卻破壞後續reload，也不能一刀切關掉所有Auth state通知、過濾SIGNED_OUT掩蓋真撤銷、把複製頁硬當匿名而丟合法canonical資料。新channel隔離不等於backend session隔離：原copy尚未各自登入時，同server session被撤銷依舊應拒；分別真UI重登入不同session後才驗互不干擾。

## 驗證／交付

先direct product regression RED：兩個獨立document realms＋native copy的同sessionStorage內容，當前key會碰撞；新key各異、各canonical資料完整、old scoped移動不丟／不混身份。另驗fresh無opener、同doc重複取key、reload的新realm、legacy/current並存優先、現有真SDK／bounded-fetch／session-reader相容。不能只用改傳入UUID的mock證明新document，也不能刪原功能assertion或skip。

Root將另做真Chromium負向控制／postfix獨立驗證，保留原RED primary；完整App UI仍在共同final freeze後由B1 flow驗證。worker本段不先啟動真服務／browser。lint/type/明列受影響tests/changed Prettier/diff綠一次，精確stage/commit與safe packet，保留原失敗。回exact base/head、files/maxlines、AC-AUTH-001／AC-AUTH-003的session恢復與共享裝置相關部分（僅module證據；AC-SEC-005是rate limiting，本補丁未驗）、已知限制。root唯一review後才接B3或其後已排工具，不逐段再問Owner批准。

實作選擇澄清：必須獨立的是SDK使用的BroadcastChannel／document namespace，不是強迫copy的持久tabId一定改值。可採每document獨立SDK storageKey＋小型auth storage adapter映射至既有canonical sessionStorage key，含SDK必要的code-verifier／user等companion key；這可保既有reader／reload／legacy穩定。若採此法，直接tests與root真browser應驗實際channel通知隔離及canonical資料，不以持久tabId是否改變判定修補。只允許本client的精確namespace映射，不掃別project/session或改token格式；新document session仍是合法copy，shared server-session撤銷語意不變。
