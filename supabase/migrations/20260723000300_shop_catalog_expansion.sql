-- Blook 商店目錄擴充（owner 2026-07-21 #14）：新增 8 個頭貼與 4 個邊框。
-- 僅目錄資料；購買／裝備仍走既有 RPC 與帳本交易。

insert into public.blooks (
  id, stable_code, name, emoji, cost_tokens, status, sort_order
)
values
  ('50000000-0000-0000-0000-000000000007', 'panda_painter', '熊貓畫師', '🐼', 150, 'published', 7),
  ('50000000-0000-0000-0000-000000000008', 'koala_toner', '無尾熊調色師', '🐨', 300, 'published', 8),
  ('50000000-0000-0000-0000-000000000009', 'tiger_orange', '猛虎橙', '🐯', 400, 'published', 9),
  ('50000000-0000-0000-0000-000000000010', 'octo_mixer', '八爪配色師', '🐙', 600, 'published', 10),
  ('50000000-0000-0000-0000-000000000011', 'robo_blue', '機械藍調', '🤖', 800, 'published', 11),
  ('50000000-0000-0000-0000-000000000012', 'pixel_sprite', '像素精靈', '👾', 1200, 'published', 12),
  ('50000000-0000-0000-0000-000000000013', 'indigo_dragon', '東方靛龍', '🐲', 1500, 'published', 13),
  ('50000000-0000-0000-0000-000000000014', 'peacock_teal', '孔雀藍綠', '🦚', 2500, 'published', 14);

insert into public.avatar_frames (
  id, stable_code, name, gradient_start, gradient_end, cost_tokens, status, sort_order
)
values
  ('60000000-0000-0000-0000-000000000003', 'cherry_blossom', '櫻花粉彩', '#f472b6', '#fb7185', 40, 'published', 3),
  ('60000000-0000-0000-0000-000000000004', 'forest_guard', '森林守衛', '#22c55e', '#84cc16', 60, 'published', 4),
  ('60000000-0000-0000-0000-000000000005', 'royal_violet', '皇家紫金', '#8b5cf6', '#f59e0b', 90, 'published', 5),
  ('60000000-0000-0000-0000-000000000006', 'midnight_sky', '午夜星空', '#0f172a', '#6366f1', 120, 'published', 6);
