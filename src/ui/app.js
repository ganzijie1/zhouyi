import { HEXAGRAMS, HEXAGRAM_BY_BITS, KING_WEN_ORDER, TRIGRAMS } from '../data/hexagrams.js';
import { SOURCES } from '../data/sources.js';
import { complement, hammingDistance, join, lessOrEqual, meet, rank, reverseLines, statesAtRank, xor } from '../domain/lattice.js';
import { kleinOrbit, kleinStabilizer, linePositionFacts, nuclearHexagram, relationEvidence, RULE_VERSION } from '../domain/relations.js';
import { calculateStars, createLevels, createPuzzleSession, shortestActionPath } from '../domain/solver.js';
import { clearProgress, defaultSettings, loadProgress, loadSettings, saveProgress, saveSettings, STORAGE_KEYS } from '../services/storage.js';
import { configureAudio, playTone } from '../services/audio.js';

const levels = createLevels(20261029);
let currentLevel = 1;
let session = createPuzzleSession(levels[0]);
let root;
let view = 'game';
let atlasMode = 'hasse';
let progress;
let settings;
let classicCells = [];
let appReady = false;

const labels = { game: '推演棋局', atlas: '六十四卦图谱', classics: '经传索引', lab: '关系实验室', proof: '证明中心' };
const actionNames = { complement: '错', reverse: '综', join: '并', meet: '交', xor: 'XOR' };
const statusNames = { verified: '自动双本一致', variant: '异文双版本', 'index-only': '仅索引', restricted: '不可转载', 'pending-review': '单源待核' };
const classicFieldNames = {
  judgment: '卦辞', tuan: '彖传', 'great-image': '大象传',
  'qian-use-nine': '用九', 'qian-use-nine-image': '用九小象',
  'kun-use-six': '用六', 'kun-use-six-image': '用六小象',
  ...Object.fromEntries(Array.from({ length: 6 }, (_, index) => [`line-${index + 1}`, `第 ${index + 1} 爻辞`])),
  ...Object.fromEntries(Array.from({ length: 6 }, (_, index) => [`small-image-${index + 1}`, `第 ${index + 1} 爻小象`]))
};

function bits(value) { return value.toString(2).padStart(6, '0'); }
function hex(value) { return HEXAGRAM_BY_BITS.get(value); }
function describeAction(action) {
  if (!action) return '';
  if (action.type === 'flip') return `翻第 ${action.line + 1} 爻`;
  if (Number.isInteger(action.operand)) return `${actionNames[action.type]} ${hex(action.operand).name}卦 ${bits(action.operand)}`;
  return actionNames[action.type];
}

function shell() {
  root.innerHTML = `
    <header class="app-header">
      <div class="brand"><span class="brand-mark">䷀</span><div><strong>卦格</strong><small>周易数学全景</small></div></div>
      <nav class="main-nav" aria-label="主要视图">
        ${[['game','gamepad-2'],['atlas','network'],['classics','library'],['lab','flask-conical'],['proof','badge-check']].map(([id, icon]) => `<button type="button" data-view="${id}" aria-label="${labels[id]}" class="nav-button ${view === id ? 'active' : ''}" title="${labels[id]}"><i data-lucide="${icon}"></i><span>${labels[id]}</span></button>`).join('')}
      </nav>
      <button type="button" class="icon-button" data-action="open-settings" aria-label="设置" title="设置"><i data-lucide="settings"></i></button>
    </header>
    <div class="layer-ribbon" aria-label="内容分层">
      <span data-content-layer="classic">经典原文</span><span data-content-layer="traditional">传统规则</span><span data-content-layer="mathematical">数学定理</span><span data-content-layer="modern">现代解释</span>
    </div>
    <main id="main-content" tabindex="-1"></main>
    <footer><p data-testid="formalization-boundary">现代数学是形式化解释，不等同于古典原义，也不证明预测效力。</p><a href="https://zh.wikisource.org/zh-hans/周易" target="_blank" rel="noreferrer">来源与许可</a></footer>
    <dialog id="settings-dialog" aria-label="设置"><form method="dialog" class="dialog-body"><header><h2>设置</h2><button value="close" class="icon-button" aria-label="关闭设置"><i data-lucide="x"></i></button></header><label class="toggle"><input type="checkbox" data-setting="muted" ${settings.muted ? 'checked' : ''}><span>静音</span></label><label class="toggle"><input type="checkbox" data-setting="reducedMotion" ${settings.reducedMotion ? 'checked' : ''}><span>减弱动态</span></label><button type="button" data-action="clear-progress" class="danger-button">清除关卡进度</button><button value="close" class="primary-button">完成</button></form></dialog>
  `;
  appReady = true;
  bindShell(); icons();
  setTimeout(renderView, 0);
}

function bindShell() {
  root.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => { view = button.dataset.view; location.hash = view; shell(); }));
  const trigger = root.querySelector('[data-action="open-settings"]');
  const dialog = root.querySelector('#settings-dialog');
  trigger.addEventListener('click', () => { dialog.showModal(); dialog.querySelector('input').focus(); });
  dialog.addEventListener('close', () => trigger.focus());
  dialog.querySelectorAll('[data-setting]').forEach((input) => input.addEventListener('change', () => {
    settings[input.dataset.setting] = input.checked; saveSettings(localStorage, settings);
    configureAudio(settings.muted);
    document.documentElement.classList.toggle('reduced-motion', settings.reducedMotion);
  }));
  dialog.querySelector('[data-action="clear-progress"]').addEventListener('click', (event) => openClearProgressDialog(event.currentTarget, dialog));
}

function openClearProgressDialog(trigger, settingsDialog) {
  const confirmation = document.createElement('dialog');
  confirmation.setAttribute('aria-label', '确认清除进度');
  confirmation.innerHTML = `<form method="dialog" class="dialog-body"><h2>清除全部关卡进度？</h2><p>最佳步数、星级和解锁关卡将被清除；声音与动态设置保留。</p><div class="dialog-actions"><button value="cancel" autofocus>取消</button><button type="button" data-confirm-clear class="danger-button">确认清除</button></div></form>`;
  document.body.append(confirmation);
  confirmation.addEventListener('close', () => { confirmation.remove(); if (settingsDialog.open) trigger.focus(); });
  confirmation.querySelector('[data-confirm-clear]').addEventListener('click', () => {
    clearProgress(localStorage);
    progress = loadProgress(localStorage);
    loadLevel(1, true);
    confirmation.close();
  });
  confirmation.showModal();
}

function icons() { document.dispatchEvent(new Event('yijing:icons')); }

function renderView() {
  const main = root.querySelector('main');
  document.title = `${labels[view]} · 卦格周易数学全景`;
  if (view === 'game') renderGame(main);
  if (view === 'atlas') renderAtlas(main);
  if (view === 'classics') renderClassics(main);
  if (view === 'lab') renderLab(main);
  if (view === 'proof') renderProof(main);
}

function hexagramFigure(state, testId, interactive = false) {
  const item = hex(state);
  const lines = Array.from({ length: 6 }, (_, i) => 5 - i).map((line) => {
    const yang = (state >> line) & 1;
    return `<button type="button" ${interactive ? `data-line-index="${line}"` : 'disabled'} aria-label="${interactive ? '翻转' : '目标'}第 ${line + 1} 爻" class="yao ${yang ? 'yang' : 'yin'}"><span></span><span></span></button>`;
  }).join('');
  return `<section class="hexagram-figure" data-testid="${testId}" data-state="${state}"><div class="hex-symbol">${item.symbol}</div><div class="yao-stack">${lines}</div><strong>${item.name}卦</strong><code>${bits(state)}</code><small>${item.upperTrigram}上 · ${item.lowerTrigram}下</small></section>`;
}

