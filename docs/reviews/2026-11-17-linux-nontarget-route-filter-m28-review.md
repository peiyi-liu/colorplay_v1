# M28：非目標請求篩選窄修 Root review

**ACCEPTED_NONTARGET_METADATA_FILTER_FIX_PENDING_NATIVE**。S級兩檔修正、Root一次bounded review無finding。base b22bb05a359efac9460ff160921b85f87ca16e41；WB4／AC-PERF-003前置工具修復，非Native21取消根因或40/60 PASS。

## 問題與變更

Native22前12功能PASS、mediaFAIL，availablefalse但unexpected0／detailsUNAVAILABLE／events空；正常media goto的Playwright GET postData()回null，被新identity parser在URL/method排除前當不合法body拒絕。Root用actual exported observer＋native Request形狀重現exit1，確定是新診斷工具回歸。

只改functional-media-transport-observation.ts與直接test。先解析URL/method並排除非目標，再對exact API/media/import POST嚴格解析body/Auth。GET/html、API/static、target-path GET/OPTIONS與非target POST的null body被忽略；target POST null／壞JSON／缺Auth／invalid UUID仍UNKNOWN並收緊available，原配對／phase／private identity／時序／上限未變，無API產品／expected／HTTP／bodyread／journal修改。

## 驗證與保護

Worker有效RED4例→40files582tests；fulltype／changedlint／globalformat／import／diff／static全0。Root獨立focused35tests（712ms）與原GET反例GREEN exit0，0findings；測試對每個正常非target之後再跑合法POST配對，並保留target拒絕與inactive guard。

Root核29records/2Source SHA，1948unowned actualGit blobs含symlink target bytes不follow／operator44／原7protected／真正Original575959B c4fb…prefix；舊test原bytes仍prefix。Source470行、test500行，在原≤500限內，無壓行或第3Source檔。M27 validation-v2與79原records保持原raw SHA，不覆寫歷史結果。

Packet48ec05b028e467ea1ebf2f9180b681b386dae89ebd108a29227c7347d324689c；Rootreceipt 6e0b4f89429c40ae8eaa7bd514c0e1abea9fcedeae74c09a1880e86263397300。

## 限制與下一步

只解Native22新observer對非target metadata的錯誤判斷；Native21 HTTP200/ERR_ABORTED取消來源與app bodyEOF仍UNOBSERVED，不回填Native18。582單元／contract測試不是40/60實際驗收。

Root exact4paths（2Source/tests＋report／handoff）gated cachedcheck/commit/clean；Native22最終job結束並保全部cold資料後，fresh specialremote b22核符，再正常FF新Source/push/attempt1正常six-person→15legs，不GHrerun／0business gate。原WIP/G8停止85/custody、US$0/US$5 cap、Hosted/Production/真寄信NONE保持。
