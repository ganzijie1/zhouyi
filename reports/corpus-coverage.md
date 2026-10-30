# 固定版语料覆盖报告

- 语料版本：`selected-transmitted-base-2026-10-29`
- 解析器版本：`formal-artifacts-1.1.0`
- 总段落：1,132
- 固定版本、来源、许可、逐段 SHA-256：100%
- 空文、重复 ID、重复位置、未分类、哈希失配：均为 0
- 主底本固定快照：`ZQing-Chen/yijing@88dc8f812586eb21ae713e11f26c2e8b564b6f33`
- 十翼固定快照：`muyen/decoding-iching@8ff4ffc8802ee9afd075da875cc3d39e8706be82`
- 两个快照的内容哈希与组合哈希见 `public/data/corpus-manifest.json`

上游十翼 JSON 的 `xiang_lower` 尾部重复混入两篇文言；导入器按标题边界排除这两项，并从专用 `wenyan` 篇各导入一次，因此固定闭包为 1,132 段。

边界：此处“覆盖 100%”只表示 manifest 声明的选定传世底本版本没有缺段，不包括全部出土本、异文、历代注疏或现代研究，也不等于人工学术定本。
