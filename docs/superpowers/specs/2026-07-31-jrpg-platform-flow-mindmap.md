# ColorPlay × 日式 RPG 像素風 — 平台流程圖與心智圖

> 依據 [2026-07-31-jrpg-pixel-restyle-design.md](./2026-07-31-jrpg-pixel-restyle-design.md)（已核准）整理。
> 範圍鐵律：**純表現層改版** — 狀態機、RPC、RLS、ledger、計分規則（`rules_version`）與路由結構一律不動。
> 進度標記：✅ 已完成　🔨 進行中

---

## 圖 1｜平台功能架構圖（樹狀總覽）

```mermaid
flowchart TD
    LOGIN["登入<br/>（標題畫面）"] --> HOME["首頁<br/>（村莊廣場）"]

    CAT1["闖關式學習"]:::cat
    CAT2["競爭式活動"]:::cat
    CAT3["養成與收藏"]:::cat

    HOME --> DEX["魔物圖鑑<br/>（錯題本）"]
    HOME --> SHOP["道具店／時裝店<br/>（商店）"]
    HOME --> ADV["世界大冒險<br/>（世界地圖）"]
    HOME --> HALL["勳章殿堂<br/>（成就）"]
    HOME --> BOARD["公會佈告欄<br/>（排行榜）"]
    HOME --> LIVE["公會團體戰<br/>（Live 課堂）"]

    CAT1 -.-> ADV
    CAT2 -.-> BOARD
    CAT2 -.-> LIVE
    CAT3 -.-> DEX
    CAT3 -.-> SHOP
    CAT3 -.-> HALL

    ADV --> CONT["章節大陸<br/>（單元）"]
    CONT --> FLOOR["地城樓層<br/>（子主題）"]
    FLOOR --> BTL["回合制戰鬥<br/>（答題挑戰）"]
    FLOOR --> FDB["三色精靈講解<br/>（答題回饋）"]
    FLOOR --> LOOT["寶箱結算<br/>（EXP／金幣）"]

    DEX --> REV["復仇戰<br/>（重練・不計排行）"]

    LIVE --> JOIN2["召集令<br/>（輸入加入碼）"]
    LIVE --> ATB["ATB 團體戰<br/>（速度計分）"]
    LIVE --> PROJ2["投影幕頒獎<br/>（教師投影）"]

    classDef default fill:#ffffff,stroke:#444,color:#111
    classDef cat fill:#ffffff,stroke:#888,stroke-dasharray:4 3,color:#333
```

---

## 圖 2｜平台整體流程圖（學生端 × Live × 教師端）

