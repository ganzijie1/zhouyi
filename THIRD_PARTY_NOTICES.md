# 第三方来源与许可

## 《周易》结构化数据

- 上游：<https://github.com/ZQing-Chen/yijing>
- 固定 revision：`88dc8f812586eb21ae713e11f26c2e8b564b6f33`
- 文件：`assets/data/gua64.json`
- 上游元数据版本：周易通行本（王弼本）
- 许可：MIT License
- Copyright (c) 2026 ZQing-Chen

本项目保留上游原文与字段结构，并添加逐字段来源链接。版本称谓来自上游元数据，不代表本项目对其作“唯一学术定本”的认证。维基文库《羲易》和中国哲学书电子化计划《易经》仅作为交叉核验入口；使用时仍须遵循各站点条款。

## 维基文库逐卦交叉底本

- 页面根目录：<https://zh.wikisource.org/zh-hans/周易>
- 修订号索引：由 `toastedqu/meihua` 的 `app/data/classics.json` 提供逐卦页面 URL 与 revision，交付包只保留公版经典正文和原页面归属信息
- 页面文本许可：Creative Commons Attribution-ShareAlike 4.0 International（CC BY-SA 4.0）
- 处理：仅做标点归一化比较；相同项标“已校勘（双底本自动比对）”，不同项完整保留两版并标“异文”

自动比对不是人工学术定本审定。`toastedqu/meihua` 仓库未发现 LICENSE，因此本项目不复制其程序代码，只使用其指向维基文库页面的来源 URL 与修订号索引。

MIT 全文：

> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, subject to inclusion of the copyright and permission notice. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.

## 软件

- Lucide icons：ISC License
- Vite：MIT License
- Playwright：Apache-2.0 License

## 十翼固定文本快照

- 上游：<https://github.com/muyen/decoding-iching>
- 固定 revision：`8ff4ffc8802ee9afd075da875cc3d39e8706be82`
- 文件：`data/yizhuan/yizhuan_complete.json`
- 许可：CC BY-NC-SA 4.0

本项目只导入该固定 revision 的十翼文本段落，并记录逐段 SHA-256；不采用上游的现代分析、翻译或模型结论。该来源许可含非商业与相同方式共享限制。语料闭包只针对本项目声明的选定传世底本版本，不代表全部出土本、异文与历代注疏。

## ImageGen 装饰资产

两项背景图由 `gpt-image-2` 通过 ImageGen CLI 于 2026-10-29 生成，质量为 `high`。执行脚本为 `C:/Users/Administrator/.codex/skills/.system/imagegen/scripts/image_gen.py`；manifest 使用可移植的 skill 相对路径 `imagegen/scripts/image_gen.py`。

未覆写 API 原图：

- `public/assets/generated/source/yijing-proof-texture-gpt-image-2-original.png`
- `public/assets/generated/source/yijing-lattice-atmosphere-gpt-image-2-original.png`

每张原图各有 640 和 1280 WebP 导出。完整提示词、生成时间、原图/导出尺寸、字节数、SHA-256、人工处理和用途边界见 `ASSET_SOURCES.md` 与 `public/assets/generated/manifest.json`。

这些图片不是古代文物、古籍扫描、经典证据、数学证书或卦象真值。当前形式系统只在 1,132 段固定语料、显式公理和有限状态域内给出可复算结论；74/74 Node 与 35/35 Playwright 验证不证明唯一语义、作者原意、占筮或预测效力。
