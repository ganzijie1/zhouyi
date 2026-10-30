# Generated Asset Sources

## ImageGen CLI assets

The two decorative backgrounds under `public/assets/generated/` were generated on 2026-10-29 with the skill-bundled `image_gen.py` CLI using `gpt-image-2`, `quality=high`, and PNG output. The untouched API outputs are retained in `public/assets/generated/source/`. Responsive 640 px and 1280 px WebP derivatives were produced locally with Pillow using LANCZOS resizing and WebP quality 72.

The exact prompts, file dimensions, byte sizes, SHA-256 hashes, and post-processing record are stored in `public/assets/generated/manifest.json`.

Manual visual inspection found no readable text, Chinese characters, Latin letters, numbers, hexagrams, trigrams, mathematical diagrams, graph nodes, watermarks, people, or fake manuscript content.

These images are decorative atmosphere only. They are not ancient text, mathematical evidence, a proof certificate, a hexagram relationship, or an interpretation of the Yijing. The application must remain fully usable when either image fails to load.

这些生成图不是古代文物或古籍原件，不属于经典证据、数学真值或卦象真值，仅用作低对比度装饰背景。

## Prompt summaries

- `yijing-proof-texture`: low-contrast handmade paper and sparse nonrepresentational ink texture for the proof center, with explicit exclusions for text, symbols, diagrams, semantic graph elements, seals, watermarks, people, objects, and fake manuscripts.
- `yijing-lattice-atmosphere`: abstract paper fibers and soft broken ink paths suggesting movement without depicting a real mathematical or textual system, with the same exclusions.

The complete prompts are preserved verbatim in the manifest.