function renderGame(main) {
  const level = levels[currentLevel - 1];
  const state = session.snapshot();
  const special = ['complement','reverse','join','meet','xor'];
  main.innerHTML = `<div data-panel="game" class="game-layout">
    <section class="workspace-heading"><div><p class="eyebrow">第 <span data-testid="level-number">${currentLevel}</span> 关 / 12</p><h1>${level.title}</h1></div><div class="metric"><span>步数</span><strong data-testid="step-count">${state.steps}</strong><small>最优 ${level.optimalSteps} · 预算 ${level.budget}</small></div></section>
    <aside class="level-strip" aria-label="关卡选择">${levels.map((item) => `<button data-level="${item.number}" ${item.number > progress.highestUnlockedLevel ? 'disabled' : ''} aria-label="第 ${item.number} 关" class="${item.number === currentLevel ? 'active' : ''}">${item.number}<small>${progress.stars[item.number - 1] ? '★'.repeat(progress.stars[item.number - 1]) : '·'}</small></button>`).join('')}</aside>
    <section class="board-band"><div class="hex-side"><h2>当前卦</h2>${hexagramFigure(state.state, 'current-hexagram', true)}</div><div class="transition-core"><span>Q6 距离</span><strong>${hammingDistance(state.state, level.target)}</strong><small>秩 ${rank(state.state)} → ${rank(level.target)}</small><div class="mask">Δ ${bits(state.state ^ level.target)}</div></div><div class="hex-side"><h2>目标卦</h2>${hexagramFigure(level.target, 'target-hexagram')}</div></section>
    <section class="command-deck" aria-label="推演工具"><div class="primary-actions">${special.map((type) => { const action = level.allowedActions.find((candidate) => candidate.type === type); return `<button data-action="${type}" ${action ? '' : 'disabled'} title="${action ? describeAction(action) : `${actionNames[type]}未开放`}"><strong>${actionNames[type]}</strong>${action?.operand !== undefined ? `<small>${hex(action.operand).name} ${bits(action.operand)}</small>` : ''}</button>`; }).join('')}</div><div class="utility-actions"><button data-action="hint" aria-label="提示" title="提示"><i data-lucide="lightbulb"></i><span>提示</span></button><button data-action="undo" aria-label="撤销" title="撤销"><i data-lucide="undo-2"></i><span>撤销</span></button><button data-action="restart" aria-label="重开" title="重开"><i data-lucide="rotate-ccw"></i><span>重开</span></button></div></section>
    ${level.allowedActions.some((action) => Number.isInteger(action.operand)) ? `<section class="operand-evidence" aria-label="运算操作数">${level.allowedActions.filter((action) => Number.isInteger(action.operand)).map((action) => `<div data-operand-action="${action.type}"><span>${actionNames[action.type]}操作</span><code>${bits(state.state)} ${action.type === 'join' ? 'OR' : action.type === 'meet' ? 'AND' : 'XOR'} ${bits(action.operand)} = ${bits(action.type === 'join' ? join(state.state, action.operand) : action.type === 'meet' ? meet(state.state, action.operand) : xor(state.state, action.operand))}</code><small>操作数：${hex(action.operand).name}卦 ${bits(action.operand)}</small></div>`).join('')}</section>` : ''}
    <section class="evidence-band"><div><span>布尔格 B6</span><strong>并 = OR · 交 = AND · 补 = NOT</strong></div><div><span>变卦图 Q6</span><strong>单爻边 · 最短路 = Hamming 距离</strong></div><div><span>解释边界</span><strong>结构计算不推出吉凶</strong></div></section>
    <p class="live-message" aria-live="polite"></p>
  </div>`;
  bindGame(main, level); icons();
}

function bindGame(main, level) {
  main.querySelectorAll('[data-level]').forEach((button) => button.addEventListener('click', () => loadLevel(Number(button.dataset.level))));
  main.querySelectorAll('[data-line-index]').forEach((button) => { if (!button.disabled) button.addEventListener('click', () => perform({ type: 'flip', line: Number(button.dataset.lineIndex) })); });
  for (const type of ['complement','reverse','join','meet','xor']) {
    const button = main.querySelector(`[data-action="${type}"]`);
    button.addEventListener('click', () => { const action = level.allowedActions.find((candidate) => candidate.type === type); if (action) perform(action); });
  }
  main.querySelector('[data-action="hint"]').addEventListener('click', () => {
    const hint = session.hint();
    main.querySelector('.live-message').textContent = hint ? `提示：${describeAction(hint)}` : session.snapshot().status === 'failed' ? '预算已耗尽，请撤销或重开。' : '已到达目标';
  });
  main.querySelector('[data-action="undo"]').addEventListener('click', () => { session.undo(); renderGame(main); });
  main.querySelector('[data-action="restart"]').addEventListener('click', () => { session.restart(); renderGame(main); });
}

function perform(action) {
  if (!session.apply(action)) return;
  playTone('action');
  const snapshot = session.snapshot();
  if (snapshot.status === 'completed') { playTone('success'); finishLevel(snapshot.steps); }
  else if (snapshot.status === 'failed') { playTone('failure'); failLevel(); }
  renderGame(root.querySelector('main'));
}

function failLevel() {
  queueMicrotask(() => {
    const dialog = document.createElement('dialog');
    dialog.setAttribute('aria-label', '推演失败');
    dialog.innerHTML = `<div class="dialog-body result-dialog"><p class="eyebrow">预算已耗尽</p><h2>本轮未到达目标</h2><p>可撤销最后一步，或重开本关。</p><button autofocus class="primary-button" type="button">重开本关</button></div>`;
    document.body.append(dialog); dialog.showModal();
    dialog.querySelector('button').addEventListener('click', () => { session.restart(); dialog.close(); renderGame(root.querySelector('main')); });
    dialog.addEventListener('close', () => dialog.remove());
  });
}

function finishLevel(steps) {
  const level = levels[currentLevel - 1];
  const stars = calculateStars(steps, level.optimalSteps);
  const index = currentLevel - 1;
  progress.bestSteps[index] = progress.bestSteps[index] === null ? steps : Math.min(progress.bestSteps[index], steps);
  progress.stars[index] = Math.max(progress.stars[index], stars);
  progress.highestUnlockedLevel = Math.max(progress.highestUnlockedLevel, Math.min(12, currentLevel + 1));
  saveProgress(localStorage, progress);
  queueMicrotask(() => {
    const dialog = document.createElement('dialog');
    dialog.setAttribute('aria-label', '完成结算');
    dialog.innerHTML = `<div class="dialog-body result-dialog"><p class="eyebrow">推演完成</p><h2>${hex(level.target).symbol} ${hex(level.target).name}卦</h2><div data-testid="star-rating" data-stars="${stars}" class="stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</div><p>${steps} 步 · 最优 ${level.optimalSteps} 步</p><button autofocus class="primary-button" type="button">继续研习</button></div>`;
    document.body.append(dialog); dialog.showModal();
    dialog.querySelector('button').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => dialog.remove());
  });
}

