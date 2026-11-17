/*
 * 规则校验的回归测试（2026-11-17 加）
 *
 * 起因：app.js 原来拿「等于预设答案」当判错标准，填一格就实时告诉玩家对错，
 * 等于把答案漏出去。改成按「行 / 列 / 宫不重复」判之后，这里把三段行为钉住：
 *   1. 完整的正确盘面   → 通关
 *   2. 出现重复         → 冲突、不算通关
 *   3. 不冲突但也不是标准答案的填法 → 不算错（旧写法会判错）
 *
 * 跑：node --test tests/
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const Core = require(path.join(__dirname, '..', 'sudoku.js'));

const SIZE = 9;
const CELLS = 81;

function freshPuzzle() {
  // 固定 seed 让测试可复现
  let seed = 20261117;
  const random = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  return Core.generate('medium', { random });
}

test('导出了规则校验函数', () => {
  for (const name of ['peersOf', 'conflictsAt', 'conflictingCells', 'hasConflict', 'isSolved']) {
    assert.strictEqual(typeof Core[name], 'function', name + ' 应该是函数');
  }
});

test('peersOf 返回同行、同列、同宫的 20 格', () => {
  assert.strictEqual(Core.peersOf(0).length, 20);
  assert.strictEqual(Core.peersOf(40).length, 20);
  const peers = Core.peersOf(0);
  assert.ok(!peers.includes(0), '不应该包含自己');
});

test('完整解算盘面判为通关', () => {
  const { solution } = freshPuzzle();
  assert.strictEqual(Core.isSolved(solution), true);
  assert.strictEqual(Core.hasConflict(solution), false);
  assert.deepStrictEqual(Core.conflictingCells(solution), []);
});

test('同行出现重复 → 冲突，且不算通关', () => {
  const { puzzle, solution } = freshPuzzle();
  const board = Array.from(puzzle);
  // 找一个空格，填上它左边同一行已有的数字（必然重复）
  const empty = board.findIndex((v) => v === 0);
  const row = Math.floor(empty / SIZE);
  let duplicate = 0;
  for (let c = 0; c < SIZE; c++) {
    const v = board[row * SIZE + c];
    if (v !== 0 && (row * SIZE + c) !== empty) { duplicate = v; break; }
  }
  assert.notStrictEqual(duplicate, 0, '这一行应该有别的数字');
  board[empty] = duplicate;

  assert.strictEqual(Core.conflictsAt(board, empty), true);
  assert.strictEqual(Core.hasConflict(board), true);
  assert.ok(Core.conflictingCells(board).includes(empty));
  assert.strictEqual(Core.isSolved(board), false);
  // 填错不该把 solution 改掉
  assert.notStrictEqual(board[empty], solution[empty]);
});

test('空格不算冲突', () => {
  const { puzzle } = freshPuzzle();
  for (let i = 0; i < CELLS; i++) {
    if (puzzle[i] === 0) {
      assert.strictEqual(Core.conflictsAt(puzzle, i), false);
      break;
    }
  }
});

test('回归：不冲突但不是标准答案的填法，不再被判错', () => {
  // 旧写法 board[i] !== solution[i] 会把它当错；
  // 数独规则只看冲突，所以新写法必须放行。
  let found = null;
  for (let attempt = 0; attempt < 40 && !found; attempt++) {
    const { puzzle, solution } = freshPuzzle();
    const board = Array.from(puzzle);
    for (let i = 0; i < CELLS && !found; i++) {
      if (board[i] !== 0) continue;
      for (let v = 1; v <= 9; v++) {
        if (v === solution[i]) continue;
        board[i] = v;
        if (!Core.conflictsAt(board, i)) { found = { i, v, solution: solution[i], board, solutionGrid: solution }; break; }
        board[i] = 0;
      }
    }
  }
  assert.ok(found, '应该能找到一个「不冲突但和答案不同」的填法（40 次出题内）');
  assert.strictEqual(Core.conflictsAt(found.board, found.i), false);
  assert.notStrictEqual(found.v, found.solution);
  assert.strictEqual(Core.isSolved(found.board), false, '没填满不算通关');
});

test('isSolved 要求填满 + 无冲突', () => {
  const { solution } = freshPuzzle();
  const partial = Array.from(solution);
  partial[0] = 0;
  assert.strictEqual(Core.isSolved(partial), false, '缺一格不算通关');
});
