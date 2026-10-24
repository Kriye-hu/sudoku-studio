/*
 * Sudoku Studio — puzzle core
 * Plain UMD script so it works from file:// in the browser and from Node for tests.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SudokuCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SIZE = 9;
  const CELLS = SIZE * SIZE;
  const FULL_MASK = 0x3fe; // bits 1..9

  const LEVELS = {
    easy: {
      key: 'easy',
      name: '轻松',
      en: 'EASY',
      targetClues: 41,
      estimate: '约 4 分钟',
      description: '留足线索，适合热身',
      next: 'medium'
    },
    medium: {
      key: 'medium',
      name: '中等',
      en: 'MEDIUM',
      targetClues: 33,
      estimate: '约 8 分钟',
      description: '需要一点耐心和推理',
      next: 'hard'
    },
    hard: {
      key: 'hard',
      name: '困难',
      en: 'HARD',
      targetClues: 29,
      estimate: '约 15 分钟',
      description: '线索收紧，专注推演',
      next: 'expert'
    },
    expert: {
      key: 'expert',
      name: '专家',
      en: 'EXPERT',
      targetClues: 25,
      estimate: '约 25 分钟',
      description: '为安静而漫长的思考准备',
      next: 'easy'
    }
  };

  const LEVEL_ORDER = ['easy', 'medium', 'hard', 'expert'];

  function shuffle(array, random) {
    const rng = random || Math.random;
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = array[i];
      array[i] = array[j];
      array[j] = tmp;
    }
    return array;
  }

  function popcount(value) {
    let n = value - ((value >> 1) & 0x55555555);
    n = (n & 0x33333333) + ((n >> 2) & 0x33333333);
    return (((n + (n >> 4)) & 0x0f0f0f0f) * 0x01010101) >> 24;
  }

  function boxOf(index) {
    const row = (index / SIZE) | 0;
    const col = index % SIZE;
    return ((row / 3) | 0) * 3 + ((col / 3) | 0);
  }

  function createMasks() {
    return {
      rows: new Int32Array(SIZE),
      cols: new Int32Array(SIZE),
      boxes: new Int32Array(SIZE)
    };
  }

  function readMasks(grid) {
    const masks = createMasks();
    for (let i = 0; i < CELLS; i++) {
      const value = grid[i];
      if (!value) continue;
      const row = (i / SIZE) | 0;
      const col = i % SIZE;
      const box = boxOf(i);
      const bit = 1 << value;
      if ((masks.rows[row] | masks.cols[col] | masks.boxes[box]) & bit) return null;
      masks.rows[row] |= bit;
      masks.cols[col] |= bit;
      masks.boxes[box] |= bit;
    }
    return masks;
  }

  /**
   * Build a random complete solution using randomized backtracking.
   */
  function makeSolvedGrid(random) {
    const rng = random || Math.random;
    const grid = new Uint8Array(CELLS);
    const masks = createMasks();

    function place(index) {
      if (index === CELLS) return true;
      const row = (index / SIZE) | 0;
      const col = index % SIZE;
      const box = boxOf(index);
      const used = masks.rows[row] | masks.cols[col] | masks.boxes[box];
      let candidates = [];
      for (let value = 1; value <= 9; value++) {
        if (!(used & (1 << value))) candidates.push(value);
      }
      shuffle(candidates, rng);
      for (let i = 0; i < candidates.length; i++) {
        const value = candidates[i];
        const bit = 1 << value;
        grid[index] = value;
        masks.rows[row] |= bit;
        masks.cols[col] |= bit;
        masks.boxes[box] |= bit;
        if (place(index + 1)) return true;
        masks.rows[row] &= ~bit;
        masks.cols[col] &= ~bit;
        masks.boxes[box] &= ~bit;
        grid[index] = 0;
      }
      return false;
    }

    if (!place(0)) throw new Error('Unable to generate a complete Sudoku grid.');
    return Array.from(grid);
  }

  /**
   * Count solutions up to `limit`, using minimum-remaining-values branch ordering.
   * Returns 0, 1 or `limit`.
   */
  function countSolutions(input, limit) {
    const cap = limit == null ? 2 : limit;
    const grid = new Uint8Array(CELLS);
    for (let i = 0; i < CELLS; i++) grid[i] = input[i] | 0;
    const masks = readMasks(grid);
    if (!masks) return 0;

    let found = 0;

    function search() {
      let bestIndex = -1;
      let bestMask = 0;
      let bestCount = 10;

      for (let i = 0; i < CELLS; i++) {
        if (grid[i]) continue;
        const row = (i / SIZE) | 0;
        const col = i % SIZE;
        const box = boxOf(i);
        const used = masks.rows[row] | masks.cols[col] | masks.boxes[box];
        const mask = FULL_MASK & ~used;
        const count = popcount(mask);
        if (count === 0) return;
        if (count < bestCount) {
          bestCount = count;
          bestMask = mask;
          bestIndex = i;
          if (count === 1) break;
        }
      }

      if (bestIndex === -1) {
        found++;
        return;
      }

      const row = (bestIndex / SIZE) | 0;
      const col = bestIndex % SIZE;
      const box = boxOf(bestIndex);
      let mask = bestMask;

      while (mask) {
        const bit = mask & -mask;
        mask ^= bit;
        const value = 31 - Math.clz32(bit);

        grid[bestIndex] = value;
        masks.rows[row] |= bit;
        masks.cols[col] |= bit;
        masks.boxes[box] |= bit;

        search();

        grid[bestIndex] = 0;
        masks.rows[row] &= ~bit;
        masks.cols[col] &= ~bit;
        masks.boxes[box] &= ~bit;

        if (found >= cap) return;
      }
    }

    search();
    return found;
  }

  /**
   * Solve a puzzle and return one solution (or null).
   */
  function solve(input) {
    const solution = new Array(CELLS).fill(0);
    if (countSolutionsWithFirst(input, solution, 1) < 1) return null;
    return solution;
  }

  function countSolutionsWithFirst(input, firstSolution, cap) {
    const grid = new Uint8Array(CELLS);
    for (let i = 0; i < CELLS; i++) grid[i] = input[i] | 0;
    const masks = readMasks(grid);
    if (!masks) return 0;
    let found = 0;

    function search() {
      let bestIndex = -1;
      let bestMask = 0;
      let bestCount = 10;
      for (let i = 0; i < CELLS; i++) {
        if (grid[i]) continue;
        const row = (i / SIZE) | 0;
        const col = i % SIZE;
        const box = boxOf(i);
        const mask = FULL_MASK & ~(masks.rows[row] | masks.cols[col] | masks.boxes[box]);
        const count = popcount(mask);
        if (count === 0) return;
        if (count < bestCount) {
          bestCount = count;
          bestMask = mask;
          bestIndex = i;
          if (count === 1) break;
        }
      }
      if (bestIndex === -1) {
        if (found === 0 && firstSolution) {
          for (let i = 0; i < CELLS; i++) firstSolution[i] = grid[i];
        }
        found++;
        return;
      }
      const row = (bestIndex / SIZE) | 0;
      const col = bestIndex % SIZE;
      const box = boxOf(bestIndex);
      let mask = bestMask;
      while (mask) {
        const bit = mask & -mask;
        mask ^= bit;
        const value = 31 - Math.clz32(bit);
        grid[bestIndex] = value;
        masks.rows[row] |= bit;
        masks.cols[col] |= bit;
        masks.boxes[box] |= bit;
        search();
        grid[bestIndex] = 0;
        masks.rows[row] &= ~bit;
        masks.cols[col] &= ~bit;
        masks.boxes[box] &= ~bit;
        if (found >= cap) return;
      }
    }

    search();
    return found;
  }

  function isComplete(grid) {
    return grid.length === CELLS && grid.every(function (value) { return value >= 1 && value <= 9; });
  }

  function sameGrid(a, b) {
    if (!a || !b || a.length !== CELLS || b.length !== CELLS) return false;
    for (let i = 0; i < CELLS; i++) if (a[i] !== b[i]) return false;
    return true;
  }

  /**
   * Generate a puzzle with a guaranteed unique solution.
   * Cells are removed in rotationally symmetric pairs where possible.
   */
  function generate(levelKey, options) {
    const settings = LEVELS[levelKey] || LEVELS.medium;
    const targetClues = (options && options.targetClues) || settings.targetClues;
    const rng = (options && options.random) || Math.random;
    const solution = makeSolvedGrid(rng);
    const puzzle = solution.slice();
    let clues = CELLS;

    // 0..39 form symmetric pairs with 80..41; 40 is the centre cell.
    const pairStarts = [];
    for (let i = 0; i < 40; i++) pairStarts.push(i);
    shuffle(pairStarts, rng);

    for (let p = 0; p < pairStarts.length && clues > targetClues; p++) {
      const a = pairStarts[p];
      const b = CELLS - 1 - a;
      if (clues - 2 < targetClues) continue;

      const valueA = puzzle[a];
      const valueB = puzzle[b];
      puzzle[a] = 0;
      puzzle[b] = 0;

      if (countSolutions(puzzle, 2) === 1) {
        clues -= 2;
        if (clues === targetClues) break;
      } else {
        puzzle[a] = valueA;
        puzzle[b] = valueB;
      }
    }

    // If symmetry left one clue too many, try the centre cell.
    if (clues > targetClues) {
      const centre = 40;
      if (puzzle[centre] !== 0) {
        const value = puzzle[centre];
        puzzle[centre] = 0;
        if (countSolutions(puzzle, 2) === 1) clues -= 1;
        else puzzle[centre] = value;
      }
    }

    return {
      level: settings.key,
      puzzle: puzzle,
      solution: solution,
      clues: clues,
      targetClues: targetClues
    };
  }

  function level(key) {
    return LEVELS[key] || LEVELS.medium;
  }

  return {
    SIZE: SIZE,
    CELLS: CELLS,
    LEVELS: LEVELS,
    LEVEL_ORDER: LEVEL_ORDER,
    level: level,
    generate: generate,
    countSolutions: countSolutions,
    solve: solve,
    isComplete: isComplete,
    sameGrid: sameGrid
  };
});