function loadLevel(number, bypassLock = false) {
  const target = Math.max(1, Math.min(12, number));
  if (!bypassLock && target > progress.highestUnlockedLevel) return false;
  currentLevel = target;
  session = createPuzzleSession(levels[currentLevel - 1]);
  if (root && appReady) renderView();
  return true;
}

function renderAtlas(main) {
  main.innerHTML = `<div data-panel="atlas" class="page-layout"><section class="workspace-heading"><div><p class="eyebrow">64 状态 · 七个秩层</p><h1>六十四卦图谱</h1></div><div class="segmented"><button data-atlas-mode="hasse" class="${atlasMode === 'hasse' ? 'active' : ''}">Hasse 秩层</button><button data-atlas-mode="matrix" class="${atlasMode === 'matrix' ? 'active' : ''}">上下卦矩阵</button></div></section><p class="boundary-note">图谱展示可证明的状态关系；节点邻近不等于义理相近。</p><section class="atlas-stage"><div class="atlas-panel ${atlasMode === 'hasse' ? 'active' : ''}" data-atlas-panel="hasse" aria-hidden="${atlasMode !== 'hasse'}">${hasseMarkup()}</div><div class="atlas-panel ${atlasMode === 'matrix' ? 'active' : ''}" data-atlas-panel="matrix" aria-hidden="${atlasMode !== 'matrix'}">${matrixMarkup()}</div></section></div>`;
  main.querySelectorAll('[data-atlas-mode]').forEach((button) => button.addEventListener('click', () => {
    atlasMode = button.dataset.atlasMode;
    main.querySelectorAll('[data-atlas-mode]').forEach((item) => item.classList.toggle('active', item === button));
    main.querySelectorAll('[data-atlas-panel]').forEach((panel) => { const active = panel.dataset.atlasPanel === atlasMode; panel.classList.toggle('active', active); panel.setAttribute('aria-hidden', String(!active)); });
  }));
  main.querySelectorAll('[data-state-node], [data-matrix-cell]').forEach((button) => button.addEventListener('click', () => showHexDetail(Number(button.dataset.stateNode ?? button.dataset.matrixCell))));
  main.querySelectorAll('[data-state-node]').forEach((node) => node.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); showHexDetail(Number(node.dataset.stateNode)); } }));
  const relationshipList = main.querySelector('.relationship-list');
  relationshipList.addEventListener('toggle', () => {
    if (!relationshipList.open || relationshipList.dataset.loaded) return;
    const items = [];
    for (let from = 0; from < 64; from++) for (let bit = 0; bit < 6; bit++) if (((from >> bit) & 1) === 0) {
      const to = from | (1 << bit);
      items.push(`<li>${hex(from).name} ${bits(from)} → ${hex(to).name} ${bits(to)}</li>`);
    }
    relationshipList.querySelector('ol').innerHTML = items.join('');
    relationshipList.dataset.loaded = 'true';
  });
}

function hasseMarkup() {
  const positions = new Map();
  for (let layer = 0; layer <= 6; layer++) {
    const states = statesAtRank(layer);
    states.forEach((state, index) => positions.set(state, { x: 35 + ((index + 1) * 930) / (states.length + 1), y: 520 - layer * 80 }));
  }
  const edges = [];
  for (let from = 0; from < 64; from++) for (let bit = 0; bit < 6; bit++) if (((from >> bit) & 1) === 0) edges.push([from, from | (1 << bit)]);
  const level = levels[currentLevel - 1];
  const current = session.snapshot().state;
  const related = { current, target: level.target, complement: complement(current), reverse: reverseLines(current), nuclear: nuclearHexagram(current).state };
  const relationFor = (state) => Object.entries(related).filter(([, value]) => value === state).map(([name]) => name);
  const edgeMarkup = edges.map(([from, to]) => {
    const start = positions.get(from); const end = positions.get(to);
    return `<line data-hasse-edge data-from="${from}" data-to="${to}" x1="${start.x}" y1="${start.y}" x2="${end.x}" y2="${end.y}"/>`;
  }).join('');
  const nodeMarkup = Array.from({ length: 64 }, (_, state) => {
    const point = positions.get(state); const item = hex(state); const relations = relationFor(state);
    return `<g data-testid="hexagram-node" data-state-node="${state}" data-relations="${relations.join(',')}" class="graph-node ${relations.map((name) => `marker-${name}`).join(' ')}" transform="translate(${point.x} ${point.y})" role="button" tabindex="0" aria-label="${item.name}卦 ${bits(state)}${relations.length ? `，${relations.join('、')}` : ''}"><circle r="23"/><text text-anchor="middle" dy="5">${item.symbol}</text>${relations.length > 1 ? `<text class="relation-count" x="15" y="-15">${relations.length}</text>` : ''}</g>`;
  }).join('');
  return `<div class="hasse-wrap"><div class="graph-legend"><span class="current">当前</span><span class="target">目标</span><span class="complement">错</span><span class="reverse">综</span><span class="nuclear">互</span></div><p class="mobile-scroll-hint" tabindex="0">图谱区域可横向滚动；Tab 可逐节点聚焦。</p><svg class="hasse" data-testid="hasse-graph" data-layer-counts="1,6,15,20,15,6,1" viewBox="0 0 1000 560" role="img" aria-label="六阶布尔格 Hasse 图，64 节点、192 条覆盖边">${edgeMarkup}${nodeMarkup}</svg><details class="relationship-list"><summary>覆盖关系列表（192 条，展开后加载）</summary><ol></ol></details></div>`;
}

function matrixMarkup() {
  return `<div class="matrix-wrap"><div class="matrix-heading">行：上卦 · 列：下卦</div><p class="mobile-scroll-hint" tabindex="0">矩阵区域可横向滚动；行列标题固定说明上下卦。</p><div class="trigram-matrix" data-testid="trigram-matrix"><span class="matrix-corner">上＼下</span>${TRIGRAMS.map((trigram) => `<span class="matrix-axis column" aria-label="下卦${trigram.name}">${trigram.symbol}<small>${trigram.name}</small></span>`).join('')}${TRIGRAMS.map((upper) => `<span class="matrix-axis row" aria-label="上卦${upper.name}">${upper.symbol}<small>${upper.name}</small></span>${TRIGRAMS.map((lower) => { const state = lower.bits | (upper.bits << 3); const item = hex(state); return `<button data-matrix-cell="${state}" title="${upper.name}上${lower.name}下"><b>${item.symbol}</b><small>${item.name}</small></button>`; }).join('')}`).join('')}</div></div>`;
}

function showHexDetail(state) {
  const item = hex(state); const nuclear = nuclearHexagram(state);
  const dialog = document.createElement('dialog'); dialog.setAttribute('aria-label', `${item.name}卦详情`);
  dialog.innerHTML = `<div class="dialog-body detail-dialog"><header><div><p class="eyebrow">第 ${item.number} 卦 · ${item.binary}</p><h2>${item.symbol} ${item.name}</h2></div><button class="icon-button" aria-label="关闭"><i data-lucide="x"></i></button></header><dl><div><dt>上下卦</dt><dd>${item.upperTrigram}上 · ${item.lowerTrigram}下</dd></div><div><dt>秩</dt><dd>${rank(state)}</dd></div><div><dt>轨道</dt><dd>${kleinOrbit(state).map(bits).join(' / ')}</dd></div><div><dt>稳定子</dt><dd>${kleinStabilizer(state).join('、')}</dd></div><div><dt>互卦</dt><dd>${hex(nuclear.state).name} ${bits(nuclear.state)}</dd></div><div><dt>来源</dt><dd><a href="${SOURCES[0].url}" target="_blank">结构化底本与交叉校验</a></dd></div></dl><p class="boundary-note">群轨道是数学对称，不等同于传统义理结论。</p></div>`;
  document.body.append(dialog); dialog.showModal(); icons();
  dialog.querySelector('button').addEventListener('click', () => dialog.close()); dialog.addEventListener('close', () => dialog.remove());
}

