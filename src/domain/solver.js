import { complement, flipLine, join, meet, normalizeState, reverseLines, xor } from './lattice.js';

function normalizeAction(action) {
  if (!action || typeof action !== 'object' || typeof action.type !== 'string') throw new TypeError('动作格式无效');
  return action;
}

export function applyAction(value, input) {
  const state = normalizeState(value);
  const action = normalizeAction(input);
  switch (action.type) {
    case 'flip': return flipLine(state, action.line);
    case 'complement': return complement(state);
    case 'reverse': return reverseLines(state);
    case 'join': return join(state, action.operand);
    case 'meet': return meet(state, action.operand);
    case 'xor': return xor(state, action.operand);
    default: throw new RangeError(`未知动作: ${action.type}`);
  }
}

/** 固定 64 状态数组的 BFS；动作顺序决定同长解的稳定选择。 */
export function shortestActionPath(start, target, actions) {
  const source = normalizeState(start);
  const destination = normalizeState(target);
  if (!Array.isArray(actions) || actions.length === 0) throw new TypeError('动作集不能为空');
  if (source === destination) return [];
  const previous = Array(64).fill(null);
  const via = Array(64).fill(null);
  const queue = [source];
  previous[source] = source;
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const current = queue[cursor];
    for (const action of actions) {
      const next = applyAction(current, action);
      if (previous[next] !== null) continue;
      previous[next] = current;
      via[next] = action;
      if (next === destination) {
        const result = [];
        for (let at = destination; at !== source; at = previous[at]) result.push(via[at]);
        return result.reverse().map((item) => ({ ...item }));
      }
      queue.push(next);
    }
  }
  return [];
}

export function replayActions(start, actions) {
  return actions.reduce((current, action) => applyAction(current, action), normalizeState(start));
}

const flips = () => Array.from({ length: 6 }, (_, line) => ({ type: 'flip', line }));
const baseDefinitions = [
  [0, 3, flips()], [1, 5, flips()], [5, 21, flips()],
  [3, 48, [{ type: 'complement' }, ...flips()]],
  [3, 48, [{ type: 'reverse' }, ...flips()]],
  [10, 53, [{ type: 'complement' }, { type: 'reverse' }, ...flips()]],
  [0, 3, [{ type: 'join', operand: 3 }, ...flips()]],
  [63, 3, [{ type: 'meet', operand: 3 }, ...flips()]],
  [1, 49, [{ type: 'join', operand: 48 }, { type: 'meet', operand: 49 }, ...flips()]],
  [0, 7, [{ type: 'xor', operand: 7 }, ...flips()]],
  [42, 21, [{ type: 'xor', operand: 63 }, ...flips()]],
  [9, 54, [{ type: 'xor', operand: 63 }, { type: 'complement' }, ...flips()]]
];

export function createLevels(seed = 20261029) {
  if (!Number.isInteger(seed)) throw new TypeError('种子必须是整数');
  return baseDefinitions.map(([start, target, allowedActions], index) => {
    const optimalSteps = shortestActionPath(start, target, allowedActions).length;
    return {
      number: index + 1,
      title: ['初爻之门','两爻相参','三才成象','错卦镜面','综卦回环','错综同构','并：取其阳','交：守其同','并交合用','异或之钥','全爻变换','六维归途'][index],
      seed,
      start,
      target,
      allowedActions: allowedActions.map((action) => ({ ...action })),
      optimalSteps,
      budget: optimalSteps + 2
    };
  });
}

export function calculateStars(steps, optimalSteps) {
  if (!Number.isInteger(steps) || !Number.isInteger(optimalSteps) || steps < 1 || optimalSteps < 1) throw new RangeError('步数必须为正整数');
  if (steps <= optimalSteps) return 3;
  if (steps <= optimalSteps + 2) return 2;
  return 1;
}

function sameAction(left, right) {
  return left.type === right.type && left.line === right.line && left.operand === right.operand;
}

function cloneSnapshot(snapshot) {
  return {
    state: snapshot.state,
    steps: snapshot.steps,
    status: snapshot.status,
    history: snapshot.history.map((item) => ({ state: item.state, action: { ...item.action } }))
  };
}

export function initialPuzzleSnapshot(level) {
  return { state: normalizeState(level.start), steps: 0, status: 'playing', history: [] };
}

/** Pure transition used by both the interactive session and the exhaustive model checker. */
export function reducePuzzleSession(level, inputSnapshot, command) {
  const snapshot = cloneSnapshot(inputSnapshot);
  if (!command || typeof command.type !== 'string') throw new TypeError('会话命令格式无效');
  if (command.type === 'hint') {
    return {
      snapshot,
      accepted: true,
      output: snapshot.status === 'playing'
        ? shortestActionPath(snapshot.state, level.target, level.allowedActions)[0] ?? null
        : null
    };
  }
  if (command.type === 'restart') return { snapshot: initialPuzzleSnapshot(level), accepted: true };
  if (command.type === 'undo') {
    const previous = snapshot.history.pop();
    if (!previous) return { snapshot, accepted: false };
    snapshot.state = previous.state;
    snapshot.steps = Math.max(0, snapshot.steps - 1);
    snapshot.status = 'playing';
    return { snapshot, accepted: true };
  }
  if (command.type !== 'apply') throw new RangeError(`未知会话命令: ${command.type}`);
  const action = command.action;
  if (snapshot.status !== 'playing' || !level.allowedActions.some((allowed) => sameAction(allowed, action ?? {}))) {
    return { snapshot, accepted: false };
  }
  const next = applyAction(snapshot.state, action);
  snapshot.history.push({ state: snapshot.state, action: { ...action } });
  snapshot.state = next;
  snapshot.steps++;
  if (snapshot.state === level.target) snapshot.status = 'completed';
  else if (snapshot.steps >= level.budget) snapshot.status = 'failed';
  return { snapshot, accepted: true };
}

export function createPuzzleSession(level) {
  let current = initialPuzzleSnapshot(level);
  const transition = (command) => {
    const result = reducePuzzleSession(level, current, command);
    current = result.snapshot;
    return result;
  };
  return {
    snapshot: () => cloneSnapshot(current),
    hint: () => transition({ type: 'hint' }).output,
    apply: (action) => transition({ type: 'apply', action }).accepted,
    undo: () => transition({ type: 'undo' }).accepted,
    restart: () => { transition({ type: 'restart' }); }
  };
}
