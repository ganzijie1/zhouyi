# Review Fix Report 03 - Round 1

日期：2026-10-29

## 返工范围

本轮只处理 `requirement_validation_report_03.md` 指出的五项硬缺口。

1. 新增统一 `public/data/claims.json`，登记 21 条声明，覆盖 `corpus`、`structure`、`traditional`、`fca-graph`、`model-info` 五类。每条均含 `claimId/domain/axioms/evidence/boundary/status`；证明中心所有可见结论用唯一 `data-claim-id` 回链。
2. `proof-certificate.json` 现内置固定种子下 12 关模型检查的有限输入域、实际访问状态数、转移数、最短轨迹、预算和不变式，并登记 7 类存档迁移输入及输入/结果哈希。
3. 新增确定性的 `descriptive-statistics.json`，只报告 B6 六个位分布、七个秩层、固定词项分布及 Shannon 熵；边界明确说明这些量仅是描述，不推出语义、因果或预测效力。
4. 证明中心新增 18 个可键盘展开的 FCA 概念项，展示 extent/intent；同时展示传统规则版本、适用域、谓词定义、流派/校勘边界、12 关模型检查和描述统计。
5. 证据图谱以统一 claims 清单生成 claim 节点和逐条 `supported-by` 直接证据边。当前为 1,649 节点、7,820 边，零悬空；所有必需证据边均通过校验。

## 测试先行

先新增 4 个单元契约和 3 个 E2E 契约，并确认红线：新增单元 0/4、新增 E2E 0/3。实现后结果如下：

- 单元测试：72/72 通过（原 68，新增 4）。
- E2E：35/35 通过（原 32，新增 3）。
- 证明中心定向 E2E：10/10 通过，覆盖 1440x900、390x844、360x800。
- `npm run validate:formal`：通过；证明证书字节级可复现，FCA、证据图谱、公理 DAG、claims 和描述统计哈希闭合。
- `npm run test:production`：通过；Vite 生产构建成功且产物无 E2E 测试钩子。
- 测试语法检查：25 个文件通过。

## 可审计结果

- 统一声明：21 条，其中 corpus 1、structure 12、traditional 2、fca-graph 3、model-info 3。
- FCA：1,132 对象、5 属性、1,454 关联、18 概念，完整且未截断。
- 模型检查：12 关；7 类存档迁移输入全部通过。
- 描述统计结果哈希：`47bd9cd8c4b80edbf0013d18a61bf7cebf25384b8c607565e0adeb295b844b4c`。
- 语义边界：形式结果仍只对固定语料、固定代码、显式公理和有限论域成立；不声称穷尽所有出土本、异文、历代注疏、作者原意、唯一义理或预测效力。