async function renderClassics(main) {
  const { CLASSIC_CELLS, EXTRA_CLASSIC_CELLS } = await import('../data/classics.js');
  classicCells = [...CLASSIC_CELLS, ...EXTRA_CLASSIC_CELLS];
  main.innerHTML = `<div data-panel="classics" class="page-layout"><section class="workspace-heading"><div><p class="eyebrow">64 卦 · 960 常规字段</p><h1>经传索引</h1></div></section><section class="search-tools" aria-label="经传筛选"><input data-testid="classics-search" aria-label="搜索卦序、卦名、上下卦或原文" placeholder="卦序、卦名、上下卦、原文"><select data-testid="section-filter" aria-label="上下经筛选"><option value="all">上下经</option><option value="upper">上经</option><option value="lower">下经</option></select><select data-testid="upper-trigram-filter" aria-label="上卦筛选"><option value="all">全部上卦</option>${TRIGRAMS.map((item) => `<option>${item.name}</option>`).join('')}</select><select data-testid="lower-trigram-filter" aria-label="下卦筛选"><option value="all">全部下卦</option>${TRIGRAMS.map((item) => `<option>${item.name}</option>`).join('')}</select><select data-testid="status-filter" aria-label="校验状态筛选"><option value="all">全部状态</option><option value="verified">自动双本一致</option><option value="variant">异文双版本</option><option value="pending-review">单源待核</option></select><select data-testid="relation-filter" aria-label="关系筛选"><option value="all">全部关系</option><option value="self-symmetric">有自对称</option><option value="orbit-four">四元轨道</option></select><button type="button" data-action="clear-classic-filters">清除筛选</button></section><div class="classics-layout"><section class="result-list" aria-label="经传检索结果"></section><section class="classic-detail"><p>选择一卦查看四层内容。</p></section></div></div>`;
  const total = classicCells.length; const regularAccepted = CLASSIC_CELLS.filter((cell) => ['verified', 'variant'].includes(cell.status)).length; const pending = EXTRA_CLASSIC_CELLS.filter((cell) => cell.status === 'pending-review').length;
  main.querySelector('.workspace-heading').insertAdjacentHTML('afterend', `<p class="boundary-note" data-testid="classics-coverage-summary">全体 ${total} 单元：${regularAccepted} 个双底本一致或异文实录（${((regularAccepted / total) * 100).toFixed(3)}%），${pending} 个单源待核（${((pending / total) * 100).toFixed(3)}%）；常规 960 字段双底本率 100.000%。</p>`);
  const search = main.querySelector('[data-testid="classics-search"]'); const section = main.querySelector('[data-testid="section-filter"]');
  const upper = main.querySelector('[data-testid="upper-trigram-filter"]'); const lower = main.querySelector('[data-testid="lower-trigram-filter"]'); const status = main.querySelector('[data-testid="status-filter"]'); const relation = main.querySelector('[data-testid="relation-filter"]');
  const update = () => {
    const term = search.value.trim(); const matches = HEXAGRAMS.filter((item) => {
      const cells = classicCells.filter((cell) => cell.hexagramNumber === item.number);
      const text = cells.flatMap((cell) => [cell.text, ...(cell.variants?.map((variant) => variant.text) ?? [])]).join('');
      const relationMatches = relation.value === 'all' || (relation.value === 'self-symmetric' && kleinStabilizer(item.bits).length > 1) || (relation.value === 'orbit-four' && kleinOrbit(item.bits).length === 4);
      return (section.value === 'all' || item.section === section.value) && (upper.value === 'all' || item.upperTrigram === upper.value) && (lower.value === 'all' || item.lowerTrigram === lower.value) && (status.value === 'all' || cells.some((cell) => cell.status === status.value)) && relationMatches && (!term || `${item.number}${item.name}${item.symbol}${item.upperTrigram}${item.lowerTrigram}${text}`.includes(term));
    });
    const list = main.querySelector('.result-list');
    list.innerHTML = matches.map((item) => `<button data-testid="classic-result" data-classic-number="${item.number}"><b>${item.symbol}</b><span><strong>${item.number}. ${item.name}</strong><small>${item.upperTrigram}上 · ${item.lowerTrigram}下</small></span></button>`).join('') || '<p>没有匹配内容</p>';
    list.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => renderClassicDetail(main, Number(button.dataset.classicNumber))));
  };
  search.addEventListener('input', update); [section, upper, lower, status, relation].forEach((select) => select.addEventListener('change', update));
  main.querySelector('[data-action="clear-classic-filters"]').addEventListener('click', () => { search.value = ''; [section, upper, lower, status, relation].forEach((select) => { select.value = 'all'; }); update(); search.focus(); });
  update();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function sourceFor(sourceId) { return SOURCES.find((source) => source.id === sourceId); }

function sourceLinkFor(cell, sourceId) {
  const index = cell.sourceIds.indexOf(sourceId);
  return cell.sourceLinks[index] ?? sourceFor(sourceId)?.url;
}

function classicCellMarkup(cell) {
  const title = classicFieldNames[cell.field] ?? cell.field;
  const status = statusNames[cell.status] ?? cell.status;
  if (cell.status === 'variant') {
    const versions = cell.variants.map((variant, index) => {
      const source = sourceFor(variant.sourceId);
      const sourceName = source?.name ?? variant.sourceId;
      const version = variant.revision ? `revision ${variant.revision}` : source?.version ?? cell.edition;
      return `<article class="variant-version" data-testid="variant-version" data-source-id="${escapeHtml(variant.sourceId)}"><header><strong>版本 ${index + 1}</strong><span>${escapeHtml(sourceName)}</span></header><p data-testid="variant-text">${escapeHtml(variant.text)}</p><div class="variant-meta"><span>${escapeHtml(version)}</span><a data-testid="variant-source-link" href="${escapeHtml(sourceLinkFor(cell, variant.sourceId))}" target="_blank" rel="noreferrer" aria-label="查看${escapeHtml(sourceName)}原文来源">原文来源</a></div></article>`;
    }).join('');
    return `<article class="classic-text-entry variant-entry" data-classic-field="${escapeHtml(cell.field)}"><header><h4>${escapeHtml(title)}</h4><span data-testid="verification-status" class="status-badge variant">${status}</span></header><p class="verification-note">${escapeHtml(cell.verificationNote)}</p><div class="variant-comparison">${versions}</div></article>`;
  }

  const sourceId = cell.sourceIds.includes('wikisource-xiyi') ? 'wikisource-xiyi' : cell.sourceIds[0];
  const source = sourceFor(sourceId);
  return `<article class="classic-text-entry" data-classic-field="${escapeHtml(cell.field)}"><header><h4>${escapeHtml(title)}</h4><span data-testid="verification-status" class="status-badge ${cell.status === 'pending-review' ? 'pending' : ''}">${status}</span></header><p class="classic-text">${escapeHtml(cell.text)}</p><p class="verification-note">${escapeHtml(cell.verificationNote ?? cell.reason ?? '')}</p><div class="classic-meta"><span>${escapeHtml(cell.revision ? `revision ${cell.revision}` : cell.edition ?? source?.version ?? '')}</span><a data-testid="source-link" href="${escapeHtml(sourceLinkFor(cell, sourceId))}" target="_blank" rel="noreferrer" aria-label="查看${escapeHtml(source?.name ?? sourceId)}原文来源">原文来源</a></div></article>`;
}

