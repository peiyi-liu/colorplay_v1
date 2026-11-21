# M82 ownership 補充三：所有既有 ACK callers 閉合

Root已完整rg scripts/src/tests（僅TypeScript，未讀Legacy）確認production caller只有四處：capacity-live-game的Host與Student、teacher-live functional Host、scripts/live/capacity-browser-actor.ts舊CLI Host。前述兩個Host已納M82；允許舊CLI Host同樣在原waitForSubscriptionAck固定加第三參數HOST_PROGRESS，原remaining/signal/budget及Student行為不變。

新增第20 owned scripts/live/capacity-browser-actor.ts（原323行，仍≤500），只允許上述Host模式接線。新增第21 owned tests/contracts/live-browser-join-actor.test.ts：只調deliverAck fixture，shared topic使用該fixture真canonical session；Host加同session的progress topic且不同join refs；Student只shared。SECRET sentinel保留ref/URL/console/error與原privacy assertions，不能縮減或刪除。原timeout、cancel、latency、failure與所有assertion不放寬，不把真guard拒絕不相符session改回any-topic。

Root已讀原檔確認這是fixture topic與真正route session不相符及缺少Host mode，非已證產品錯誤。受影響union第一次114files/1631tests有6FAIL（兩頁面Host fixture與四actor fixture），原log/freeze保留。只在這兩檔做窄接線，原baseline不改；private amendment3保存完整before hashes。單輪Root正式review仍pending finalfreeze，DB/SDK尚NOT_RUN。不要藉此開放其他CLI或測試範圍。
