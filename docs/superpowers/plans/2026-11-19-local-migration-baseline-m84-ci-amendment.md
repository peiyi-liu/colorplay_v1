# M84 Root CI 接線補充

原 M84 brief／12個 worker ownership／protected baseline不變。Root另負責Recovery的 .github/workflows/ci.yml，只在 unit job 原coverage前新增一個pure Python命令：

```sh
python3 -B -m unittest discover -s tests/contracts -p 'test_linux_migration_baseline.py'
```

現有CI只執行固定Python drivers，沒有test_linux_*.py discover，因此新regression原先不會自動執行。此補充不刪或放寬任何既有test／job／skip／SLO／timeout，不變更Native矩陣或Hosted workflow。

原9177B/SHA b93b92aa1ea996b315573c74f5090e87a17a5ecb45150227368dc78adcd6c2e0作historical pin，新增恰兩行step後SHA b381ba450e03fa7863a9ebfd40bdb0c0b2903dc5e026b462311503220fd5fda6；移除唯一兩行addition可逐byte恢復原file。保留原baseline不改，current exemption只此Root一筆，剩57207 current＋1historical；worker不得修改workflow。Root amendment .git/m84-root-ci-wiring-amendment.json SHA 8051f48d10124b14e17430ca4e81821ea3c72ccb9874d0c9edfd01b6ca7aca9e。Root會自行驗命令、YAML/格式與exact delta，納同一候選Source，真CI仍待新版本。