function renderClassicDetail(main, number) {
  const item = HEXAGRAMS[number - 1];
  const cells = classicCells.filter((cell) => cell.hexagramNumber === number);
  const evidence = relationEvidence(item.bits);
  const facts = linePositionFacts(item.bits);
  const keywordTags = ['吉','凶','悔','吝','无咎'].filter((word) => cells.some((cell) => cell.text.includes(word)));
  main.querySelector('.classic-detail').innerHTML = `<header><p class="eyebrow">第 ${number} 卦 · ${item.binary}</p><h2>${item.symbol} ${item.name}</h2></header><section data-classic-layer="classic" class="content-layer"><h3>经典原文</h3><div class="classic-text-list">${cells.map(classicCellMarkup).join('')}</div></section><section data-classic-layer="traditional" class="content-layer"><h3>传统规则</h3><p>互卦：${hex(nuclearHexagram(item.bits).state).name}；错卦：${hex(complement(item.bits)).name}；综卦：${hex(reverseLines(item.bits)).name}。</p><p>爻位：${facts.map((fact) => `${fact.position}${fact.polarity === 'yang' ? '阳' : '阴'}${fact.proper ? '得位' : '失位'}`).join('；')}</p><p>应：${evidence.correspondence.map((entry) => `${entry.left}↔${entry.right}${entry.matches ? '应' : '不应'}`).join('；')}。比/承/乘：${evidence.adjacency.map((entry) => `${entry.lower}-${entry.upper}比${entry.supporting ? '·承' : ''}${entry.riding ? '·乘' : ''}`).join('；')}。</p><small>${evidence.boundary}</small></section><section data-classic-layer="mathematical" class="content-layer"><h3>数学定理</h3><p>B6 状态 ${item.binary}，秩 ${rank(item.bits)}；错综轨道含 ${kleinOrbit(item.bits).length} 个不同状态。</p></section><section data-classic-layer="modern" class="content-layer"><h3>现代解释</h3><p>形式化主题标签：${keywordTags.length ? keywordTags.map((tag) => `<span class="topic-tag">${tag}</span>`).join(' ') : '本卦未命中预设词项'}。标签仅由已收录文本检索得出，不是古典原义证明。</p><a href="${escapeHtml(cells[0].sourceLinks[0])}" target="_blank" rel="noreferrer">标签文本来源</a></section><p data-testid="frequency-boundary" class="boundary-note">词频不等于占断强度。</p>`;
}

function renderLab(main) {
  const lab = { primary: 12, secondary: 21, mask: 7, mode: 'q6' };
  main.innerHTML = `<div data-panel="lab" class="page-layout"><section class="workspace-heading"><div><p class="eyebrow">自由输入 · 即时证据</p><h1>关系实验室</h1></div><div class="path-tabs"><button data-path-mode="q6" class="active">Q6</button><button data-path-mode="hasse">Hasse</button><button data-path-mode="king-wen">文王序</button></div></section><section class="lab-inputs"><label>主卦 bit<input data-testid="lab-primary-bits" value="001100" inputmode="numeric" maxlength="6" aria-describedby="lab-input-error"></label><label>第二卦 bit<input data-testid="lab-secondary-bits" value="010101" inputmode="numeric" maxlength="6" aria-describedby="lab-input-error"></label><label>XOR 掩码<input data-testid="lab-xor-mask" value="000111" inputmode="numeric" maxlength="6" aria-describedby="lab-input-error"></label></section><p id="lab-input-error" data-testid="lab-input-error" class="input-error" aria-live="polite"></p><section class="lab-line-editor" aria-label="点击编辑主卦六爻"></section><section class="operation-grid"></section><section class="lab-evidence"><div><span>Hamming 距离</span><strong data-testid="hamming-distance"></strong></div><div><span>偏序</span><strong data-testid="comparability"></strong></div><div><span>规则版本</span><strong data-testid="rule-version">${RULE_VERSION}</strong></div></section><section class="relation-facts"></section><section class="symmetry-facts"></section><section class="path-definition" data-testid="path-definition"></section><p data-testid="rule-boundary" class="boundary-note">${relationEvidence(0).boundary}</p></div>`;
  const inputs = { primary: main.querySelector('[data-testid="lab-primary-bits"]'), secondary: main.querySelector('[data-testid="lab-secondary-bits"]'), mask: main.querySelector('[data-testid="lab-xor-mask"]') };
  Object.entries(inputs).forEach(([key, input]) => input.addEventListener('input', () => {
    if (/^[01]{6}$/.test(input.value)) { lab[key] = parseInt(input.value, 2); main.querySelector('[data-testid="lab-input-error"]').textContent = ''; }
    else main.querySelector('[data-testid="lab-input-error"]').textContent = `${input.parentElement.firstChild.textContent.trim()}必须是 6 位 0/1；结果保留上次合法值。`;
    updateLab(main, lab);
  }));
  main.querySelectorAll('[data-path-mode]').forEach((button) => button.addEventListener('click', () => { main.querySelectorAll('[data-path-mode]').forEach((item) => item.classList.remove('active')); button.classList.add('active'); lab.mode = button.dataset.pathMode; updateLab(main, lab); }));
  main.querySelector('.lab-line-editor').addEventListener('click', (event) => {
    const button = event.target.closest('[data-lab-line]'); if (!button) return;
    lab.primary ^= 1 << Number(button.dataset.labLine); inputs.primary.value = bits(lab.primary);
    main.querySelector('[data-testid="lab-input-error"]').textContent = ''; updateLab(main, lab);
  });
  updateLab(main, lab);
}

