import { createHash } from 'node:crypto';
import { applyAction, initialPuzzleSnapshot, reducePuzzleSession, shortestActionPath } from './solver.js';
import { defaultProgress, loadProgress, loadSettings, STORAGE_KEYS } from '../services/storage.js';

const stable = (value) => JSON.stringify(value, null, 2);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key) };
}

export function modelCheckLevels(levels) {
  const results = levels.map((level) => {
    const shortestActions = shortestActionPath(level.start, level.target, level.allowedActions);
    const initial = initialPuzzleSnapshot(level);
    const stateKey = (snapshot) => stable(snapshot);
    const seen = new Map([[stateKey(initial), initial]]);
    const queue = [initial];
    const checks = Object.fromEntries([
      'historyConsistency', 'illegalActionIsNoop', 'hintIsReadOnly', 'settlementIsIdempotent',
      'undoRestoresState', 'restartRestoresInitialState', 'allowedApplySemantics', 'budgetExhaustionComplete'
    ].map((id) => [id, { checked: 0, failures: 0, counterexamples: [] }]));
    const record = (id, passed, snapshot, command, next) => {
      const check = checks[id];
      check.checked++;
      if (passed) return;
      check.failures++;
      if (check.counterexamples.length < 16) check.counterexamples.push({ snapshot, command, next });
    };
    const coverage = {
      allowedApply: 0, undo: 0, restart: 0, illegalApply: 0, hint: 0,
      terminalSettlementApply: 0, budgetExhaustionTerminalStates: 0, completedTerminalStates: 0
    };
    const transitionHasher = createHash('sha256');
    let transitionCount = 0;
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const snapshot = queue[cursor];
      let replayed = level.start;
      let historyValid = snapshot.steps === snapshot.history.length;
      for (const entry of snapshot.history) {
        historyValid &&= entry.state === replayed;
        replayed = reducePuzzleSession(level, {
          state: replayed,
          steps: 0,
          status: 'playing',
          history: []
        }, { type: 'apply', action: entry.action }).snapshot.state;
      }
      const expectedStatus = snapshot.state === level.target ? 'completed'
        : snapshot.steps >= level.budget ? 'failed' : 'playing';
      historyValid &&= replayed === snapshot.state && snapshot.status === expectedStatus;
      record('historyConsistency', historyValid, snapshot, { type: 'validate-history' }, snapshot);
      if (snapshot.status === 'failed') {
        coverage.budgetExhaustionTerminalStates++;
        record('budgetExhaustionComplete', snapshot.steps === level.budget && snapshot.state !== level.target, snapshot, { type: 'validate-budget' }, snapshot);
      }
      if (snapshot.status === 'completed') coverage.completedTerminalStates++;

      const commands = [
        ...level.allowedActions.map((action) => ({ type: 'apply', action })),
        { type: 'undo' }, { type: 'restart' },
        { type: 'apply', action: { type: 'not-allowed' } }, { type: 'hint' }
      ];
      for (const command of commands) {
        transitionCount++;
        const result = reducePuzzleSession(level, snapshot, command);
        const next = result.snapshot;
        const unchanged = stateKey(next) === stateKey(snapshot);
        transitionHasher.update(`${stable({ from: snapshot, command, accepted: result.accepted, output: result.output ?? null, to: next })}\n`);
        if (command.type === 'hint') {
          coverage.hint++;
          record('hintIsReadOnly', unchanged, snapshot, command, next);
        } else if (command.type === 'restart') {
          coverage.restart++;
          record('restartRestoresInitialState', stateKey(next) === stateKey(initial), snapshot, command, next);
        } else if (command.type === 'undo') {
          coverage.undo++;
          const expected = snapshot.history.length === 0
            ? snapshot
            : {
                state: snapshot.history.at(-1).state,
                steps: snapshot.steps - 1,
                status: 'playing',
                history: snapshot.history.slice(0, -1)
              };
          record('undoRestoresState', stateKey(next) === stateKey(expected)
            && result.accepted === (snapshot.history.length > 0), snapshot, command, next);
        } else if (command.action.type === 'not-allowed') {
          coverage.illegalApply++;
          record('illegalActionIsNoop', unchanged && !result.accepted, snapshot, command, next);
        } else {
          coverage.allowedApply++;
          if (snapshot.status !== 'playing') {
            coverage.terminalSettlementApply++;
            record('settlementIsIdempotent', unchanged && !result.accepted, snapshot, command, next);
          } else {
            const expectedState = applyAction(snapshot.state, command.action);
            const expectedStatus = expectedState === level.target ? 'completed'
              : snapshot.steps + 1 >= level.budget ? 'failed' : 'playing';
            record('allowedApplySemantics', result.accepted
              && next.state === expectedState
              && next.steps === snapshot.steps + 1
              && next.status === expectedStatus
              && next.history.length === snapshot.history.length + 1,
            snapshot, command, next);
          }
        }
        const key = stateKey(next);
        if (!seen.has(key)) { seen.set(key, next); queue.push(next); }
      }
    }
    const historySequenceUpperBound = Array.from({ length: level.budget + 1 }, (_, depth) => level.allowedActions.length ** depth)
      .reduce((sum, count) => sum + count, 0);
    const projectedStates = new Set([...seen.values()].map((snapshot) => `${snapshot.state}:${level.budget - snapshot.steps}`));
    const inputHash = sha256(stable(level));
    const core = {
      level: level.number,
      inputHash,
      stateProjection: 'state+steps+status+ordered-history',
      finiteDomains: {
        state: 64,
        remainingBudget: level.budget + 1,
        status: 3,
        historyMaxLength: level.budget,
        historySequenceUpperBound,
        commandAlphabet: level.allowedActions.length + 4
      },
      theoreticalUpperBound: historySequenceUpperBound,
      visitedStates: seen.size,
      transitionCount,
      reachableStateSetHash: sha256([...seen.keys()].join('\n')),
      transitionRelationHash: transitionHasher.digest('hex'),
      historyProjectionCollisions: seen.size - projectedStates.size,
      commandCoverage: coverage,
      reachable: shortestActions.length > 0 || level.start === level.target,
      shortestSteps: shortestActions.length,
      shortestActions,
      budgetFailureVerified: coverage.budgetExhaustionTerminalStates > 0,
      invariants: {
        illegalActionIsNoop: checks.illegalActionIsNoop.failures === 0,
        hintIsReadOnly: checks.hintIsReadOnly.failures === 0,
        settlementIsIdempotent: checks.settlementIsIdempotent.failures === 0,
        undoRestoresState: checks.undoRestoresState.failures === 0,
        restartRestoresInitialState: checks.restartRestoresInitialState.failures === 0
      },
      invariantChecks: checks,
      budget: level.budget,
      start: level.start,
      target: level.target,
      allowedActions: level.allowedActions,
      boundary: '穷举固定关卡预算内所有可达的有序历史会话状态及全部允许动作、撤销、重开、非法动作和提示；不覆盖浏览器、计时或未登记命令。'
    };
    return { ...core, resultHash: sha256(stable(core)) };
  });
  return {
    levels: results,
    summary: {
      allFinite: results.every((item) => Number.isFinite(item.theoreticalUpperBound)),
      allReachableSessionStatesExhausted: results.every((item) => item.visitedStates <= item.theoreticalUpperBound
        && Object.values(item.invariantChecks).every((check) => check.failures === 0)),
      totalVisitedStates: results.reduce((sum, item) => sum + item.visitedStates, 0),
      totalTransitions: results.reduce((sum, item) => sum + item.transitionCount, 0),
      totalCounterexamples: results.reduce((sum, item) => sum
        + Object.values(item.invariantChecks).reduce((count, check) => count + check.failures, 0), 0)
    }
  };
}