```mermaid
flowchart TD
    subgraph ENTRY["入場｜認證（批次①）"]
        LOGIN["標題畫面 /login<br/>像素夜空・村莊剪影<br/>三寶石懸浮・PRESS START 閃爍"]
        REG["命名之儀 /register<br/>格子輸入框・冒險者證<br/>OTP＝魔法信鴿"]
        RESET["教會回復魔法<br/>/forgot・/reset<br/>聖堂燭光・溫和文案"]
    end

    subgraph VILLAGE["村莊｜大廳與設施（批次①・批次④）"]
        HUB["村莊廣場 /app<br/>俯視 tile・告示板與店招<br/>HUD＝Lv／EXP條／金幣G<br/>Blook 待機動畫"]
        SHOP["道具店／時裝店 /app/shop<br/>兩櫃檯 NPC・木架陳列<br/>購買確認＝對話窗"]
        BOARD["公會佈告欄 /app/leaderboard<br/>木板底＋羊皮紙名條<br/>全期累計・前三名金銀銅"]
        HALL["勳章殿堂 /app/achievements<br/>未解鎖＝石膏剪影<br/>解鎖＝光柱"]
        DEX["魔物圖鑑 /app/mistakes<br/>錯題＝魔物卡<br/>剪影→復仇成功點亮"]
    end

    subgraph LOOP["核心學習循環｜冒險（批次②・批次③）"]
        WMAP["世界地圖 /app/missions<br/>章節＝大陸・軟鎖永遠可點<br/>玩家 sprite 站當前位置"]
        DUNGEON["地城樓層 /app/chapters/:id<br/>子主題＝樓層・火把數＝進度<br/>樓層卡＝對話窗"]
        BATTLE["回合制戰鬥 /app/quiz/:id<br/>題目魔物置中・指令窗四格<br/>行動條倒數・COMBO 計數<br/>計分中僅提供「下一題」"]
        RESULT["勝利結算 …/result<br/>VICTORY 橫幅・寶箱開啟<br/>確定性獎勵（禁止隨機掉落）<br/>EXP／G 滾動・升級 fanfare"]
    end

    subgraph BEAT["戰鬥三拍鐵律（server-authoritative）"]
        direction LR
        T1["① 按下選項"] --> T2["② 揮刀<br/>樂觀演出"] --> T3["③ 伺服器判定"]
        T3 --> HIT["命中！"]
        T3 --> MISS["MISS"]
        T3 -.回應逾時.-> COUNTER["魔物反擊"]
    end

    subgraph STATE["地圖節點四態＝get_learning_progress.status（軟鎖）"]
        direction LR
        S0["not_started<br/>灰霧"] --> S1["learning<br/>微光"] --> S2["developing<br/>全亮"] --> S3["mastered<br/>金色"]
    end

    subgraph LIVE["公會團體戰＝ColorPlay Live（批次⑤）"]
        JOIN["召集令 /app/live/join<br/>六格咒文石板逐格點亮<br/>錯誤震動"]
        WAR["團體戰 /app/live/:id<br/>ATB 行動條＝速度計分150<br/>screen_only＝僅四色指令<br/>Late Join＝營地等待"]
        PROJ["投影幕 ?presenter=1<br/>旗幟牆・四色軍勢分布<br/>Top 5 英雄榜<br/>頒獎台煙火＋三寶石加冕"]
    end

    subgraph TEACHER["教師端＝賢者高塔（批次⑤・像素濃度≤三成）"]
        TDASH["公會長室 /teacher<br/>羊皮紙卡片"]
        TANA["水晶球觀測室<br/>/teacher/analytics<br/>圖表僅像素外框裝飾"]
        TCLS["公會名冊／隊伍編成<br/>/teacher/classes"]
        TMEM["冒險者履歷<br/>mastery＝屬性雷達"]
        TLIVE["軍師指揮台／戰役記錄卷軸<br/>/teacher/live"]
    end

    %% 入場動線
    LOGIN -->|新玩家| REG
    LOGIN -.忘記密碼.-> RESET
    RESET -.-> LOGIN
    LOGIN -->|登入成功| HUB
    REG -->|命名完成| HUB

    %% 村莊導覽
    HUB --> SHOP
    HUB --> BOARD
    HUB --> HALL
    HUB --> DEX
    HUB ==>|出發冒險| WMAP

    %% 冒險主循環
    WMAP ==>|進入大陸・日景轉地城冷色| DUNGEON
    DUNGEON ==>|選擇樓層| BATTLE
    BATTLE ==>|通關| RESULT
    RESULT ==>|進度更新・回到地圖| WMAP
    WMAP -.四態顯示.-> STATE
    BATTLE -.每題判定.-> BEAT
    BATTLE -.答錯收錄.-> DEX
    DEX -->|再戰＝復仇戰・不計排行・可帶提示| BATTLE
    RESULT -.新解鎖成就.-> HALL
    RESULT -.金幣G消費.-> SHOP
    RESULT -.計分累計.-> BOARD

    %% Live 團體戰
    HUB -->|輸入六位加入碼| JOIN
    JOIN --> WAR
    WAR -.同場大螢幕.-> PROJ
    TLIVE -->|開局主持| WAR

    %% 教師端
    TDASH --> TANA
    TDASH --> TCLS
    TCLS --> TMEM
    TDASH --> TLIVE

    %% 四態上色（呼應品牌三色與金幣金）
    style S0 fill:#b9bdc7,stroke:#6b7280,color:#1f2430
    style S1 fill:#e8ecfb,stroke:#3056D8,color:#1f2430
    style S2 fill:#d9f2e4,stroke:#22A06B,color:#1f2430
    style S3 fill:#f3e3b8,stroke:#B8862F,color:#4a3a10
```

**讀圖要點**

- 粗箭頭＝核心學習循環：村莊 → 世界地圖 → 地城樓層 → 戰鬥 → 寶箱結算 → 回地圖。
- 重答一律走魔物圖鑑的「復仇戰」（不計排行、可帶提示、不動 `rules_version`）；計分 session 內只給「下一題」。
- 戰鬥三拍為 server-authoritative：伺服器回應抵達前不得顯示對錯。
- 場景日夜規則：村莊與世界地圖＝暖色日景；戰鬥、Live、投影幕＝夜空 navy。

---

## 圖 3｜實作批次流程圖（P0 → 批次⑤）