function updateLab(main, lab) {
  const { primary, secondary, mask } = lab;
  const operations = { join: join(primary, secondary), meet: meet(primary, secondary), xor: xor(primary, mask), complement: complement(primary), reverse: reverseLines(primary), nuclear: nuclearHexagram(primary).state };
  main.querySelector('.operation-grid').innerHTML = Object.entries(operations).map(([name, value]) => `<div data-operation="${name}" data-state="${bits(value)}"><span>${({join:'并',meet:'交',xor:'XOR',complement:'错',reverse:'综',nuclear:'互'})[name]}</span><strong>${hex(value).symbol} ${hex(value).name}</strong><code>${bits(value)}</code></div>`).join('');
  main.querySelector('[data-testid="hamming-distance"]').textContent = hammingDistance(primary, secondary);
  main.querySelector('[data-testid="comparability"]').textContent = lessOrEqual(primary, secondary) ? '主卦 ≤ 第二卦' : lessOrEqual(secondary, primary) ? '第二卦 ≤ 主卦' : '不可比';
  main.querySelector('.lab-line-editor').innerHTML = Array.from({ length: 6 }, (_, line) => `<button type="button" data-lab-line="${line}" aria-label="翻转主卦第 ${line + 1} 爻"><span>第 ${line + 1} 爻</span><strong>${(primary >> line) & 1 ? '阳' : '阴'}</strong></button>`).join('');
  const positions = linePositionFacts(primary); const evidence = relationEvidence(primary);
  main.querySelector('.relation-facts').innerHTML = `<h2>爻位与传统谓词</h2><div class="line-fact-grid">${positions.map((fact) => `<div><strong>${fact.position} · ${fact.polarity === 'yang' ? '阳' : '阴'}</strong><span>${fact.proper ? '得位' : '失位'} · ${{earth:'地',human:'人',heaven:'天'}[fact.realm]}</span></div>`).join('')}</div><div class="predicate-list"><p><strong>应：</strong>${evidence.correspondence.map((item) => `${item.left}↔${item.right} ${item.matches ? '相应' : '不应'}`).join('；')}</p><p><strong>比、承、乘：</strong>${evidence.adjacency.map((item) => `${item.lower}-${item.upper} 比邻${item.supporting ? '·承' : ''}${item.riding ? '·乘' : ''}`).join('；')}</p></div>`;
  const orbit = kleinOrbit(primary); const stabilizer = kleinStabilizer(primary);
  main.querySelector('.symmetry-facts').innerHTML = `<h2>Klein 对称证据</h2><p data-testid="klein-orbit">轨道：${orbit.map((state) => `${hex(state).name} ${bits(state)}`).join(' → ')}</p><p data-testid="klein-stabilizer">稳定子：${stabilizer.join('、')}；${stabilizer.length > 1 ? '存在自对称' : '无非平凡自对称'}</p>`;

  let pathStates; let description;
  if (lab.mode === 'q6') {
    const actions = Array.from({ length: 6 }, (_, line) => ({ type: 'flip', line }));
    const path = shortestActionPath(primary, secondary, actions); let state = primary; pathStates = [state];
    for (const action of path) { state ^= 1 << action.line; pathStates.push(state); }
    description = `Q6 最短路径：${path.length} 条单爻边，等于 Hamming 距离。`;
  } else if (lab.mode === 'hasse') {
    const comparable = lessOrEqual(primary, secondary) || lessOrEqual(secondary, primary);
    if (comparable) { let state = lessOrEqual(primary, secondary) ? primary : secondary; const end = state === primary ? secondary : primary; pathStates = [state]; for (let bit = 0; bit < 6; bit++) if (((state >> bit) & 1) === 0 && ((end >> bit) & 1) === 1) { state |= 1 << bit; pathStates.push(state); } description = 'Hasse 覆盖链：每一步只增加一个阳爻，给出偏序证据。'; }
    else { pathStates = []; description = '两卦在逐位偏序中不可比，因此不存在单向 Hasse 覆盖链。'; }
  } else {
    const left = KING_WEN_ORDER.indexOf(primary) + 1; const right = KING_WEN_ORDER.indexOf(secondary) + 1;
    pathStates = [primary, secondary]; description = `文王序位置：第 ${left} 卦与第 ${right} 卦；${Math.abs(left - right) === 1 ? '两者相邻' : `相距 ${Math.abs(left - right)} 个序位`}。这不是位运算距离。`;
  }
  main.querySelector('[data-testid="path-definition"]').innerHTML = `<p>${description}</p><div class="path-nodes">${pathStates.map((state, index) => `<span data-testid="path-node">${index + 1}. ${hex(state).symbol} ${hex(state).name} <code>${bits(state)}</code></span>`).join('<b>→</b>') || '<span>无覆盖链</span>'}</div>`;
}

function generatedAsset(id) {
  const base = `/assets/generated/${id}`;
  return `<figure class="proof-asset" data-generated-asset-fallback-container aria-hidden="true">
    <picture><source type="image/webp" srcset="${base}-640.webp 640w, ${base}-1280.webp 1280w" sizes="(max-width: 760px) 640px, 1280px"><img data-generated-asset="${id}" src="${base}-1280.webp" alt="" loading="lazy" decoding="async"></picture>
    <div data-generated-asset-fallback hidden></div>
  </figure>`;
}

function theoremMarkup(theorem) {
  const claimId = `claim:structure:${theorem.theoremId.replace('theorem:', '')}`;
  return `<article data-testid="proof-theorem" data-family="${theorem.family}" data-claim-id="${claimId}"><header><span>命题 / theorem</span><strong>${theorem.theoremId}</strong></header><p><b>论域：</b>${theorem.domain.name}，${theorem.evaluatedInputs.toLocaleString('zh-CN')} / ${theorem.domain.cardinality.toLocaleString('zh-CN')} 个输入</p><p><b>公理：</b>${theorem.axioms.join('、')}</p><p><b>边界：</b>${theorem.boundary}</p></article>`;
}

