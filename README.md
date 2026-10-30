# 卦格：周易数学全景网页版

这是一个直接进入 12 关推演的静态网页应用。它把六爻状态建模为六阶布尔格 `B6`，并提供六十四卦图谱、经传索引、关系实验室与证明中心。现代数学用于描述状态、对称和路径，不等于《周易》古典原义，不证明预测效力，也不提供占卜或现实建议。

## 运行

要求 Node.js 20 以上。

```powershell
npm ci
npm run dev
npm test
npm run test:production
npm run test:e2e
npm run test:performance
npm run preview
```

`test:production` 会构建 `dist/` 并扫描生产 JavaScript，保证 E2E 的 `window.__YIJING_TEST__` 解锁/解答入口没有进入生产包。`test:performance` 需要先启动生产预览。生产构建可部署到普通静态服务器。

当前验收基线：固定语料 1,132 段，Node 单元测试 79/79，Playwright 36/36，需求验收 14/14，代码审查 97/100。早期实现报告中的 1,134、67/67、32/32 已被后续审查修正，不是当前口径。

## 四层内容契约

- 经典原文：结构化底本的卦辞、六爻辞、《彖》、大象和六条小象。
- 传统规则：互、错、综、得位、应、比、承、乘；规则版为 `zhouyi-core-v1`。
- 数学定理：`B6`、`B3×B3`、Klein 四元群、`Q6`、XOR、Hamming 距离和 BFS。
- 现代解释：关系图与检索方式，始终标记为形式化解释。

## 位序与卦序

bit 0 是初爻，bit 5 是上爻；下卦占低三位，上卦占高三位。二进制序、七层秩序和文王卦序是三种不同顺序，界面不会把它们混作一种距离。

## 经典数据

`src/data/gua64-data.js` 从 MIT 许可的 `ZQing-Chen/yijing` 结构化底本生成；版本名“周易通行本（王弼本）”来自上游元数据，不是本项目对学术定本的认证。`src/data/wikisource-crosscheck-data.js` 保存维基文库逐卦页面的公版经典正文、URL 与固定 revision，用于机械双底本比对。归一化后相同的常规字段显示为“自动双本一致”，不同字段显示为“异文双版本”并保留两版；两者都不等于人工学术校勘。CText 本轮无法稳定访问，因此只保留在来源目录中，不挂到任何已核字段上。

覆盖矩阵共 964 个单元：64 × 15 = 960 个常规双底本单元，另含乾用九、坤用六及其小象 4 个单源待核单元。常规字段双底本一致或异文实录率为 100.000%；按全体 964 单元计算，一致或异文实录率为 99.585%，单源待核率为 0.415%。来源和许可见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。

## 目录

- `src/domain/`：纯函数格运算、传统关系、BFS 与关卡状态机。
- `src/data/`：六十四卦、固定版经典与十翼快照、来源和覆盖校验。
- `public/data/`：语料 manifest、有限域证明证书、FCA 与证据图谱产物。
- `src/services/`：版本化 localStorage 与页面加载期预生成、预加载的轻量 HTMLAudio 音效。
- `src/ui/`：五视图 DOM 应用。
- `test/unit/`：64/4096 穷举、数据、关卡和存档契约。
- `test/e2e/`：Playwright 五视图、三视口和可访问性契约。

## 存档与可访问性

进度和设置分键保存；损坏或未来版本会安全回退，v0 数据可迁移。设置对话框可在二次确认后清除关卡进度，并保留静音与减弱动态设置。界面提供键盘 `1-6` 翻爻、可见焦点、44px 触控目标、减弱动态和含 192 条覆盖边的图谱文本替代。

## 性能预算

固定 Chromium 下：FCP P75 不高于 1.5s，LCP P75 不高于 2.5s，核心交互 P95 不高于 100ms，图谱切换 P95 不高于 150ms；核心 HTML/CSS/JS gzip 总计不高于 250KiB。性能脚本记录浏览器版本、操作系统、CPU、内存、10 次冷启动、5 次预热和 50 次计分样本；冷启动、预热核心交互、计分交互与图谱阶段捕获的长任务全部纳入 50ms 门禁，失败时生成 Playwright trace。

## 形式证书与视觉资产

`node scripts/generate-formal-artifacts.mjs` 从固定快照重建 1,132 段语料清单、FCA、证据图谱、有限域证明证书与 CYFS 封闭系统证书。CYFS 以 ZFC（含选择公理）和经典逻辑为元理论，用十条对象公理规定文本、作品类、顺序和六爻状态的形式语义；1,132 段全部可逆编码，1,366,324 个有限原子实例全部判定，未定义值为 0。任意合法复合公式通过结构递归生成证明或反证轨迹。

该“完全性”只针对这里构造的封闭数学版《周易》：历史原意、注疏和现实效力按定义不进入对象理论。显式有限模型证明对象公理共同可满足，不声称 ZFC 能在自身内部证明自身一致性。完整证书见 `public/data/closed-yijing-certificate.json`，实现见 `src/domain/closed-yijing.js`。

证明中心使用两项 `gpt-image-2` 高质量 ImageGen CLI 装饰资产。实际 CLI 为 `C:/Users/Administrator/.codex/skills/.system/imagegen/scripts/image_gen.py`，manifest 以 skill 相对路径 `imagegen/scripts/image_gen.py` 记录。未覆写原图位于 `public/assets/generated/source/`，每张各导出 640/1280 WebP；完整提示词、模型、日期、尺寸、哈希和处理记录见 `public/assets/generated/manifest.json` 与 [ASSET_SOURCES.md](./ASSET_SOURCES.md)。图片不承载经典或数学信息，加载失败时自动回退为纯色纸面，不影响证明、筛选和下载。

## 已知边界

- 经典异文保留两版，不静默合并；自动比较仍需人工抽查。
- 乾用九、坤用六四个额外单元仍是单源待核；所有经典字段都尚未完成人工逐字段学术签核。
- 承、乘、应等谓词存在流派表达差异，界面固定显示规则版本和边界。
- 图论邻近、词频和群轨道不表达吉凶或现实建议。
- FCA 的“完整”只指固定 5 属性构成的有限形式背景；完整 history 模型也只覆盖当前 12 关及其显式动作与预算。