export function modelCheckStorageSchemas() {
  const defaults = defaultProgress();
  const settingsRaw = JSON.stringify({ muted: true, reducedMotion: false });
  const cases = [
    ['current-valid', JSON.stringify(defaults)],
    ['legacy-valid', JSON.stringify({ version: 0, unlocked: 2, best: { 1: 1 }, ratings: { 1: 3 } })],
    ['malformed-json', '{'],
    ['wrong-types', JSON.stringify({ version: 1, highestUnlockedLevel: 'x' })],
    ['out-of-range', JSON.stringify({ ...defaults, highestUnlockedLevel: 99 })],
    ['future-version', JSON.stringify({ ...defaults, version: 99 })],
    ['unknown-fields', JSON.stringify({ ...defaults, ignored: true })]
  ];
  const classes = cases.map(([id, value]) => {
    const input = { progressRaw: value, settingsRaw };
    const storage = memoryStorage({ [STORAGE_KEYS.progress]: value, [STORAGE_KEYS.settings]: settingsRaw });
    const progress = loadProgress(storage); const settings = loadSettings(storage);
    const output = { progress, settings };
    const expectedProgress = id === 'legacy-valid'
      ? { ...defaults, highestUnlockedLevel: 2, bestSteps: [1, ...defaults.bestSteps.slice(1)], stars: [3, ...defaults.stars.slice(1)] }
      : defaults;
    const passed = JSON.stringify(progress) === JSON.stringify(expectedProgress)
      && JSON.stringify(settings) === JSON.stringify({ muted: true, reducedMotion: false })
      && !Object.hasOwn(progress, 'ignored');
    return {
      id,
      input,
      inputHash: sha256(stable(input)),
      output,
      outputHash: sha256(stable(output)),
      passed
    };
  });
  return { classes, allPassed: classes.every((item) => item.passed), settingsKeyIsolated: STORAGE_KEYS.progress !== STORAGE_KEYS.settings, unknownFieldsIsolated: !Object.hasOwn(loadProgress(memoryStorage({ [STORAGE_KEYS.progress]: cases.at(-1)[1] })), 'ignored') };
}