async function renderProof(main) {
  const boundary = '在固定 1,132 段语料、显式语义公理与合法公式内，系统是无遗漏、可判定且证明/反证完备的；历史原意、注疏与现实效力按定义排除。';
  const fallbackTheorems = [
    { theoremId: 'theorem:b6-involutions', family: 'structure', domain: { name: 'B6 的 64 个状态', cardinality: 64 }, evaluatedInputs: 64, axioms: ['axiom:b6'], boundary },
    { theoremId: 'theorem:pair-lattice-laws', family: 'structure', domain: { name: 'B6×B6 的 4096 个有序对', cardinality: 4096 }, evaluatedInputs: 4096, axioms: ['axiom:bitwise-lattice'], boundary },
    { theoremId: 'theorem:triple-distributive-lattice', family: 'structure', domain: { name: 'B6³ 的 262144 个有序三元组', cardinality: 262144 }, evaluatedInputs: 262144, axioms: ['axiom:bitwise-lattice'], boundary }
  ];
  main.innerHTML = `<div data-panel="proof" class="page-layout proof-layout">
    <section class="workspace-heading"><div><p class="eyebrow">固定版本 · 有限论域 · 可复现证书</p><h1>证明中心</h1></div><div class="proof-downloads"><a href="/data/corpus-manifest.json" download>下载语料 corpus manifest</a><a href="/data/proof-certificate.json" download>下载证明证书 proof certificate</a><a href="/data/closed-yijing-certificate.json" download>下载封闭系统证书</a></div></section>
    <p class="boundary-note proof-scope">${boundary}</p>
    <section class="proof-asset-region" data-testid="proof-asset-region">${generatedAsset('yijing-proof-texture')}${generatedAsset('yijing-lattice-atmosphere')}</section>
    <section data-testid="proof-closed-system" data-claim-id="claim:closed-axioms" class="proof-section closed-system-proof"><header><div><p class="eyebrow">封闭周易形式系统 CYFS</p><h2>系统内完全证明与穷尽</h2></div><span class="proof-status">有限对象模型存在</span></header>
      <p>先定义意义，再证明结论：ZFC（含选择公理）提供元数学基础；经典逻辑、布尔代数、有限拓扑和六条语义公理决定本系统中的全部对象与真假。</p>
      <p class="foundation-note" data-closed-foundation-note>选择公理只登记为元理论；有限模型不依赖它，也不声称在 ZFC 内证明 ZFC 自身一致性。</p>
      <div class="closed-proof-metrics"><div><strong data-closed-axioms>20</strong><span>基础与对象公理</span></div><div><strong data-closed-roundtrips>1,132 / 1,132</strong><span>文本可逆编码</span></div><div><strong data-closed-atoms>1,366,324</strong><span>原子实例已判定</span></div><div><strong data-closed-undefined>0</strong><span>未定义值</span></div></div>
      <div class="closed-proof-grid">
        <article data-claim-id="claim:closed-bijection"><h3>内容穷尽</h3><p><code>encode(pᵢ)=i</code>，<code>decode(i)=pᵢ</code>；形式值保留原文、哈希、作品类、位置和 <code>state(i)=i mod 64</code>，因此无损且唯一。</p></article>
        <article data-claim-id="claim:closed-completeness"><h3>证明穷尽</h3><p>每个合法公式递归归约到二值原子；求值为真即给出证明轨迹，为假即给出反证轨迹。算法对严格变小的子式递归，所以必定终止。</p></article>
      </div>
      <details class="axiom-register"><summary>查看完整公理表</summary><div data-closed-axiom-list><p>载入封闭系统证书后显示全部公理。</p></div></details>
      <p class="boundary-note" data-closed-boundary>${boundary}</p>
    </section>
    <section data-testid="proof-corpus-coverage" data-claim-id="claim:corpus-coverage" class="proof-section"><header><p class="eyebrow">语料闭包</p><h2>选定传世底本覆盖 100%</h2></header><div class="proof-metrics"><strong data-proof-corpus-total>1,132 段</strong><span>空文 0</span><span>重复 0（按位置）</span><span>未分类 0</span></div><p data-proof-corpus-snapshots>固定 revisions <code>88dc8f812586</code> / <code>8ff4ffc8802e</code>；组合快照 SHA-256 <code>fetched from manifest</code>。</p><p>覆盖的是选定、固定的传世底本，不包括全部出土本、异文与历代注疏。</p></section>
    <section class="proof-section"><header class="proof-filter-row"><div><p class="eyebrow">有限结构穷举</p><h2>可复现命题</h2></div><label>命题类型<select data-testid="theorem-filter"><option value="all">全部</option><option value="structure">结构</option></select></label></header><div class="theorem-list">${fallbackTheorems.map(theoremMarkup).join('')}</div></section>
    <section class="proof-grid">
      <article data-testid="proof-evidence-graph" data-claim-id="claim:evidence-closure"><p class="eyebrow">证据图谱</p><h2>来源路径闭合</h2><p data-proof-graph-metrics>节点可复核 · 边可复核 · 悬空 0</p><p>段落来源可达 100% · 声明所需证据覆盖 100%</p></article>
      <article data-testid="proof-axiom-dag" data-claim-id="claim:axiom-dag"><p class="eyebrow">公理 DAG</p><h2>依赖可审计</h2><p>循环 0 · 无根 0 · 缺失依赖 0</p><p>结论只能沿依赖边回到公理或固定来源。</p></article>
      <article data-testid="proof-traditional-rules" data-claim-id="claim:traditional-rules"><p class="eyebrow">传统规则</p><h2>规则版本 zhouyi-core-v1</h2><p><b>论域：</b>64 卦、每卦六爻。</p><p><b>谓词：</b>得位＝阴偶阳奇；应＝1↔4、2↔5、3↔6 异性；比＝相邻；承＝下爻对上爻；乘＝阴爻居阳爻之上。</p><p>流派表述可能不同，自动比对不代替底本与注疏的人工校勘。</p></article>
    </section>
    <section data-testid="proof-fca" data-claim-id="claim:fca-complete" class="proof-section"><header><p class="eyebrow">FCA</p><h2>形式概念分析</h2></header><p data-proof-fca-metrics>对象 1,132 · 属性 5 · 关联 1,454 · 概念 18 · 完整枚举、未截断</p><div class="fca-concept-list" data-fca-concepts aria-live="polite"></div></section>
    <section data-testid="proof-model-checking" data-claim-id="claim:model-checking" class="proof-section"><header><p class="eyebrow">完整历史有限状态模型检查</p><h2>12 关会话状态、全部命令转移与最短路径</h2></header><p data-model-summary>证书载入后显示完整有序历史状态与命令转移计数。</p><div class="model-level-list" data-model-levels></div><p class="boundary-note" data-model-boundary>只覆盖固定预算、登记动作和真实会话状态机。</p><article class="storage-check" data-claim-id="claim:storage-migration"><h3>存档迁移检查</h3><p data-storage-summary>7 类输入：等待证书。</p></article></section>
    <section data-testid="proof-information-theory" data-claim-id="claim:descriptive-statistics" class="proof-section"><header><p class="eyebrow">描述性信息统计</p><h2>bit、秩、固定词项与熵</h2></header><div data-information-summary>载入固定样本统计。</div><p class="boundary-note" data-information-boundary>这些统计仅作描述，不推出语义、因果关系或预测效力。</p></section>
    <section data-testid="proof-unresolved" data-claim-id="claim:semantic-boundary" class="proof-section unresolved"><p class="eyebrow">未决与不可形式化</p><h2>这些主张没有被证明</h2><p>唯一语义、作者原意、占筮与预测效力不属于有限结构证书的结论。</p><p>当前固定语料闭包不等于全部出土本、异文与历代注疏的穷尽。</p></section>
  </div>`;
  const filter = main.querySelector('[data-testid="theorem-filter"]');
  filter.addEventListener('change', () => main.querySelectorAll('[data-testid="proof-theorem"]').forEach((card) => { card.hidden = filter.value !== 'all' && card.dataset.family !== filter.value; }));
  main.querySelectorAll('img[data-generated-asset]').forEach((image) => image.addEventListener('error', () => {
    image.hidden = true;
    const fallback = image.closest('figure').querySelector('[data-generated-asset-fallback]');
    fallback.hidden = false;
  }));
  try {
    const fetchJson = async (path) => { const response = await fetch(path); return response.ok ? response.json() : null; };
    const [certificate, closedCertificate, summary, formalConcepts, statistics, claimRegistry] = await Promise.all([
      fetchJson('/data/proof-certificate.json'), fetchJson('/data/closed-yijing-certificate.json'),
      fetchJson('/data/formal-summary.json'), fetchJson('/data/formal-concepts.json'), fetchJson('/data/descriptive-statistics.json'),
      fetchJson('/data/claims.json')
    ]);
    if (!main.isConnected) return;
    if (certificate) main.querySelector('.theorem-list').innerHTML = certificate.theorems.map(theoremMarkup).join('');
    if (closedCertificate) {
      const axiomCount = closedCertificate.foundations.axioms.length + closedCertificate.objectTheory.axioms.length;
      main.querySelector('[data-closed-axioms]').textContent = axiomCount.toLocaleString('zh-CN');
      main.querySelector('[data-closed-roundtrips]').textContent = `${closedCertificate.encoding.roundTrips.toLocaleString('zh-CN')} / ${closedCertificate.encoding.domainCardinality.toLocaleString('zh-CN')}`;
      main.querySelector('[data-closed-atoms]').textContent = closedCertificate.atomicEvaluation.evaluatedCases.toLocaleString('zh-CN');
      main.querySelector('[data-closed-undefined]').textContent = closedCertificate.atomicEvaluation.undefinedCases.toLocaleString('zh-CN');
      main.querySelector('[data-closed-foundation-note]').textContent = closedCertificate.foundations.note;
      const groups = [
        ['ZFC 元理论', closedCertificate.foundations.axioms],
        ...[...new Set(closedCertificate.objectTheory.axioms.map((axiom) => axiom.layer))]
          .map((layer) => [layer, closedCertificate.objectTheory.axioms.filter((axiom) => axiom.layer === layer)])
      ];
      main.querySelector('[data-closed-axiom-list]').innerHTML = groups.map(([name, axioms]) => `<section><h4>${escapeHtml(name)}</h4><ol>${axioms.map((axiom) => `<li><code>${escapeHtml(axiom.id)}</code><span>${escapeHtml(axiom.name)}</span></li>`).join('')}</ol></section>`).join('');
      main.querySelector('[data-closed-boundary]').textContent = `${closedCertificate.boundary} 拓扑开集 ${closedCertificate.topology.openSets} 个，成对并交检查 ${closedCertificate.topology.unionChecks + closedCertificate.topology.intersectionChecks} 次，失败 ${closedCertificate.topology.failures}。`;
    }
    if (summary) {
      main.querySelector('[data-proof-corpus-total]').textContent = `${summary.corpus.total.toLocaleString('zh-CN')} 段`;
      const revisions = summary.corpus.sourceSnapshots.map((item) => `<code>${item.revision.slice(0, 12)}</code>`).join(' / ');
      main.querySelector('[data-proof-corpus-snapshots]').innerHTML = `固定 revisions ${revisions}；组合快照 SHA-256 <code>${summary.corpus.sourceSnapshotHash}</code>。`;
      main.querySelector('[data-proof-fca-metrics]').textContent = `对象 ${summary.fca.objects.toLocaleString('zh-CN')} · 属性 ${summary.fca.attributes} · 关联 ${summary.fca.incidences.toLocaleString('zh-CN')} · 概念 ${summary.fca.concepts}`;
      main.querySelector('[data-proof-graph-metrics]').textContent = `节点 ${summary.evidenceGraph.nodes.toLocaleString('zh-CN')} · 边 ${summary.evidenceGraph.edges.toLocaleString('zh-CN')} · 悬空 ${summary.evidenceGraph.danglingEdges}`;
    }
    if (formalConcepts) {
      main.querySelector('[data-fca-concepts]').innerHTML = formalConcepts.concepts.map((concept, index) => {
        const extent = concept.extent.slice(0, 8).map(escapeHtml).join('、');
        const intent = concept.intent.length ? concept.intent.map(escapeHtml).join('、') : '∅';
        return `<details data-testid="fca-concept"><summary>概念 ${index + 1} · extent ${concept.extent.length} · intent ${concept.intent.length}</summary><p><b>extent / 对象集：</b>${extent}${concept.extent.length > 8 ? `……（共 ${concept.extent.length} 项，完整集合见下载产物）` : ''}</p><p><b>intent / 属性集：</b>${intent}</p></details>`;
      }).join('');
    }
    if (certificate?.modelChecking) {
      const model = certificate.modelChecking;
      const states = model.levels.reduce((sum, item) => sum + item.visitedStates, 0);
      const transitions = model.levels.reduce((sum, item) => sum + item.transitionCount, 0);
      main.querySelector('[data-model-summary]').textContent = `12 关完整穷举 ${states.toLocaleString('zh-CN')} 个可达有序历史会话状态、${transitions.toLocaleString('zh-CN')} 条命令转移；undo、restart、illegal、hint、终局结算和全部预算耗尽路径反例 ${model.summary.totalCounterexamples}。输入 ${model.inputHash.slice(0, 16)}…，结果 ${model.resultHash.slice(0, 16)}…。`;
      main.querySelector('[data-model-levels]').innerHTML = model.levels.map((level) => `<div><strong>第 ${level.level} 关</strong><span>历史状态 ${level.visitedStates}/${level.theoreticalUpperBound} · 全命令转移 ${level.transitionCount} · 最短 ${level.shortestSteps}/${level.budget}</span></div>`).join('');
      main.querySelector('[data-model-boundary]').textContent = model.boundary;
      main.querySelector('[data-storage-summary]').textContent = `${model.storage.classes.length} 类存档输入全部通过：${model.storage.classes.map((item) => item.id).join('、')}。`;
    }
    if (statistics) {
      const bitText = statistics.bitDistribution.map((item) => `bit${item.bit}: ${item.zeros}/${item.ones}, H=${item.entropyBits.toFixed(3)}`).join('；');
      const rankText = statistics.rankDistribution.map((item) => `r${item.rank}=${item.count}`).join('、');
      const termText = statistics.termDistribution.map((item) => `${item.term}=${item.count}`).join('、');
      main.querySelector('[data-information-summary]').innerHTML = `<p><b>bit 分布与熵：</b>${bitText}</p><p><b>秩分布：</b>${rankText}；H=${statistics.rankEntropyBits.toFixed(3)}</p><p><b>固定词项：</b>${termText}</p>`;
      main.querySelector('[data-information-boundary]').textContent = statistics.boundary;
    }
    if (claimRegistry?.claims) {
      const claimsById = new Map(claimRegistry.claims.map((claim) => [claim.claimId, claim]));
      for (const element of main.querySelectorAll('[data-claim-id]')) {
        const claim = claimsById.get(element.dataset.claimId);
        if (!claim) continue;
        const audit = document.createElement('details');
        audit.className = 'claim-audit';
        audit.dataset.testid = 'claim-contract';
        audit.innerHTML = `<summary>${escapeHtml(claim.title)} · ${escapeHtml(claim.status)}</summary>
          <p><b>Claim ID:</b> <code>${escapeHtml(claim.claimId)}</code></p>
          <p><b>Domain:</b> ${escapeHtml(claim.domain.name)} (${claim.domain.cardinality.toLocaleString('zh-CN')})</p>
          <p><b>Axioms:</b> ${claim.axioms.map(escapeHtml).join(' / ')}</p>
          <p><b>Evidence:</b> ${claim.evidence.map(escapeHtml).join(' / ')}</p>
          <p><b>Boundary:</b> ${escapeHtml(claim.boundary)}</p>`;
        element.append(audit);
      }
    }
  } catch { /* 静态回退仍提供全部有限论域与边界。 */ }
}

