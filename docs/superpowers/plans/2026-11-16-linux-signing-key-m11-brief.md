# M11：Local Auth簽章金鑰操作契約修復

Base d97e6babbb055e24cef7e536eae65478a124ac13。Root新run43802274350/job133085070485 attempt1，M10template已過、真121 migrations+4 seeds後Auth unhealthy；完整stderr10621B/SHA40cf9937bfd0de154853b16495e7faa4ec79f52b93972b453a6724795a590eaf明確9次 `Failed to load configuration: no signing key found`。Cipher14197520332/4458B、ZIP79b41dfbc9d98d95027ad7ec1bf654ee5b03ea9dc9079f43ca4783c67fa52e76、cipher61c04cdcb49cd0806de4fef0a7862f6acc96c0185aba9014775bd61b210e9b96／manifest3c44c10a8bc2a7ab6c4b5c386fd0c75b17737871e0b957602c7c833bb2614fd8，Root本機age/8files13628B/source-job-request已驗；不聲稱完整DB留存或容量。

## 已證契約與重現前提

官方Auth v2.192.0 commit5acfdea63bc033b79cfb0ebb08a1d4696d942aac，internal/conf/jwk.go GetSigningJwk逐key要求private KeyOps含sign，無則回精確no signing key found；Validate也檢查單一signer。custom Keys非空走GetSigningJwk，不會如legacy default幫custom補操作。CLI v2.109.1 commit6d4c19870ed213ba7f682f117d0345c8a40bfa94，apps/cli-go/pkg/config/config.go載custom整體替default、auth.go KeyOps omitempty、start.go序列化至GOTRUE_JWT_KEYS。B.NODE_JWK真Node輸出只有alg/crv/d/kid/kty/use/x/y，沒有key_ops，原生sign/verify成功不代表Auth會選用。

Read-only精確函式seam先RED才實作：私有.git內固定官方Go1.25.11 Darwin arm64 archive58,110,545B/SHAcd8d4920e7930d55da1a5a57ba43a64b1305f71cdf2ca3c76cd8c549272b1680，實檔驗SHA、安全extract、不系統安裝。Auth原始types/Decode鏈/Validate/GetSigningJwk逐段bytes/hash、不改函式；只有最小test config type/import/driver，jwx/v2 v2.1.0＋原go.sum SHA0e2bf26d4d3ce48f87c0d1695b30b5dbc71e90b70b1311f9ee7e67237d60aba4，GOTOOLCHAIN=local。actual B.NODE_JWK新合成key只memory/stdin，不輸出key；expected-success缺ops應RED，controls缺/空/verify-only拒、sign-only及sign+verify可選。這是actual官方函式seam，不是完整Auth/容器/Native Linux。

## Ownership與實作範圍

同一worker只擁有3 paths：scripts/concurrency/linux_bootstrap_backend.py、tests/contracts/test_linux_local_bootstrap.py（必要Fixture）、新tests/contracts/test_linux_signing_key.py。你不是獨自作業，不revert Root docs/handoff.md與此brief、不開agent；Root唯一review。實作授權在Root收到實際RED後直接給，不再要求user核准既有Local範圍。交付unstaged/frozen，不commit/push/Native/SQL/API/Hosted/Rootprivate/G8。

最小產品無關工具修復：fresh ES256 private JWK明確key_ops=['sign','verify']；沿既有生成後admission驗exact單一fresh key與必要EC/kid/alg/use/private欄位、固定操作清單，缺/空/verify-only/duplicate/unknown等拒於CLI start與runtime-secret發布前。沿用BOOTSTRAP_JWKS_INVALID，不擴enum。不要輪替既有key、不改Auth驗證算法或用legacy HMAC取代ES256。固定Node版本、生成隨機性/單次執行、CLI start次數/命令/ENV、原config/template、M3/M5/M9/M10、operator/manifest、workflow/limits/SLO/imagepins、DB/Functions/產品全不變。

## 驗證／交付

先actual Node生成的新contract test RED，再最小修復GREEN；Fixture只加合法新欄位。actual固定Go函式用修後B.NODE_JWK重跑通過；wrong/no/empty/verify-only等admission負向須無service start且無runtime-secret，合成keys不進log。受影響M4/M8/M9/M10與Python regression、lint/type/static/diff各一次；全檔<=500。交exact3 raw hashes/logs/protected packet，完整保留原RED與audit準備失敗；Go來源小範圍證據留.git不進產品diff。Native仍由Root一次review後新Source Local job確認，原run不GH rerun；functional/15容量NOT_RUN、retention UNVERIFIED、費用US$0，原WIP/G8/85與Hosted/Production邊界不變。
