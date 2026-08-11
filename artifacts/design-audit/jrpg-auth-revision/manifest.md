# JRPG 首頁／認證場景修正版

- 產生時間：2026-08-11（Asia/Taipei）
- 瀏覽器：Chromium
- 初版結果：首頁／登入／註冊 6/6 通過
- 本次認證修正版結果：登入／註冊 4/4 通過
- 首頁 1280×720：`../jrpg-home-world/1280/home.png`
- 首頁 393×852：`../jrpg-home-world/393/home.png`
- 登入 1280×720：`../jrpg-auth-guild-desk/1280/login.png`
- 登入 393×852：`../jrpg-auth-guild-desk/393/login.png`
- 註冊 1280×720：`../jrpg-auth-register/1280/register.png`
- 註冊 393×852：`../jrpg-auth-register/393/register.png`
- 機械檢查：document／main 垂直 overflow ≤ 1px、document horizontal overflow ≤ 1px、關鍵文字／欄位 `scrollWidth <= clientWidth + 1px`、表單控制高度 ≥ 44px、登入與註冊 frame/portal 全部位於 viewport 內、教師登入增加班級序號後仍零捲動、Auth 房屋剪影 pseudo-element 為 `none`。
- 本地預覽：`http://127.0.0.1:4181/`、`/login`、`/register`
