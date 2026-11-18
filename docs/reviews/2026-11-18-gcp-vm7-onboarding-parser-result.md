# VM7 40 人註冊後 parser 拒絕：Root 結果

## 結論

Source `be38f50b9b274a66a03244123e8ce85590971300`／run `44227747989`／job `134544990007`／push attempt1：functional15與匿名3/10/20 PASS；fresh40 INCONCLUSIVE。後續60人及其餘legs未執行，不能宣稱Local60或Staging驗收完成。原結果保留，不重跑舊job。

## 已定位與未知

40人均完成真UI註冊、post-login與same-subject Root readback，Authcreated40、ownershipKnown=true。entry58.027ms／send40of40 skew171.415ms皆<250；readback階段最終gate actor0 AUTH_LOGOUT403被拒，其他39因some短路UNOBSERVED。

M52的單次CDP body讀取成功、UTF8 bytes92一致、pending0；firstFailure=CODE，codeUNKNOWN。因此已排除本次BODY/base64/byte-mismatch分支，尚無原body以分辨canonical-key lexer、JSON.parse或strict body schema。CODE revoke後loginObserved/loginUiComplete不再記成功，不能以它們false宣稱真UI/login失敗。owned stopped Auth/Kong03:15–03:17UTC僅40 POST/logout403 session_not_found與40 Kong POST/auth/v1/logout?scope=local403，無其他>=400；這是aggregate log，不能當actor0 wire body。

M53五份真profile/job/boot/Source binding與contextMatches均核，firstCause=null/cancelled/timedOut/overflow=false/residue0；fresh40自行exit1，非父取消。M54真Live sideband200events、operation/cleanup failure均null，T1 presenter/report均200/FINISHED且frame+loader可證；S1/S2 OTHER未匹配，documents aggregate仍UNKNOWN。功能PASS不能解釋舊VM6 ERR_FAILED，也不回填舊VM5首因。

## 證據與驗證

artifact14394516859，ZIP43422789B／SHA `ff8941e59f79632eab1315e025577d0d11b472b1d83a2f77ae808561dc68088b`；cipher43422651B／SHA `eb8e6ff5a5e07097f040b7600454c923b0ce6db1ae91bba3a2a061a5a782d872`。Root真age核1394files216095835B，outermanifest `c5882c96d458d3867276467244f38e7204b565a5aeb5499f33cd8ffe153687c8`；cold1341files／8自然stop與roleproof／2DB127tables census ORDER_ONLY equal／31roles／3volumes全部hash/portable metadata核，未restore。profile `984c235e3e66f5fd4d1e18a540679809ddc60d9fca6d617f02aa5a25f8e799a7`。另25bootlogs30940B已保。本輪Root重算15功能/3legs PASS與原40 INCONCLUSIVE，沒有以cold custody當容量PASS。

## 停機與下一步

job03:27:02UTC completed/failure；runner27 auto移除、repo0。Root正常STOP VM7、GoogleConsole exactinstance8920317743019896087已核停止，未略過grace，100GBdisk保留仍計費；七VM全stopped。Rootfinal `.git/gcp-vm7-root-final-review.json` SHA `b5770abde35d5d2510902726ea9bcb78070b26dfa624626bb9750093989f5575`，截圖 `.git/gcp-vm7-stopped-20261118.jpg`。

M55只補單次body parser閉集reason與安全shape欄，原schema/keys/read/parse/lease/discount/PASS不動；同一agent離線、Root唯一review。資料不足前不擴白名單、不修產品或改限額。US150／不升paid／Hosted與Production寫入0；Local矩陣未過，不部署Staging。