```mermaid
flowchart LR
    SPEC["設計規格核准<br/>2026-07-31<br/>純表現層・後端不動"]

    subgraph P0G["P0 前置 ✅"]
        P0["ADR 0005（推翻 0728／0730 視覺裁定）<br/>spec 07-ui 視覺基線＋CONTEXT 詞彙<br/>pixel tokens 調色盤＋RpgWindow 對話窗<br/>Cubic 11 子集＋素材規格"]
    end

    subgraph BATCHES["五個實作批次（各自 worktree・依序合併）"]
        B1["批次① 世界觀定調 ✅<br/>標題／註冊／密碼頁＋村莊廣場<br/>必須最先・已完成（58c9a7a）"]
        B2["批次② 核心循環 🔨<br/>戰鬥＋寶箱結算"]
        B3["批次③ 地圖與回饋<br/>世界地圖＋地城樓層＋三色精靈"]
        B4["批次④ 村莊設施<br/>商店／圖鑑／佈告欄／殿堂"]
        B5["批次⑤ Live 與高塔<br/>團體戰＋投影幕＋教師端"]
        B1 --> B2 --> B3 --> B4 --> B5
    end

    subgraph GATE["每批合併 gate"]
        G1["pnpm lint＋typecheck＋test"] --> G2["design-audit 截圖重拍<br/>只重拍該批畫面"] --> G3["375px 手機＋1080p 投影驗證"] --> G4["過 gate 才合併上線"]
    end

    NOTE["批次順序可依素材產能微調<br/>素材未齊的批次順延不搶跑<br/>批次①必須最先（定調）"]

    SPEC --> P0G --> BATCHES
    BATCHES -.每批完成後.-> GATE
    G4 -.進入下一批.-> BATCHES
    NOTE -.約束.- BATCHES

    style NOTE stroke-dasharray: 5 5
```

---

## 圖 4｜設計規格心智圖（全貌）

```mermaid
mindmap
  root((ColorPlay ×<br/>色彩王國 JRPG))
    🎯 目的與範圍
      純表現層改版
        狀態機・RPC・RLS 不動
        計分規則 rules_version 不動
        路由結構不動
      16-bit 世界觀一致性強化學習動機
      取代 0728 淡彩／0730 奶黃裁定
    🏰 世界觀｜色彩王國
      色彩原理＝魔法體系
        色相＝元素屬性
        明度彩度＝法力強弱與純度
        配色原理＝合成魔法
      角色
        學生＝見習色彩法師
        教師＝賢者
        三色精靈＝NPC 導師
      系統對應
        品牌三色＝三原色寶石
        XP／Token＝經驗值／金幣G
        Blook＝夥伴（從魔）／裝備
        章節子主題＝大陸／地城樓層
        錯題本＝魔物圖鑑／復仇戰
        Live＝公會團體戰（ATB）
    ✅ 五項定案決議
      1 地圖解鎖＝軟鎖
        永遠可點・僅視覺引導
        四態映射 status・零後端工程
      2 地圖層級＝兩層
        世界地圖 missions
        地城樓層 chapters
        場景轉場表現
      3 NPC 導師＝三色精靈
        同基底換色＋小配件
        素材成本約 1.3 隻
      4 再挑戰＝復仇戰
        計分內只給下一題
        不計排行・可帶提示
      5 排行榜＝全期累計
        公會佈告欄・不做週月切換
    🎨 像素視覺系統
      調色盤約 48 色
        品牌三色＝最高飽和層
        夜空navy・羊皮紙・金幣金
        日夜雙場景
          村莊地圖＝暖色日景
          戰鬥 Live 投影＝夜空navy
        tokens.css 唯一定義點
      對話窗元件
        深藍底＋白雙線框 9-slice
        零圓角・硬位移陰影
        8px 基準格・整數倍放大
      字型
        Cubic 11＝繁中標題
        Press Start 2P＝拉丁點綴
        Noto Sans TC＝長文退回
        內文不小於 16px
      動效音效
        steps 階梯緩動 150-300ms
        戰鬥三拍鐵律
        chiptune 音訊
        只動 transform／opacity
        reduced-motion 降級
      素材生產
        魔物家族＋palette swap
        16／32px spritesheet
    🖼️ 逐畫面藝術指導
      學生端 15 畫面
        標題畫面／命名之儀／教會回復
        村莊廣場 HUD
        世界地圖／地城樓層
        回合制戰鬥／勝利結算
        魔物圖鑑／道具店
        公會佈告欄／勳章殿堂
        召集令／團體戰／投影幕
      教師端（像素濃度≤三成）
        公會長室／水晶球觀測室
        公會名冊／冒險者履歷
        軍師指揮台／戰役卷軸
    🛡️ 品質與約束
      對比 4.5：1・觸控 44px
      鍵盤焦點・reduced-motion
      375px＋1080p 投影實測
      已刪功能不因換皮復活
      講解源＝questions.explanation
      Live 安全機制不變
    🚀 實作批次
      P0 前置 ✅
      批① 世界觀定調 ✅
      批② 戰鬥＋寶箱 🔨
      批③ 地圖＋回饋
      批④ 村莊設施
      批⑤ Live＋教師端
      gate＝lint typecheck test 截圖
    ⚠️ 風險對策
      素材產能＝家族換色壓量
      CJK 字型＝子集化
      投影可讀性＝現場實測
      截圖基準＝每批只重拍該批
```