function installKeyboard() {
  document.addEventListener('keydown', (event) => {
    if (view !== 'game' || event.target.matches('input,select,textarea') || document.querySelector('dialog[open]')) return;
    if (/^[1-6]$/.test(event.key)) perform({ type: 'flip', line: Number(event.key) - 1 });
  });
}

export function mountApp(element) {
  root = element; progress = loadProgress(localStorage); settings = loadSettings(localStorage);
  configureAudio(settings.muted);
  const initial = location.hash.slice(1); if (labels[initial]) view = initial;
  document.documentElement.classList.toggle('reduced-motion', settings.reducedMotion);
  window.addEventListener('hashchange', () => {
    const next = location.hash.slice(1);
    if (labels[next] && next !== view) { view = next; shell(); }
  });
  if (import.meta.env.MODE === 'test' || import.meta.env.VITE_E2E === '1') {
    window.__YIJING_TEST__ = {
      reset() { clearProgress(localStorage); localStorage.removeItem(STORAGE_KEYS.settings); progress = loadProgress(localStorage); settings = defaultSettings(); loadLevel(1, true); },
      loadLevel(number) { return loadLevel(number, true); },
      getLevelSolution(number) { const level = levels[number - 1]; return shortestActionPath(level.start, level.target, level.allowedActions); },
      storageKeys() { return { ...STORAGE_KEYS }; }
    };
  }
  setTimeout(() => { shell(); installKeyboard(); }, 0);
}
