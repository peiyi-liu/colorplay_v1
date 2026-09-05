export const MONITOR_GROUPS = [
  {
    title: '教材可用性',
    description: '檢查已發布教材，提早發現內容與媒體缺漏。',
    action: '前往資料查核定位教材，再交由內容負責人修正。',
    href: '/admin/data',
    signals: [
      [
        'sections_insufficient_live_questions',
        'Live 題庫不足的節',
        '已發布課程鏈下，Live 專用題庫不足正式組卷需要的 20 題。',
      ],
      [
        'sections_without_questions',
        '缺少已發布題目的節',
        '已發布課程鏈；至少一題存在檢查，不代表足夠組卷。',
      ],
      [
        'sections_without_cards',
        '缺少複習卡的節',
        '已發布課程鏈；至少一張複習卡。',
      ],
      [
        'media_objects_missing',
        '媒體物件缺漏',
        '目前複習卡版本的 Storage 物件引用，不等同網路可下載。',
      ],
      [
        'published_versions_missing',
        '缺少發布版本快照',
        '已發布題目與複習卡必須有相同版本的已發布快照。',
      ],
      [
        'media_delivery',
        '媒體實際可讀性',
        '受信任服務以短效簽名 URL 讀取目前版本圖片；每輪最多 500 個，超出顯示資料不完整。',
      ],
    ],
  },
  {
    title: '課堂與作答異常',
    description: '由場次狀態與伺服器請求紀錄定位異常。',
    action: '查核 Live 場次與安全日誌；閒置警示需確認教師是否仍在授課。',
    href: '/admin/data/live/live_sessions',
    signals: [
      [
        'live_overdue_questions',
        '逾時仍開放的題目',
        '題目截止超過 2 分鐘且場次仍開放；暫停中的場次不計。',
      ],
      [
        'live_idle_sessions',
        '長時間未推進場次',
        '大廳或題目回饋超過 30 分鐘未更新；此為待查核，不代表故障。',
      ],
      [
        'live_incomplete_finalization',
        '結算資料缺漏',
        '已完成場次缺完成時間，或 active 參與者缺正式排名。',
      ],
      [
        'answer_http',
        '送答案 HTTP 結果',
        '近 24 小時 Quiz／Live 作答端點；HTTP 錯誤含拒絕與系統失敗，不包含 200 回應中的業務拒絕。',
      ],
    ],
  },
  {
    title: '發布與復原狀態',
    description: '部署證據與備份必須屬於目前環境。',
    action: '先核對發布證據與備份規範，再由負責人依復原指引處理。',
    href: '/admin/health',
    signals: [
      [
        'release_proof',
        '目前部署與登入驗證',
        '目前網站版本與同版號的真實登入、環境驗證結果。',
      ],
      [
        'backup_inventory',
        '供應商備份新鮮度',
        '目前 Supabase 專案最近完成備份，26 小時為新鮮度界線；不包含 Storage。',
      ],
      [
        'backup_verification',
        '備份校驗證據',
        '需同環境的解密、完整性與 Storage 校驗證據；未接入時保持未知。',
      ],
      [
        'restore_drill',
        '還原演練證據',
        '需同環境演練結果；Production 的演練不能當成 Staging 證據。',
      ],
    ],
  },
  {
    title: '服務品質',
    description: '依功能呈現樣本數、HTTP 失敗率與來源端處理延遲。',
    action: '依時間窗查看 Supabase 日誌；沒有延遲樣本時不顯示 0 ms。',
    href: '/admin/health',
    signals: [
      [
        'login_http',
        '登入服務',
        '近 24 小時登入端點；包含認證拒絕，不能把所有 4xx 都認定為系統故障。',
      ],
      [
        'content_http',
        '教材讀取服務',
        '近 24 小時複習／題目讀取端點；延遲為上游送出回應標頭所需時間，非使用者端到端時間。',
      ],
      [
        'answer_http',
        '作答提交服務',
        '近 24 小時 Quiz／Live 作答端點的 HTTP 結果。',
      ],
    ],
  },
  {
    title: '獎勵一致性',
    description: '核對正式流水與活動結果，監控本身不改動餘額。',
    action: '先確認流水與活動來源，再依受控交易流程處理補償。',
    href: '/admin/data/rewards/wallet_transactions',
    signals: [
      [
        'wallet_ledger_mismatch',
        '代幣餘額與流水差異',
        '核對所有代幣帳戶餘額與流水加總。',
      ],
      [
        'quiz_reward_mismatch',
        '測驗獎勵差異',
        '核對已完成 Quiz 的正式 XP／代幣結果與兩種流水；未涵蓋其他活動漏發。',
      ],
      [
        'duplicate_reward_sources',
        '重複獎勵來源',
        '同帳號、來源種類、來源 ID 的 XP／代幣流水；正常亦受資料庫唯一鍵保護。',
      ],
    ],
  },
] as const;
