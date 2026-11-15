# Linux runtime M2：必要Linux fixture相容追加

Root核准追加`tests/contracts/whole-site-execution-profile.test.ts`與`tests/contracts/whole-site-capacity-linux-health.test.ts`，只把explicit Linux正向scope fixtures由原Mac5helper集合換成正式9helper集合；Mac fixtures與原負向／門檻／assertions全部保留。這是M2強制profile與helper集合相符的必要調整，不更改M1 production modules。總allowlist為10source＋10tests＝20，其他ownership與禁止事項維持原brief。

已確認公共契約：request.profileRuntime={helperClosureSha256}；closure固定{schemaVersion:1,sourceRevision,executionProfileSha256,files:{13精確basename→hash}}。profile-preflight args為[revision,profileSha,fresh32hexchallenge]，回應strict sourceRevision/challenge/observed三欄。capacity Linux CLI只新增獨立--approve request原始bytes SHA，不採信request自報批准。

Root另已核准唯一pure fixture helper`tests/contracts/helpers/whole-site-linux-runtime.ts`，只共用synthetic profile／approved hashes／13 fake filesystem source bytes，仍透過真M1 authority與真loader；用於M2已核准接線測試、保持單檔<500，不重構其他M1測試。最終allowlist為10source＋11test paths＝21，取代前述20數量；其他禁止事項不變。
