# M59：60人首次註冊同步發送時序定位

唯讀定位已完成，Root已核准下方兩Source與必要tests的有界實作；最終packet待Root唯一review。基線app3f1dd73da04b401793f310a77ffb523de8617efa，當前app branch codex/live-source-recovery；M57已獨立commit9f9cb0caa2975a4f61d455fa15e03fe5985fa7fe/operator branch，不在app tree，不要刪／重建其四檔。你不是獨自在codebase，保Root reports/brief/雙handoff/WIP。Root唯一review，不增加agent。

## 真實證據

VM10 run44245300575/job134602672919/runner30/attempt1，Source3f1dd73、N2 actual/minIceLake12CPU/32GB、原backend4CPU6GB與全部健康／SLO不變。Root真age/cold/business核：functional15＋anon3/10/20 PASS，fresh40正式PASS且40completed/Auth40、entry60.497ms/send149.086ms，rawConsole40/provenMatched40/unmatched0。fresh60 INCONCLUSIVE在send；60started/sent/Authcreated、verified0/completed0/ownershipKnowntrue，entry191.647ms有效，physical POST60/60 skew295.676ms>250，GENERATOR_LIMITED。後續10legs未跑，不能判網站60人承載能力。parent6份firstCause null、無parent timeout/cancel/overflow/residue；60 run firstCollectorInvalid null、停止前lastHealth VALID。最後jobfailure、runnerauto移除/repo0、10VM均正常STOPPED，全部資料保留，US150/noPaid/Hosted0/Production禁。

閉集timing：40→60 arm span4.635→4.784ms；CLICK ENTERED span23.840→33.406ms；CDP request span149.086→295.676ms；Node request callback span122.684→256.638ms；CLICK RETURNED span48.147→160.802ms。可確定擴散出現在進入送出操作之後；尚不能單憑此歸因於Playwright actionability、browser排程、產品handler或CORS。DOM clock僅INSTALL_ROUND_TRIP_BOUNDS_ONLY，不准直接跨document／Node／CDP相減造精確時間。40 cleanup途中collector_unavailable發生在原FINALLY stop之後，原published40 receipt PASS；不能把它錯當60原因。

相鄰runtime/gcp-vm10/downloads/files/files/runtime/capacity-journals/wsc-261118-6e1345978bdf；兩fresh legs的capacity-send-diagnostics.json、generator-diagnostics.json、registration-observations與run diagnostics是真證據。Root .git/gcp-vm10-root-40-60-first-projection.json、gcp-vm10-root-send-timing-first-projection.json。只讀閉集metadata，不讀Raw Auth/body/WS/帳密/影像。已有send DOM／pairing／profiler／event loop等診斷，先用現有資料作可否證定位，不先另加整套診斷。

## 此輪輸出與限制

先讀actualUi.send／send diagnostics／原dispatch與barrier caller，回報：確定／推測／仍未知；最多兩個最小修法及精確owned paths/API／不變條件與驗證設計。Root正在獨立準備少量真正Chromium受控UI activation檢查，結果只作generator方法資格，非Native容量PASS；你先不啟動browser/Cloud/Native。不要預設原click之外的輸入方式可用：任何替代都必須仍走正式表單與真trusted user activation／one request，保原DOM listener及DEFAULT_NATIVE_TUPLE來源驗真。

禁止放寬250ms／timeouts／SLO／資源健康、人工錯開／縮小60人、precreate Auth、預送HTTP暖CORS、跳OTP／verify、JS element.click／force click／bypass actionability fake成功、移動量測邊界、重送mutation、改產品或Hosted設定。不要將多次重跑取最好成績；舊VM10不重跑。完成提案後等Root核精確Source範圍才RED／實作。無Git mutation／秘密／新agent，所有Source維持凍結。

## 最小Source／測試範圍已核准

Root接受有條件的正式按鈕鍵盤activation候選，尚未宣稱性能改善。Source僅capacity-registration-ui.ts與capacity-registration-final-diagnostics.ts：前者exact按鈕visible/enabled/focusable且實際focused後，以Playwright公開focus()/press('Enter')觸發原產品onClick；DOM evaluate僅唯讀，不直接JS focus/click或改disabled。跨await重核admit；保原CLICK marker、all-arm/並行perform、POST clock、observer error隔離與原error identity。多個前置檢查共用原15s操作預算，不能每hop另15s；未知/hidden/disabled/失焦/detached/abort不可按鍵。後者僅依actual actors.length40/60選兩個固定basename registration-final-gate-40／-60，其他情境保原名，不開任意filename權限、不改wx／registration.ts504／journeys。

允許四既有tests（whole-site-capacity-registration-ui、whole-site-send-diagnostics、whole-site-capacity-registration-final-diagnostics、whole-site-capacity-registration）必要窄port接線及一新whole-site-capacity-send-activation.test.ts，各<=500。先真exported UI與真capacityJournal TempFS有效RED→GREEN；測exact readonly UI條件/abort/deadline/原錯誤/observer失敗隔離、40→60兩檔真寫、同cohort重複拒且原檔hash不變。不削弱舊assertions，M56/M58/原497 raw保持，額外path/契約變更先Root。全部capacity與send相關tests/fulltype/lint/globalformat/import/diff/static/history/Original/finalfreeze，privatepacket .git/m59-send-cohort/；Root唯一review後新Source/freshVM11，不重跑VM10、不承諾Linux60會PASS。
