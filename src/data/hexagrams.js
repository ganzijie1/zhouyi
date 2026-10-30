import { splitTrigrams } from '../domain/lattice.js';

export const TRIGRAMS = [
  { bits: 0, name: '坤', symbol: '☷', image: '地', direction: '西南' },
  { bits: 1, name: '震', symbol: '☳', image: '雷', direction: '东' },
  { bits: 2, name: '坎', symbol: '☵', image: '水', direction: '北' },
  { bits: 3, name: '兑', symbol: '☱', image: '泽', direction: '西' },
  { bits: 4, name: '艮', symbol: '☶', image: '山', direction: '东北' },
  { bits: 5, name: '离', symbol: '☲', image: '火', direction: '南' },
  { bits: 6, name: '巽', symbol: '☴', image: '风', direction: '东南' },
  { bits: 7, name: '乾', symbol: '☰', image: '天', direction: '西北' }
];

const NAMES = [
  '乾','坤','屯','蒙','需','讼','师','比','小畜','履','泰','否','同人','大有','谦','豫',
  '随','蛊','临','观','噬嗑','贲','剥','复','无妄','大畜','颐','大过','坎','离','咸','恒',
  '遁','大壮','晋','明夷','家人','睽','蹇','解','损','益','夬','姤','萃','升','困','井',
  '革','鼎','震','艮','渐','归妹','丰','旅','巽','兑','涣','节','中孚','小过','既济','未济'
];

// bit 0 为初爻；每项按文王卦序记录下卦 | (上卦 << 3)。
export const KING_WEN_ORDER = [
  63,0,17,34,23,58,2,16,55,59,7,56,61,47,4,8,
  25,38,3,48,41,37,32,1,57,39,33,30,18,45,28,14,
  60,15,40,5,53,43,20,10,35,49,31,62,24,6,26,22,
  29,46,9,36,52,11,13,44,54,27,50,19,51,12,21,42
];

export const HEXAGRAMS = NAMES.map((name, index) => {
  const bits = KING_WEN_ORDER[index];
  const { lower, upper } = splitTrigrams(bits);
  return {
    number: index + 1,
    name,
    symbol: String.fromCodePoint(0x4dc0 + index),
    bits,
    binary: bits.toString(2).padStart(6, '0'),
    lowerTrigram: TRIGRAMS[lower].name,
    upperTrigram: TRIGRAMS[upper].name,
    section: index < 30 ? 'upper' : 'lower',
    sourceIds: ['wikisource-xiyi', 'ctext-book-of-changes']
  };
});

export const HEXAGRAM_BY_BITS = new Map(HEXAGRAMS.map((item) => [item.bits, item]));
export const HEXAGRAM_BY_NUMBER = new Map(HEXAGRAMS.map((item) => [item.number, item]));
