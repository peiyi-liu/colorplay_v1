# M23：公開郵件範本權限與業務前讀取驗證

**ACCEPTED_TOOL_FIX_PENDING_NATIVE**。Root唯一一輪審查，Standards／Spec／Security各0 findings；base294b74807b03266e7a58087cda138a2ea5a3affd。對應WB4／AC-PERF-003前置條件，非註冊修復或容量／phase PASS。

## 變更與修改檔案

exact6Source：linux_project_inputs.py、linux_bootstrap_backend.py、linux-local-bootstrap.py、test_linux_project_inputs.py、test_linux_local_bootstrap.py、test_linux_template_readback.py。只將literal公開email-otp.html複本以FD/no-follow/owner/nlink/hash檢查後設0444，其他檔600／目錄700，原Source不動；0444不是kernel immutable。CLI原bind仍RW，不冒稱RO。

在原containers確認後／業務前，以本job Kong精確ID/image/name/project/pid/mount前後核，UID100:65533確認BusyBox nc applet並固定loopback兩GET；HTTP200、單一Content-Length與原template bytes/SHA全部匹配。拒redirect／chunked／encoding／未知headers／default內容。shared10s、單命令≤2s且保原timeout-1關閉餘裕，unknown／cancel／late／writer fail皆不READY；不加重試或套件。成功只READBACK_OBSERVED/NONE。失敗以requests固定wx600安全閉集metadata best-effort保留，不遮蔽原error、不記body／Env／URL／OTP。

## 驗證

Worker最終Python199tests、lint／typecheck／import／static／diff全0。Root核packet49records／6Source、1792unowned非文件actualGit、operator44，獨立重跑3files42tests及42個HTTP framing/body完整性／literal-whitelist控制皆PASS。最長Source464行；原auth-journey505例外不動。Root第一次input測試缺DEVELOPER_DIR造成Xcode license exit69；設既定CommandLineTools後11tests全通過，非Source finding。

Worker全域format:check初exit1，僅四份base既存文件；Root另作S級排版修正：M4 review／M4 addendum／M13 brief／M10 brief，三份僅空白；M10另將既有字面路徑模式加code標記，去空白與backtick後內容相同。既有format失敗不冒稱原本通過。原七protected與handoff前575959bytes核符。有效RED、fixture／manifest／probe資格修正保留；未skip／刪assertion／放寬SLO。

Packet e90139e129bed1aa662daf9c6e81bedfa8d2bfd955a318f4eebfce72dd6c0cb3；Rootreceipt 22f282dbf375471f3552a2b553ddc825c4c54e7e891f7426dc1ab6a7c7e3e531。

## 限制與下一步

Native17實際otp_mail OTP_COUNT0與完整cold custody保持，首次403／Auth default fallback仍屬推論，不回填成直接trace。真Linux nc applet／Kong讀取／註冊尚未驗證，線下模擬不代替實際結果。

Root只提交6Source＋brief／本report／handoff＋4份空白排版共13paths，cachedcheck／clean與remote精確SHA核後正常FF專用branch，新Source／push／attempt1正常six-person→15legs；不GH rerun、不另開0business gate。非PASS停升級。G8停止85／原WIP保護，主機US$0／US$5上限；40/60未驗、Hosted／Production／真寄信0。全域格式修正後結果另記handoff。
