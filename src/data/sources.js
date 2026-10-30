export const SOURCES = [
  {
    id: 'zqing-chen-wangbi',
    name: 'ZQing-Chen/yijing《周易》结构化底本',
    url: 'https://github.com/ZQing-Chen/yijing/blob/88dc8f812586eb21ae713e11f26c2e8b564b6f33/assets/data/gua64.json',
    version: '固定 revision 88dc8f812586eb21ae713e11f26c2e8b564b6f33，元数据标注“周易通行本（王弼本）”',
    accessedAt: '2026-10-29',
    license: 'MIT；底本版本称谓来自上游元数据，不代表学术定本认证',
    fieldScope: ['judgment', 'lines', 'tuan', 'great-image', 'small-images', 'qian-kun-extra'],
    status: 'verified'
  },
  {
    id: 'wikisource-xiyi',
    name: '维基文库《周易》逐卦页面',
    url: 'https://zh.wikisource.org/zh-hans/%E5%91%A8%E6%98%93',
    version: '逐卦页面修订号随经典单元记录',
    accessedAt: '2026-10-29',
    license: '公版原典；Wikisource 页面文本按 CC BY-SA 4.0 署名与同方式共享',
    fieldScope: ['hexagram-index', 'judgment', 'lines', 'tuan', 'xiang'],
    status: 'verified'
  },
  {
    id: 'ctext-book-of-changes',
    name: '中国哲学书电子化计划《易经》',
    url: 'https://ctext.org/book-of-changes/zh',
    version: '在线数据库',
    accessedAt: '2026-10-29',
    license: '仅作交叉核对与原文链接；遵循原站使用条款',
    fieldScope: ['cross-check', 'stable-index'],
    status: 'cross-check'
  }
];
