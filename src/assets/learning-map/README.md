# JRPG Learning Map Artwork

This directory contains the fixed, modular artwork for the six-chapter forest-village learning map. Chapter names, access states, progress, and actions remain HTML; the artwork contains no localized labels.

## Asset inventory

| File                           | Dimensions |   Bytes | Role                                                                       |
| ------------------------------ | ---------: | ------: | -------------------------------------------------------------------------- |
| `forest-village-base.webp`     |   1200×800 | 282,376 | Shared forest village, paths, river, fountain, and six empty building pads |
| `chapter-1-school.png`         |    512×384 |  48,568 | Chapter 1 village school sprite                                            |
| `chapter-2-workshop.png`       |    512×384 |  59,037 | Chapter 2 color workshop sprite                                            |
| `chapter-3-library-tower.png`  |    512×384 |  41,894 | Chapter 3 library tower sprite                                             |
| `chapter-4-observatory.png`    |    512×384 |  55,401 | Chapter 4 perception observatory sprite                                    |
| `chapter-5-forest-academy.png` |    512×384 |  78,937 | Chapter 5 forest academy sprite                                            |
| `chapter-6-master-hall.png`    |    512×384 |  80,667 | Chapter 6 royal master hall sprite                                         |
| `locked-cloud.png`             |    256×160 |  10,264 | Locked-state cloud and padlock overlay                                     |
| `construction-overlay.png`     |    384×192 |  20,136 | Under-construction scaffold overlay                                        |
| `completion-emblem.png`        |    128×128 |   6,165 | Completed-chapter emblem                                                   |
| `adventurer-idle.png`          |    256×160 |  10,719 | Two equal 128×160 idle-animation frames                                    |

Total optimized image bytes: **694,164** (0.662 MiB).

## Prompt provenance

Generated with OpenAI's built-in image generation tool on 2026-08-04. The owner-provided screenshot was used only to establish the desired JRPG forest-village mood and information hierarchy; no pixels were copied, cropped, or reproduced. Each output is an original modular asset.

Every generation included this shared direction:

> Original high-detail 16-bit JRPG pixel art for a forest-kingdom learning village. Crisp deliberate pixel clusters, coherent three-quarter top-down lighting, rich but readable detail, transparent background for sprites, no words, no letters, no numbers, no logos, no copyrighted characters, and do not reproduce or crop the supplied reference screenshot.

Generation source identifiers:

- Base: `exec-347a32e2-d822-48bc-8f00-dc9fe71a14d2.png`
- Chapter buildings 1–6: `exec-76cb4bf3-1b6a-4449-9f66-fe18acbe7f7b.png`, `exec-832b507e-dc1c-4d02-9540-12cd756f5f28.png`, `exec-5405b5ce-3770-4fdc-8899-12c17a849859.png`, `exec-7e81808d-c92c-40ee-9725-da9e9cc111ee.png`, `exec-e076dcf0-fa94-4746-bdc0-5814497fa6ca.png`, and `exec-68778444-2be4-4d89-aa10-f6b065638d28.png`
- State and character sprites: `exec-2e731aa8-0a70-4930-bcc4-caf8f1195ea7.png`, `exec-2dc85edc-2ec6-488d-b20f-c324794c3cdf.png`, `exec-823300be-64f9-4b62-a9f0-52143416620e.png`, and `exec-2b83f7c5-efaf-4d4d-93a3-7b9ea10231a2.png`

## Optimization commands

Sprite backgrounds were generated as flat `#ff00ff` chroma key and removed with the image-generation skill's helper:

```sh
python3 remove_chroma_key.py --input INPUT.png --out OUTPUT.png --auto-key border --soft-matte --transparent-threshold 12 --opaque-threshold 220 --despill
```

Pillow then cropped the alpha bounding box, resized with Lanczos, placed the result on the documented fixed canvas, and saved an optimized 96–160 color PNG with `compress_level=9`. The two idle frames were normalized independently into equal 128×160 cells. The base was resized to 1200×800 and saved as WebP with `quality=82` and `method=6`.

No text is baked into these assets.
