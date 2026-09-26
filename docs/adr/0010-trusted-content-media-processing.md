# ADR 0010: Trusted content media processing

Status: Accepted  
Date: 2026-09-26

## Context

Content Studio must accept JPG, PNG, and WebP sources without trusting the
browser to resize, orient, validate, or name the delivered object. Review-card
images can be color-critical, so a smaller file is not acceptable if it changes
the teaching meaning. Physical Storage paths must not become durable content
identifiers or leak through the student read API.

Supabase's official image-manipulation guidance recommends a WASM processor for
Edge Functions and states that native libraries such as Sharp are unsupported:
<https://supabase.com/docs/guides/functions/examples/image-manipulation>.

## Decision

- Use exactly `@imagemagick/magick-wasm@0.0.43` in the Supabase
  `content-media` Edge Function. The official Deno example's x86 WASM artifact
  is loaded explicitly; dependency and runtime upgrades are reviewed changes.
- The browser may pre-check a file, but only the trusted processor determines
  its magic MIME, dimensions, EXIF orientation, alpha handling, WebP variants,
  pixel signature, byte budgets, and manifest digest.
- Sources are limited to 2 MiB and 4096 px per dimension. Standard assets emit
  320 px and 800 px WebP variants. Color-critical assets additionally emit a
  bounded 1200 px variant whose structural-similarity distortion is at most
  0.01 and whose size is at most 250 KiB.
- Uploads use one signed, run-scoped quarantine key. Final objects use
  server-derived content-addressed keys with overwrite disabled. Verified
  manifests and variants are append-only.
- Published content stores `content-media:<asset UUID>`. The server rechecks
  access to current published content before returning short-lived signed URLs;
  neither the browser nor a content row stores a physical final path.

## Consequences

The pipeline spends server CPU once during authoring in exchange for smaller
student payloads and deterministic delivery. A processor upgrade cannot silently
rewrite historical assets: it needs a new ADR or ADR amendment, fixture proof,
and an explicit reprocessing plan. If the WASM bundle, alpha/EXIF fixture,
quality threshold, or byte budget fails, publication is fail-closed; the
browser-generated preview is never promoted as a trusted fallback.
