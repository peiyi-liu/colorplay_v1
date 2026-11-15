-- Digests attest immutable content; independent owned upload runs keep distinct
-- asset UUIDs even when their trusted content/manifest bytes are identical.
alter table public.content_media_assets
  drop constraint content_media_assets_manifest_sha256_key;

create index content_media_assets_manifest_sha256_idx
  on public.content_media_assets (manifest_sha256);
