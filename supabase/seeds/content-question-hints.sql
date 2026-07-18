-- 由 scripts/content/import-questions.mjs 產生，請勿手動編輯。
-- 提示為 AI 草稿（import-fixes.json hintDrafts），待教師審閱；產生時間 2026-07-18T01:24:13.137Z
begin;

insert into public.question_hints (question_id, question_version, hint_level, content)
values
  ('79cb7f62-42c7-6e6f-bd92-a4a09cfc0630', 1, 1, '先分清楚：純色加白、加黑、加灰，各會得到哪一類色彩？'),
  ('79cb7f62-42c7-6e6f-bd92-a4a09cfc0630', 1, 2, '加白會讓色彩變亮，加黑則相反；色彩的名稱就跟著明暗走。'),
  ('79cb7f62-42c7-6e6f-bd92-a4a09cfc0630', 1, 3, '含灰的才叫濁色；這題不含灰、而且明度降低，想想相對於「明色」的那一類。'),
  ('c2081b23-16be-289e-9c3a-ddafd0ccab97', 1, 1, '想想我們用哪三個性質來描述一個色彩的「相貌、明暗、鮮豔」。'),
  ('c2081b23-16be-289e-9c3a-ddafd0ccab97', 1, 2, '這三個性質的英文簡稱合起來叫 HVC。'),
  ('c2081b23-16be-289e-9c3a-ddafd0ccab97', 1, 3, '其他選項描述的是光的物理量或視覺條件，不是色彩本身的三個基本性質。'),
  ('b11aaec8-599b-c89b-183f-76d9d951ac21', 1, 1, '水墨畫只用黑墨，靠什麼變化畫出濃淡層次？'),
  ('b11aaec8-599b-c89b-183f-76d9d951ac21', 1, 2, '墨加水變淡、少水變濃——這改變的是色彩三要素中的哪一個？'),
  ('b11aaec8-599b-c89b-183f-76d9d951ac21', 1, 3, '黑、灰、白之間的深淺變化，就是這個要素的階段變化。');

commit;
