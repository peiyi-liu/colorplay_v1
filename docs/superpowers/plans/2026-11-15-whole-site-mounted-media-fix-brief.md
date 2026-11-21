# WB4 Media補丁 — 實際掛載編輯器的單張不確定上傳

狀態：B2 tools ACCEPTED及Auth copy補丁之後，由同worker執行，root唯一review；共同final freeze前完成。當前僅source gap確認，真component RED須先補；不現在擴B2或啟動服務。

## 已確定的source缺口

`AdminContentPage`的editor view實際掛`ContentEditorForm`→`ContentEditorMediaField`，不是舊`ContentMediaWorkflow`。當前form的uploadImage把所有error都顯示「圖片處理失敗」，沒有CONTENT_MEDIA_PENDING恢復／取消；file change直接清request，role/file也未在unknown鎖定。`mediaRepository = createContentMediaRepository()`是prop default expression，每render重建；正式repository的checkpoints是instance closure Map，因此僅新增recover按鈕仍不足。先前WB3後端／ZIP／舊單張component的直接測試保留，不當作目前route已完成證據。

這是程式碼可確認缺口，尚未用真App故障注入證明具體UI；本段先以實際mounted component真repository checkpoint行為RED，再修最小caller。不得宣稱DB/Storage committed保護失效：server／repository已接受的WB3契約不重寫。

## Ownership與行為

worker擁有 `src/features/content-studio/components/content-editor-form.tsx`、`content-editor-media-field.tsx`、必要小型相鄰media hook／helper及直接component tests。form原488行，抽出本次上傳狀態協調以保持500內，不做editor redesign。可擴 `scripts/concurrency/media-journey.ts`／`media-interception.ts`與直接contracts，將B2實際單張happy-path增加postcommit reply-loss/recover與confirmed-cancel段（精確paths在開工checkpoint列）。除此產品／DB／Edge／repo/parser/deps／舊workflow不改；不是獨自在codebase，不revert他人修改。

同mounted生命週期使用穩定的fallback repository與原request/checkpoint，正常upload confirmed才插入一次manifest。對CONTENT_MEDIA_PENDING明示結果待確認，原file/role/request鎖住，提供明確「確認並恢復」與「取消本次上傳」操作；recover沿同request，不新begin／重新upload／重做已verified處理。confirmed cancel才清checkpoint與解鎖；unknown/cancel失敗仍保持待確認，不當成已取消或產新key。

同步action gate須防React rerender前連按重入，recover或cancel成功只完成一次；保持原alt text／semantic role／manifest排序與dirty狀態，不讓恢復時混入換過的檔案／用途。不刪之前已verified media／draft引用，也不自動save/publish canonical。只保本頁記憶體，跨reload durable續傳仍非本輪能力；不得把secret/checkpoint移進localStorage。

## 測試與真驗證接線

先actual ContentEditorForm RTL RED（透過目前route或明確相同props/composition），至少：結果unknown→真pending controls／鎖定；confirmed後回覆丟失→原request recover只插入一次、無第二begin/upload/process；cancel confirmed才解鎖，cancel unknown保留；同tick double click不重入、先前media保留。必須覆蓋**未傳mediaRepository prop的正式fallback路徑**：使用正式createContentMediaRepository與合成transport（可spy factory注入同類正式repo），跨rerender仍能沿原checkpoint恢復，不能只fake recover method令測試綠。既有正向插圖／儲存／publish／表單validation與15s budgets不退化。

真browser工具沿A1目前Admin route的新複習卡編輯器，先用B2 happy單張；再精確owned run的server process verified後僅丟HTTP回覆一次，實際新pending UI恢復同run／權威verified asset。另owned run在process送出前丟一次以走confirmed cancel，不產verified資產。未儲存單張只報editor加入及保留真media asset，不假稱有run-prefixed已存draft；ZIP既有兩個新draft保留。raw token/body/path/secret不進log，unexpected errors與故意注入事件分開，不能全域忽略。

本段工具tests先合成，不開服務／身份／真browser/WASM；共同final freeze後由root首次真跑。完整lint/type／explicit affected／changed Prettier／diff綠一次，exact paths commit＋safe packet、原RED保留。對應AC-TCH-014 trusted media processing相關部分與已核媒體不確定提交契約（AC-SEC-005是rate limiting，不列本補丁覆蓋），不聲稱全站/Hosted/phase PASS。root唯一review後接B3。

既有圖片用途的代表覆蓋：新增的單張postcommit回覆遺失／恢復樣本採現有`color_critical`選項（原B2 single/ZIP維持standard），使用合法小PNG，不改處理器／品質閾值。此角色有thumbnail/reading/color_critical三種variants，不能硬斷言每資產都兩種；root oracle依明列source/role/typed receipt導出總數。private owned plan／slots／intent／begun proof必須涵蓋新增單張run，B3只接完整統一plan，禁止遺漏新run來造出舊3assets/6variants PASS。
