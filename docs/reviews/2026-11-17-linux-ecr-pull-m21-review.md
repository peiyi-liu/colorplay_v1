# M21：固定 ECR 映像限流唯一 Root review

**ACCEPTED_EXACT_ECR_PULL_BACKOFF_PENDING_NEW_SOURCE**。Root 唯一一輪，Standards／Spec／Security 各0 findings；base4051b4007768d9db0e50cd89cf41bd5a0972ef09。對應 WB4／AC-PERF-003 的環境準備，非容量或 phase PASS。

## 變更與範圍

只改 backend 專用 pull port、NativeIO、直接 Fixture port、新 pull tests 共4 Source paths。只對固定 approved immutable ECR image、正常實體 closed、exit1、精確59B Rate exceeded 最多3 attempts，5／10秒退避共用原 image180秒；其他錯誤／timeout／cancel／unknown close／writer／deadline均停止。CLI start/status、通用 bounded/run/first-terminal raw、正常 six-person／15legs、停機保留與所有 SLO/caps 不改。

中途限流 raw 先 wx600 保存，獨立累計2MiB history；metadata 綁 request/image/index/attempt/closure/exit/bytes/SHA。terminal slot 不被 transient 吞掉；原 prebusiness 與正常完整 encrypted export 的實際列舉皆收錄新檔。最大462行，無新依賴或產品變更。

## 驗證

Worker9個新直接tests、完整Python183 tests、lint/typecheck/AST/import/EOF/diff全0。Root9tests PASS／0.716s＋75獨立精確byte mutation／錯誤exit型別／取消／late writer／後續unknown close保存控制PASS，核27records全SHA、4Source、66protected actualGit、operator44；worker另1,917 unowned tracked non-docs保持。行為RED與3組fixture setup失敗保留，不當產品錯誤，不回填原Native15。

Packet a549de3cf8e5baa84c7f46eeecf20d3642eadc80a63862ba75634ec34366ea2a；Rootsummary52182787241dbfbd39226628554663f2578affd1c9433917ac624f277cd24526。Source方法 bytes 與原 guard 路線核對；fixture真ordinary child process closure及synthetic age export只作offline工具證據。

## 已知限制與下一步

Native15仍是官方registry限流、無business；Rootreceipt12db537d0fc395e74c8533daa4521e65cd625e5a018ac0b072bbb59bc35bfc63。AWS官方列anonymous pull1/s，短退避有依據，但本次是否共享runner/IP造成仍UNKNOWN。[AWS quota](https://docs.aws.amazon.com/AmazonECR/latest/public/public-service-quotas.html)

Root exact7paths gated check/commit/clean、核remote仍4051後正常FF專用branch，新Source/push/attempt1恢復原six-person→15legs；不GH rerun。三次仍限流便保留原失敗停止，不盲開相同內容job、不登入registry／換IP或額度。40／60與Hosted容量尚未通過，Native14只證完整cold capture/transfer、未restore。主機US$0／US$5 cap、原WIP／G8停止85保護，Hosted／Production／真寄信0。
