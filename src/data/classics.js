import corpus from './gua64-data.js';
import crosscheckCorpus from './wikisource-crosscheck-data.js';

export const CLASSIC_FIELDS = [
  'judgment','line-1','line-2','line-3','line-4','line-5','line-6','tuan','great-image',
  'small-image-1','small-image-2','small-image-3','small-image-4','small-image-5','small-image-6'
];
export const CLASSIC_STATUSES = ['verified', 'variant', 'index-only', 'restricted', 'pending-review'];

const upstream = 'https://github.com/ZQing-Chen/yijing/blob/main/assets/data/gua64.json';
const crosscheckByNumber = new Map(crosscheckCorpus.map((item) => [item.number, item]));
const revisionLink = (item) => `${item.source}${item.source.includes('?') ? '&' : '?'}oldid=${encodeURIComponent(item.revision)}`;

const normalizeForComparison = (value) => String(value ?? '')
  .normalize('NFKC')
  .replace(/[\s，。；：、？！,.!?;:“”‘’「」『』《》（）()]/g, '')
  .replace(/^初[六九]|^[六九][二三四五]|^上[六九]/, '');

function fields(gua) {
  return {
    judgment: gua.judgment,
    tuan: gua.tuan,
    'great-image': gua.image,
    ...Object.fromEntries(gua.yao.map((line, index) => [`line-${index + 1}`, `${line.pos}：${line.text}`])),
    ...Object.fromEntries(gua.yao.map((line, index) => [`small-image-${index + 1}`, line.xiang]))
  };
}

function crosscheckFields(gua) {
  return {
    judgment: gua.judgment,
    tuan: gua.tuan,
    'great-image': gua.image,
    ...Object.fromEntries(gua.lines.map((line, index) => [`line-${index + 1}`, line])),
    ...Object.fromEntries(gua.lineImages.map((line, index) => [`small-image-${index + 1}`, line]))
  };
}

export const CLASSIC_CELLS = corpus.guas.flatMap((gua) => {
  const values = fields(gua);
  const crosscheck = crosscheckByNumber.get(gua.no);
  const second = crosscheckFields(crosscheck);
  return CLASSIC_FIELDS.map((field) => {
    const same = normalizeForComparison(values[field]) === normalizeForComparison(second[field]);
    return {
      hexagramNumber: gua.no,
      field,
      text: values[field],
      status: same ? 'verified' : 'variant',
      variants: same ? undefined : [
        { sourceId: 'zqing-chen-wangbi', text: values[field] },
        { sourceId: 'wikisource-xiyi', text: second[field], revision: crosscheck.revision }
      ],
      sourceIds: ['zqing-chen-wangbi', 'wikisource-xiyi'],
      sourceLinks: [upstream, revisionLink(crosscheck)],
      edition: corpus.meta.source,
      revision: crosscheck.revision,
      verificationNote: same ? '自动双本归一化一致；未经过人工学术校勘。' : '异文双版本：双底本存在实质或字形差异，保留两版，不静默合并。'
    };
  });
});

function extraCell(gua, prefix, suffix, text) {
  return {
    hexagramNumber: gua.no,
    field: `${prefix}-${suffix}`,
    text,
    status: 'pending-review',
    sourceIds: ['zqing-chen-wangbi'],
    sourceLinks: [upstream],
    edition: corpus.meta.source,
    reason: '仅主底本收录，尚无第二底本逐项交叉记录。',
    verificationNote: '单源待核：乾用九、坤用六按主底本 extra 单列，未经过人工学术校勘。'
  };
}

const qian = corpus.guas[0];
const kun = corpus.guas[1];
export const EXTRA_CLASSIC_CELLS = [
  extraCell(qian, 'qian-use-nine', '', `${qian.extra[0].pos}：${qian.extra[0].text}`),
  extraCell(qian, 'qian-use-nine', 'image', qian.extra[0].xiang),
  extraCell(kun, 'kun-use-six', '', `${kun.extra[0].pos}：${kun.extra[0].text}`),
  extraCell(kun, 'kun-use-six', 'image', kun.extra[0].xiang)
].map((cell) => ({ ...cell, field: cell.field.replace(/-$/, '') }));

export const CLASSIC_CORPUS_META = corpus.meta;
