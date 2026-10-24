/* =========================================================
   Sudoku Studio — application
   ========================================================= */

(function () {
  'use strict';

  const Core = window.SudokuCore;
  if (!Core) {
    document.body.textContent = '数独核心脚本加载失败，请确认 sudoku.js 与 index.html 位于同一目录。';
    return;
  }

  const SAVE_KEY = 'sudoku-studio-save-v1';
  const STATS_KEY = 'sudoku-studio-stats-v1';
  const THEME_KEY = 'sudoku-studio-theme-v1';
  const INSTALL_HINT_KEY = 'sudoku-studio-install-hint-v1';
  const DEFAULT_STATUS = '选一个空格，慢慢推演。';
  const MAX_HISTORY = 240;
  const IS_IOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const IS_STANDALONE = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
  const IS_INSTALLABLE_CONTEXT = location.protocol === 'http:' || location.protocol === 'https:';

  const els = {
    board: document.getElementById('board'),
    boardFrame: document.getElementById('boardFrame'),
    pauseCover: document.getElementById('pauseCover'),
    winCover: document.getElementById('winCover'),
    loadingCover: document.getElementById('loadingCover'),
    confetti: document.getElementById('confetti'),
    resumeBtn: document.getElementById('resumeBtn'),
    againBtn: document.getElementById('againBtn'),
    winChangeBtn: document.getElementById('winChangeBtn'),
    timer: document.getElementById('timer'),
    pauseBtn: document.getElementById('pauseBtn'),
    levelChip: document.getElementById('levelChip'),
    levelName: document.getElementById('levelName'),
    topLevel: document.getElementById('topLevel'),
    mistakeCount: document.getElementById('mistakeCount'),
    hintCount: document.getElementById('hintCount'),
    progressTrack: document.getElementById('progressTrack'),
    progressFill: document.getElementById('progressFill'),
    progressText: document.getElementById('progressText'),
    statusLine: document.getElementById('statusLine'),
    playPanel: document.getElementById('playPanel'),
    undoBtn: document.getElementById('undoBtn'),
    eraseBtn: document.getElementById('eraseBtn'),
    notesBtn: document.getElementById('notesBtn'),
    hintBtn: document.getElementById('hintBtn'),
    numpad: document.getElementById('numpad'),
    modeText: document.getElementById('modeText'),
    modeTip: document.getElementById('modeTip'),
    newGameBtn: document.getElementById('newGameBtn'),
    themeToggle: document.getElementById('themeToggle'),
    themeColor: document.getElementById('themeColor'),
    bestTime: document.getElementById('bestTime'),
    bestList: document.getElementById('bestList'),
    completedCount: document.getElementById('completedCount'),
    newGameDialog: document.getElementById('newGameDialog'),
    levelGrid: document.getElementById('levelGrid'),
    closeDialogBtn: document.getElementById('closeDialogBtn'),
    continueBtn: document.getElementById('continueBtn'),
    winTime: document.getElementById('winTime'),
    winRecord: document.getElementById('winRecord'),
    winLevel: document.getElementById('winLevel'),
    winMistakes: document.getElementById('winMistakes'),
    winHints: document.getElementById('winHints'),
    toast: document.getElementById('toast'),
    installStrip: document.getElementById('installStrip'),
    installBtn: document.getElementById('installBtn'),
    installDismiss: document.getElementById('installDismiss'),
    installDialog: document.getElementById('installDialog'),
    closeInstallBtn: document.getElementById('closeInstallBtn'),
    installDoneBtn: document.getElementById('installDoneBtn'),
    iosSteps: document.getElementById('iosSteps'),
    genericSteps: document.getElementById('genericSteps')
  };

  const state = {
    level: 'medium',
    puzzle: new Array(81).fill(0),
    solution: new Array(81).fill(0),
    board: new Array(81).fill(0),
    notes: new Array(81).fill(0),
    fixed: new Array(81).fill(false),
    selected: -1,
    notesMode: false,
    mistakes: 0,
    hints: 0,
    elapsed: 0,
    runStart: null,
    timerStarted: false,
    paused: false,
    solved: false,
    generating: false,
    history: [],
    lastChanged: -1
  };

  const cellEls = [];
  const cellBaseClasses = [];
  const numEls = [];
  let stats = loadStats();
  let tickTimer = null;
  let statusTimer = null;
  let toastTimer = null;
  let generationToken = 0;
  let justSetTimer = null;
  let dialogPausedTimer = false;
  let deferredInstallPrompt = null;

  /* =========================================================
     Boot
     ========================================================= */

  buildBoard();
  buildNumpad();
  bindEvents();
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light', false);
  renderStats();

  const savedGame = readSavedGame();
  if (savedGame) {
    restoreGame(savedGame);
    els.loadingCover.hidden = true;
    setStatus('接着上次，慢慢来。');
    showToast('已恢复上次的进度');
  } else {
    startNewGame('medium', { initial: true });
  }

  initInstallExperience();
  registerServiceWorker();

  /* =========================================================
     Board and keypad construction
     ========================================================= */

  function buildBoard() {
    const fragment = document.createDocumentFragment();

    for (let index = 0; index < 81; index++) {
      const row = Math.floor(index / 9);
      const col = index % 9;
      const cell = document.createElement('button');
      const classes = ['cell'];

      cell.type = 'button';
      cell.dataset.index = String(index);
      cell.setAttribute('role', 'gridcell');
      cell.setAttribute('aria-rowindex', String(row + 1));
      cell.setAttribute('aria-colindex', String(col + 1));
      cell.tabIndex = index === 0 ? 0 : -1;

      if (col % 3 === 2 && col < 8) {
        classes.push('box-right');
      }
      if (row % 3 === 2 && row < 8) {
        classes.push('box-bottom');
      }
      if ((Math.floor(row / 3) + Math.floor(col / 3)) % 2 === 1) {
        classes.push('alt');
      }

      cellBaseClasses[index] = classes.join(' ');
      cell.className = cellBaseClasses[index];

      const value = document.createElement('span');
      value.className = 'cell-value';

      const notes = document.createElement('span');
      notes.className = 'cell-notes';
      notes.setAttribute('aria-hidden', 'true');
      for (let n = 1; n <= 9; n++) {
        const note = document.createElement('span');
        note.className = 'cell-note';
        note.dataset.note = String(n);
        note.textContent = String(n);
        notes.appendChild(note);
      }

      cell.appendChild(value);
      cell.appendChild(notes);

      cell.addEventListener('click', function () {
        selectCell(index);
      });
      cell.addEventListener('focus', function () {
        if (state.generating || state.paused || state.solved) return;
        if (state.selected === index) return;
        state.selected = index;
        startTimer();
        renderBoard();
      });

      cellEls.push(cell);
      fragment.appendChild(cell);
    }

    els.board.appendChild(fragment);
  }

  function buildNumpad() {
    const fragment = document.createDocumentFragment();

    for (let n = 1; n <= 9; n++) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'num-key';
      button.dataset.num = String(n);

      const digit = document.createElement('span');
      digit.className = 'num-digit';
      digit.textContent = String(n);

      const count = document.createElement('span');
      count.className = 'num-count';
      count.dataset.countFor = String(n);
      count.textContent = '9';

      button.appendChild(digit);
      button.appendChild(count);
      button.addEventListener('click', function () {
        inputNumber(n);
      });

      numEls.push(button);
      fragment.appendChild(button);
    }

    els.numpad.appendChild(fragment);
  }

  /* =========================================================
     Events
     ========================================================= */

  function bindEvents() {
    els.pauseBtn.addEventListener('click', togglePause);
    els.resumeBtn.addEventListener('click', resumeGame);
    els.undoBtn.addEventListener('click', undo);
    els.eraseBtn.addEventListener('click', eraseCell);
    els.notesBtn.addEventListener('click', toggleNotesMode);
    els.hintBtn.addEventListener('click', useHint);
    els.newGameBtn.addEventListener('click', openNewGameDialog);
    els.closeDialogBtn.addEventListener('click', closeNewGameDialog);
    els.continueBtn.addEventListener('click', closeNewGameDialog);
    els.againBtn.addEventListener('click', function () {
      startNewGame(state.level);
    });
    els.winChangeBtn.addEventListener('click', function () {
      openNewGameDialog();
    });
    els.themeToggle.addEventListener('click', function () {
      const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      applyTheme(next, true);
    });
    els.installBtn.addEventListener('click', startInstall);
    els.installDismiss.addEventListener('click', dismissInstallHint);
    els.closeInstallBtn.addEventListener('click', closeInstallDialog);
    els.installDoneBtn.addEventListener('click', closeInstallDialog);
    els.installDialog.addEventListener('close', function () {
      document.body.classList.remove('modal-open');
    });

    els.levelGrid.addEventListener('click', function (event) {
      const option = event.target.closest('.level-option');
      if (!option) return;
      const level = option.dataset.level;
      if (!Core.LEVELS[level]) return;
      closeNewGameDialog();
      startNewGame(level);
    });

    els.newGameDialog.addEventListener('click', function (event) {
      if (event.target !== els.newGameDialog) return;
      const rect = els.newGameDialog.getBoundingClientRect();
      const outside = event.clientX < rect.left || event.clientX > rect.right
        || event.clientY < rect.top || event.clientY > rect.bottom;
      if (outside) closeNewGameDialog();
    });

    els.newGameDialog.addEventListener('close', function () {
      document.body.classList.remove('modal-open');
      if (dialogPausedTimer) {
        dialogPausedTimer = false;
        if (!state.paused && !state.solved && !state.generating) startTimer();
      }
    });

    document.addEventListener('keydown', handleKeydown);

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') {
        if (!state.paused && !state.solved && state.runStart !== null) pauseGame(true);
        else saveGame();
      }
    });

    window.addEventListener('pagehide', function () {
      if (!state.solved) {
        if (state.runStart !== null) pauseGame(true);
        else saveGame();
      }
    });

    window.addEventListener('beforeunload', function () {
      if (state.solved || state.generating) return;
      if (state.runStart !== null) {
        state.elapsed = currentElapsed();
        state.runStart = null;
      }
      saveGame();
    });
  }

  /* =========================================================
     New game and restore
     ========================================================= */

  function startNewGame(levelKey, options) {
    if (state.generating) return;
    const opts = options || {};
    const level = Core.LEVELS[levelKey] ? levelKey : 'medium';

    closeNewGameDialog();
    if (!opts.initial) window.scrollTo({ top: 0, behavior: 'smooth' });
    if (state.runStart !== null) pauseTimer();
    state.generating = true;
    generationToken += 1;
    const token = generationToken;

    els.loadingCover.hidden = false;
    els.boardFrame.setAttribute('aria-busy', 'true');
    els.newGameBtn.disabled = true;
    document.body.classList.add('is-generating');
    stopTicker();

    window.setTimeout(function () {
      if (token !== generationToken) return;
      try {
        const game = Core.generate(level);
        applyGame(game);
        if (!opts.initial) showToast('新棋盘准备好了');
      } catch (error) {
        console.error(error);
        setStatus('棋盘生成失败，请再试一次。', 'error', false);
      } finally {
        state.generating = false;
        els.loadingCover.hidden = true;
        els.boardFrame.removeAttribute('aria-busy');
        els.newGameBtn.disabled = false;
        document.body.classList.remove('is-generating');
        renderAll();
        saveGame();
      }
    }, opts.initial ? 30 : 60);
  }

  function applyGame(game) {
    state.level = game.level;
    state.puzzle = Array.from(game.puzzle);
    state.solution = Array.from(game.solution);
    state.board = Array.from(game.puzzle);
    state.notes = new Array(81).fill(0);
    state.fixed = state.puzzle.map(function (value) { return value !== 0; });
    state.selected = -1;
    state.notesMode = false;
    state.mistakes = 0;
    state.hints = 0;
    state.elapsed = 0;
    state.runStart = null;
    state.timerStarted = false;
    state.paused = false;
    state.solved = false;
    state.history = [];
    state.lastChanged = -1;

    els.pauseCover.hidden = true;
    els.winCover.hidden = true;
    els.confetti.textContent = '';
    els.pauseBtn.classList.remove('is-paused');
    els.pauseBtn.disabled = false;

    renderAll();
    setStatus('新的一局。选一个空格开始。');
  }

  function restoreGame(saved) {
    state.level = saved.level;
    state.puzzle = saved.puzzle;
    state.solution = saved.solution;
    state.board = saved.board;
    state.notes = saved.notes;
    state.fixed = saved.puzzle.map(function (value) { return value !== 0; });
    state.selected = -1;
    state.notesMode = false;
    state.mistakes = saved.mistakes;
    state.hints = saved.hints;
    state.elapsed = saved.elapsed;
    state.runStart = null;
    state.timerStarted = saved.timerStarted;
    state.paused = false;
    state.solved = false;
    state.generating = false;
    state.history = [];
    state.lastChanged = -1;

    els.pauseCover.hidden = true;
    els.winCover.hidden = true;
    els.loadingCover.hidden = true;
    els.pauseBtn.classList.remove('is-paused');
    renderAll();

    if (state.timerStarted) startTimer();
  }

  function readSavedGame() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || data.version !== 1) return null;
      if (!Core.LEVELS[data.level]) return null;

      const puzzle = toIntArray(data.puzzle);
      const solution = toIntArray(data.solution);
      const board = toIntArray(data.board);
      const notes = toIntArray(data.notes);
      if (!puzzle || !solution || !board || !notes) return null;
      if (puzzle.length !== 81 || solution.length !== 81 || board.length !== 81 || notes.length !== 81) return null;

      for (let i = 0; i < 81; i++) {
        if (puzzle[i] < 0 || puzzle[i] > 9) return null;
        if (solution[i] < 1 || solution[i] > 9) return null;
        if (board[i] < 0 || board[i] > 9) return null;
        if (notes[i] < 0 || notes[i] > 511) return null;
        if (puzzle[i] !== 0 && board[i] !== puzzle[i]) return null;
      }

      const completed = board.every(function (value, index) { return value === solution[index]; });
      if (completed) return null;

      return {
        level: data.level,
        puzzle: puzzle,
        solution: solution,
        board: board,
        notes: notes,
        mistakes: clampCount(data.mistakes),
        hints: clampCount(data.hints),
        elapsed: Number.isFinite(data.elapsed) && data.elapsed >= 0 ? data.elapsed : 0,
        timerStarted: Boolean(data.timerStarted)
      };
    } catch (error) {
      return null;
    }
  }

  function saveGame() {
    if (state.generating || state.solved) return;
    if (!state.puzzle.some(function (value) { return value !== 0; })) return;

    const data = {
      version: 1,
      level: state.level,
      puzzle: state.puzzle,
      solution: state.solution,
      board: state.board,
      notes: state.notes,
      mistakes: state.mistakes,
      hints: state.hints,
      elapsed: Math.round(currentElapsed()),
      timerStarted: state.timerStarted,
      savedAt: Date.now()
    };

    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (error) {
      /* Storage may be unavailable in private browsing; the game still works. */
    }
  }

  /* =========================================================
     Selection and input
     ========================================================= */

  function selectCell(index, options) {
    if (state.generating || state.paused || state.solved) return;
    const opts = options || {};
    if (state.selected !== index) {
      state.selected = index;
      startTimer();
      renderBoard();
    }
    if (opts.focus) {
      focusCell(index);
    }
  }

  function focusCell(index) {
    const cell = cellEls[index];
    if (cell && document.activeElement !== cell) {
      cell.focus({ preventScroll: true });
    }
  }

  function inputNumber(number) {
    if (!canPlay()) return;

    if (state.selected < 0) {
      setStatus('先点一个格子，再输入数字。', 'accent');
      return;
    }

    const index = state.selected;
    if (state.fixed[index]) {
      setStatus('这是题目给出的数字，不能修改。', 'accent');
      return;
    }

    startTimer();

    if (state.notesMode) {
      if (state.board[index] !== 0) {
        setStatus('先擦掉数字，才能在这一格记笔记。', 'accent');
        return;
      }

      const bit = 1 << number;
      pushHistory();
      state.notes[index] ^= bit;
      state.lastChanged = index;
      renderAll();
      saveGame();
      return;
    }

    if (state.board[index] === number) return;

    pushHistory();
    state.board[index] = number;
    state.notes[index] = 0;
    state.lastChanged = index;
    markJustSet(index);

    if (state.board[index] !== state.solution[index]) {
      state.mistakes += 1;
      setStatus('这个数字不对，再检查一下。', 'error');
    } else {
      removePeerNotes(index, number);
      setStatus('很好，继续。', 'accent');
    }

    renderAll();
    saveGame();

    if (isSolved()) {
      finishGame();
    }
  }

  function eraseCell() {
    if (!canPlay()) return;
    if (state.selected < 0) {
      setStatus('先选中一个格子。', 'accent');
      return;
    }
    const index = state.selected;
    if (state.fixed[index]) {
      setStatus('题目数字不需要擦除。', 'accent');
      return;
    }
    if (state.board[index] === 0 && state.notes[index] === 0) {
      setStatus('这一格已经是空的。', 'accent');
      return;
    }

    pushHistory();
    state.board[index] = 0;
    state.notes[index] = 0;
    state.lastChanged = -1;
    renderAll();
    saveGame();
    setStatus('已擦除。');
  }

  function toggleNotesMode() {
    if (!canPlay()) return;
    state.notesMode = !state.notesMode;
    renderMode();
    renderNumpad();
    renderControls();
    setStatus(
      state.notesMode ? '笔记模式已开启，数字键会记录候选数。' : '回到填入模式。',
      'accent'
    );
  }

  function useHint() {
    if (!canPlay()) return;
    startTimer();

    let index = state.selected;
    const selectionNeedsHelp = index >= 0
      && !state.fixed[index]
      && state.board[index] !== state.solution[index];

    if (!selectionNeedsHelp) {
      const candidates = [];
      for (let i = 0; i < 81; i++) {
        if (!state.fixed[i] && state.board[i] !== state.solution[i]) candidates.push(i);
      }
      if (candidates.length === 0) {
        setStatus('这一局已经完成了。', 'accent');
        return;
      }
      index = candidates[Math.floor(Math.random() * candidates.length)];
    }

    pushHistory();
    const answer = state.solution[index];
    state.board[index] = answer;
    state.notes[index] = 0;
    state.hints += 1;
    state.selected = index;
    state.lastChanged = index;
    removePeerNotes(index, answer);
    markJustSet(index);

    const row = Math.floor(index / 9) + 1;
    const col = (index % 9) + 1;
    renderAll();
    saveGame();
    setStatus('提示：第 ' + row + ' 行第 ' + col + ' 列是 ' + answer + '。', 'accent');

    if (isSolved()) finishGame();
  }

  function undo() {
    if (!canPlay()) return;
    if (state.history.length === 0) {
      setStatus('还没有可以撤销的步骤。', 'accent');
      return;
    }

    const snapshot = state.history.pop();
    state.board = snapshot.board.slice();
    state.notes = snapshot.notes.slice();
    state.mistakes = snapshot.mistakes;
    state.hints = snapshot.hints;
    state.selected = snapshot.selected;
    state.lastChanged = -1;
    renderAll();
    saveGame();
    setStatus('已撤销上一步。');
    updateUndoButton();
  }

  function pushHistory() {
    state.history.push({
      board: state.board.slice(),
      notes: state.notes.slice(),
      mistakes: state.mistakes,
      hints: state.hints,
      selected: state.selected
    });
    if (state.history.length > MAX_HISTORY) state.history.shift();
  }

  function removePeerNotes(index, number) {
    const bit = 1 << number;
    const row = Math.floor(index / 9);
    const col = index % 9;
    const boxRow = Math.floor(row / 3) * 3;
    const boxCol = Math.floor(col / 3) * 3;

    for (let c = 0; c < 9; c++) {
      state.notes[row * 9 + c] &= ~bit;
    }
    for (let r = 0; r < 9; r++) {
      state.notes[r * 9 + col] &= ~bit;
    }
    for (let r = boxRow; r < boxRow + 3; r++) {
      for (let c = boxCol; c < boxCol + 3; c++) {
        state.notes[r * 9 + c] &= ~bit;
      }
    }
  }

  function canPlay() {
    if (state.generating) return false;
    if (state.solved) return false;
    if (state.paused) {
      setStatus('游戏已暂停，继续后再操作。', 'accent');
      return false;
    }
    return true;
  }

  function isSolved() {
    for (let i = 0; i < 81; i++) {
      if (state.board[i] !== state.solution[i]) return false;
    }
    return true;
  }

  /* =========================================================
     Pause and finish
     ========================================================= */

  function togglePause() {
    if (state.generating || state.solved) return;
    if (state.paused) resumeGame();
    else pauseGame(false);
  }

  function pauseGame(auto) {
    if (state.generating || state.solved || state.paused) return;
    state.paused = true;
    pauseTimer();
    els.pauseCover.hidden = false;
    els.pauseBtn.classList.add('is-paused');
    els.pauseBtn.setAttribute('aria-label', '继续游戏');
    renderControls();
    renderBoard();
    saveGame();
    if (!auto) setStatus('已暂停，计时也停下了。');
  }

  function resumeGame() {
    if (!state.paused) return;
    state.paused = false;
    els.pauseCover.hidden = true;
    els.pauseBtn.classList.remove('is-paused');
    els.pauseBtn.setAttribute('aria-label', '暂停游戏');
    if (state.timerStarted && !state.solved) startTimer();
    renderBoard();
    renderControls();
    saveGame();
    setStatus('继续吧。');
    if (state.selected >= 0) focusCell(state.selected);
  }

  function finishGame() {
    if (state.solved) return;
    state.solved = true;
    state.paused = false;
    els.pauseCover.hidden = true;
    pauseTimer();
    stopTicker();

    const elapsed = Math.round(state.elapsed);
    const previousBest = stats.best[state.level];
    const isRecord = !previousBest || elapsed < previousBest;
    if (isRecord) stats.best[state.level] = elapsed;
    stats.completed += 1;
    saveStats();

    els.winTime.textContent = formatDuration(elapsed);
    els.winLevel.textContent = Core.level(state.level).name;
    els.winMistakes.textContent = String(state.mistakes);
    els.winHints.textContent = String(state.hints);

    if (isRecord) {
      if (!previousBest) els.winRecord.textContent = '新的个人纪录';
      else {
        const diff = Math.max(1, Math.round((previousBest - elapsed) / 1000));
        els.winRecord.textContent = '新纪录 · 快了 ' + diff + ' 秒';
      }
    } else {
      els.winRecord.textContent = '本局最佳 ' + formatDuration(previousBest);
    }

    buildConfetti();
    els.winCover.hidden = false;
    els.pauseBtn.disabled = true;
    renderAll();
    setStatus('完成了。慢慢来，也很好。', 'accent', false);

    try {
      localStorage.removeItem(SAVE_KEY);
    } catch (error) {
      /* Ignore unavailable storage. */
    }

    window.setTimeout(function () {
      els.againBtn.focus({ preventScroll: true });
    }, 120);
  }

  function buildConfetti() {
    const colors = ['#2d6f9e', '#7db7dc', '#b9503f', '#6f9cbc', '#d5e9f6', '#ffffff'];
    const fragment = document.createDocumentFragment();
    els.confetti.textContent = '';

    for (let i = 0; i < 28; i++) {
      const piece = document.createElement('span');
      piece.className = 'confetti-piece';
      piece.style.left = (4 + Math.random() * 92) + '%';
      piece.style.background = colors[i % colors.length];
      piece.style.setProperty('--drift', (Math.random() * 150 - 75).toFixed(0) + 'px');
      piece.style.setProperty('--fall', (300 + Math.random() * 330).toFixed(0) + 'px');
      piece.style.setProperty('--rotate', (Math.random() * 560 - 280).toFixed(0) + 'deg');
      piece.style.setProperty('--duration', (1.6 + Math.random() * 1.5).toFixed(2) + 's');
      piece.style.setProperty('--delay', (Math.random() * 0.45).toFixed(2) + 's');
      fragment.appendChild(piece);
    }
    els.confetti.appendChild(fragment);
  }

  /* =========================================================
     Timer
     ========================================================= */

  function currentElapsed() {
    return state.elapsed + (state.runStart === null ? 0 : Date.now() - state.runStart);
  }

  function startTimer() {
    if (state.generating || state.paused || state.solved || state.runStart !== null) return;
    state.timerStarted = true;
    state.runStart = Date.now();
    ensureTicker();
    renderTimer();
  }

  function pauseTimer() {
    if (state.runStart !== null) {
      state.elapsed += Date.now() - state.runStart;
      state.runStart = null;
    }
    stopTicker();
    renderTimer();
  }

  function ensureTicker() {
    if (tickTimer !== null) return;
    tickTimer = window.setInterval(renderTimer, 250);
  }

  function stopTicker() {
    if (tickTimer === null) return;
    window.clearInterval(tickTimer);
    tickTimer = null;
  }

  function renderTimer() {
    els.timer.textContent = formatDuration(currentElapsed());
  }

  function formatDuration(milliseconds) {
    const totalSeconds = Math.max(0, Math.floor((milliseconds || 0) / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
      return String(hours) + ':' + pad2(minutes) + ':' + pad2(seconds);
    }
    return pad2(minutes) + ':' + pad2(seconds);
  }

  function pad2(value) {
    return String(value).padStart(2, '0');
  }

  /* =========================================================
     Rendering
     ========================================================= */

  function renderAll() {
    renderMeta();
    renderBoard();
    renderNumpad();
    renderProgress();
    renderMode();
    renderStats();
    renderTimer();
    updateUndoButton();
    renderControls();
  }

  function renderMeta() {
    const info = Core.level(state.level);
    const clues = state.puzzle.filter(function (value) { return value !== 0; }).length;
    els.levelName.textContent = info.name;
    els.topLevel.textContent = info.name;
    els.levelChip.title = info.name + ' · ' + clues + ' 个提示数';
    els.mistakeCount.textContent = String(state.mistakes);
    els.hintCount.textContent = String(state.hints);
    els.pauseBtn.classList.toggle('is-paused', state.paused);
    els.pauseBtn.setAttribute('aria-label', state.paused ? '继续游戏' : '暂停游戏');
    els.pauseBtn.disabled = state.solved || state.generating;
  }

  function renderBoard() {
    const selectedValue = state.selected >= 0 ? state.board[state.selected] : 0;
    const selectedRow = state.selected >= 0 ? Math.floor(state.selected / 9) : -1;
    const selectedCol = state.selected >= 0 ? state.selected % 9 : -1;

    for (let i = 0; i < 81; i++) {
      const cell = cellEls[i];
      const value = state.board[i];
      const notes = state.notes[i];
      const row = Math.floor(i / 9);
      const col = i % 9;
      const classes = [cellBaseClasses[i]];

      const isSelected = i === state.selected;
      const isPeer = state.selected >= 0 && !isSelected && (
        row === selectedRow
        || col === selectedCol
        || (Math.floor(row / 3) === Math.floor(selectedRow / 3)
          && Math.floor(col / 3) === Math.floor(selectedCol / 3))
      );
      const isSame = selectedValue !== 0 && value === selectedValue && !isSelected;
      const isWrong = value !== 0 && value !== state.solution[i] && !state.fixed[i];

      if (isPeer) classes.push('is-peer');
      if (isSame) classes.push('is-same');
      if (isWrong) classes.push('is-wrong');
      if (isSelected) classes.push('is-selected');
      if (state.fixed[i]) classes.push('is-given');
      else if (value !== 0) classes.push('is-user');
      if (value !== 0) classes.push('has-value');
      if (state.lastChanged === i) classes.push('just-set');

      cell.className = classes.join(' ');
      cell.firstElementChild.textContent = value === 0 ? '' : String(value);

      const noteEls = cell.querySelectorAll('.cell-note');
      for (let n = 1; n <= 9; n++) {
        noteEls[n - 1].classList.toggle('on', value === 0 && (notes & (1 << n)) !== 0);
      }

      cell.tabIndex = isSelected || (state.selected < 0 && i === 0) ? 0 : -1;
      cell.setAttribute('aria-selected', isSelected ? 'true' : 'false');

      let description = value === 0 ? '空白' : (state.fixed[i] ? '题目数字 ' : '已填 ') + value;
      if (isWrong) description += '，错误';
      if (value === 0 && notes !== 0) {
        const noteValues = [];
        for (let n = 1; n <= 9; n++) if ((notes & (1 << n)) !== 0) noteValues.push(n);
        if (noteValues.length) description += '，笔记 ' + noteValues.join('、');
      }
      if (isSelected) description += '，当前选中';
      cell.setAttribute('aria-label', '第 ' + (row + 1) + ' 行第 ' + (col + 1) + ' 列，' + description);
    }

    if (justSetTimer !== null) window.clearTimeout(justSetTimer);
    justSetTimer = window.setTimeout(function () {
      if (state.lastChanged >= 0) {
        const cell = cellEls[state.lastChanged];
        if (cell) cell.classList.remove('just-set');
      }
      state.lastChanged = -1;
      justSetTimer = null;
    }, 300);
  }

  function markJustSet(index) {
    if (justSetTimer !== null) {
      window.clearTimeout(justSetTimer);
      justSetTimer = null;
    }
    state.lastChanged = index;
  }

  function renderNumpad() {
    const counts = new Array(10).fill(0);
    for (let i = 0; i < 81; i++) {
      const value = state.board[i];
      if (value !== 0 && value === state.solution[i]) counts[value] += 1;
    }

    for (let n = 1; n <= 9; n++) {
      const button = numEls[n - 1];
      const remaining = Math.max(0, 9 - counts[n]);
      const count = button.querySelector('.num-count');
      count.textContent = String(remaining);
      button.classList.toggle('is-done', remaining === 0);
      button.setAttribute(
        'aria-label',
        state.notesMode
          ? '在选中格记下数字 ' + n + ' 的笔记'
          : '填入数字 ' + n + '，还剩 ' + remaining + ' 个'
      );
      button.title = state.notesMode ? '记笔记 ' + n : '填入 ' + n + '（还剩 ' + remaining + ' 个）';
    }
  }

  function renderProgress() {
    let blanks = 0;
    let solvedBlanks = 0;
    for (let i = 0; i < 81; i++) {
      if (state.fixed[i]) continue;
      blanks += 1;
      if (state.board[i] !== 0 && state.board[i] === state.solution[i]) solvedBlanks += 1;
    }
    const percent = blanks === 0 ? 100 : Math.round((solvedBlanks / blanks) * 100);
    els.progressFill.style.width = percent + '%';
    els.progressText.textContent = percent + '%';
    els.progressTrack.setAttribute('aria-valuenow', String(percent));
  }

  function renderMode() {
    els.playPanel.classList.toggle('notes-mode', state.notesMode);
    els.notesBtn.classList.toggle('is-active', state.notesMode);
    els.notesBtn.setAttribute('aria-pressed', state.notesMode ? 'true' : 'false');
    els.modeText.textContent = state.notesMode ? '笔记模式' : '填入模式';
    els.modeTip.textContent = state.notesMode ? '数字键切换候选数' : '先选格子，再点数字';
  }

  function renderControls() {
    const locked = state.paused || state.solved || state.generating;
    els.eraseBtn.disabled = locked;
    els.notesBtn.disabled = locked;
    els.hintBtn.disabled = locked;
    for (let i = 0; i < numEls.length; i++) {
      const finished = !state.notesMode && numEls[i].classList.contains('is-done');
      numEls[i].disabled = locked || finished;
    }
    updateUndoButton();
  }

  function updateUndoButton() {
    els.undoBtn.disabled = state.history.length === 0
      || state.paused
      || state.solved
      || state.generating;
  }

  function renderStats() {
    const best = stats.best[state.level];
    els.bestTime.textContent = best ? formatDuration(best) : '—';
    els.completedCount.textContent = String(stats.completed);

    const rows = els.bestList.querySelectorAll('[data-best-row]');
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const level = row.dataset.bestRow;
      const value = stats.best[level];
      const valueEl = row.querySelector('[data-best]');
      if (valueEl) valueEl.textContent = value ? formatDuration(value) : '—';
      row.classList.toggle('is-current', level === state.level);
    }

    updateDialogCurrent();
  }

  function updateDialogCurrent() {
    const options = els.levelGrid.querySelectorAll('.level-option');
    for (let i = 0; i < options.length; i++) {
      const option = options[i];
      const current = option.dataset.level === state.level;
      option.classList.toggle('is-current', current);
      if (current) option.setAttribute('aria-current', 'true');
      else option.removeAttribute('aria-current');
    }
  }

  function setStatus(text, tone, autoReset) {
    if (statusTimer !== null) {
      window.clearTimeout(statusTimer);
      statusTimer = null;
    }
    els.statusLine.textContent = text;
    els.statusLine.className = 'status-line' + (tone ? ' is-' + tone : '');
    if (autoReset !== false && !state.solved) {
      statusTimer = window.setTimeout(function () {
        if (state.solved) return;
        els.statusLine.textContent = DEFAULT_STATUS;
        els.statusLine.className = 'status-line';
        statusTimer = null;
      }, 5200);
    }
  }

  function showToast(message) {
    if (toastTimer !== null) window.clearTimeout(toastTimer);
    els.toast.textContent = message;
    els.toast.hidden = false;
    toastTimer = window.setTimeout(function () {
      els.toast.hidden = true;
      toastTimer = null;
    }, 2100);
  }

  /* =========================================================
     Dialog and theme
     ========================================================= */

  function openNewGameDialog() {
    if (state.generating) return;
    if (!state.paused && !state.solved && state.runStart !== null) {
      pauseTimer();
      dialogPausedTimer = true;
    }
    updateDialogCurrent();
    if (typeof els.newGameDialog.showModal === 'function') {
      if (!els.newGameDialog.open) els.newGameDialog.showModal();
    } else {
      els.newGameDialog.setAttribute('open', '');
    }
    document.body.classList.add('modal-open');
  }

  function closeNewGameDialog() {
    if (typeof els.newGameDialog.close === 'function' && els.newGameDialog.open) {
      els.newGameDialog.close();
    } else {
      els.newGameDialog.removeAttribute('open');
    }
    document.body.classList.remove('modal-open');
    if (dialogPausedTimer) {
      dialogPausedTimer = false;
      if (!state.paused && !state.solved && !state.generating) startTimer();
    }
  }

  function applyTheme(theme, persist) {
    const next = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    if (els.themeColor) {
      els.themeColor.setAttribute('content', next === 'dark' ? '#0b1620' : '#f2f7fb');
    }
    els.themeToggle.setAttribute('aria-label', next === 'dark' ? '切换到浅色模式' : '切换到深色模式');
    els.themeToggle.setAttribute('title', next === 'dark' ? '切换到浅色模式' : '切换到深色模式');
    if (persist) {
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch (error) {
        /* Ignore unavailable storage. */
      }
    }
  }

  /* =========================================================
     Install to home screen and offline shell
     ========================================================= */

  function initInstallExperience() {
    if (!IS_INSTALLABLE_CONTEXT || !window.isSecureContext) return;

    els.iosSteps.hidden = !IS_IOS;
    els.genericSteps.hidden = IS_IOS;

    if (IS_STANDALONE) return;

    if (shouldShowInstallHint()) showInstallStrip();

    window.addEventListener('beforeinstallprompt', function (event) {
      event.preventDefault();
      deferredInstallPrompt = event;
      if (shouldShowInstallHint()) showInstallStrip();
    });

    window.addEventListener('appinstalled', function () {
      deferredInstallPrompt = null;
      hideInstallStrip();
      showToast('已添加到主屏幕');
    });

    const standaloneQuery = window.matchMedia('(display-mode: standalone)');
    if (typeof standaloneQuery.addEventListener === 'function') {
      standaloneQuery.addEventListener('change', function (event) {
        if (event.matches) hideInstallStrip();
      });
    }
  }

  function shouldShowInstallHint() {
    try {
      const dismissedAt = Number(localStorage.getItem(INSTALL_HINT_KEY) || 0);
      if (!dismissedAt) return true;
      return Date.now() - dismissedAt > 1000 * 60 * 60 * 24 * 14;
    } catch (error) {
      return true;
    }
  }

  function showInstallStrip() {
    if (IS_STANDALONE || !IS_INSTALLABLE_CONTEXT || !window.isSecureContext) return;
    els.installStrip.hidden = false;
  }

  function hideInstallStrip() {
    els.installStrip.hidden = true;
  }

  function dismissInstallHint() {
    try {
      localStorage.setItem(INSTALL_HINT_KEY, String(Date.now()));
    } catch (error) {
      /* Ignore unavailable storage. */
    }
    deferredInstallPrompt = null;
    hideInstallStrip();
  }

  async function startInstall() {
    if (deferredInstallPrompt) {
      const prompt = deferredInstallPrompt;
      deferredInstallPrompt = null;
      try {
        prompt.prompt();
        const choice = await prompt.userChoice;
        if (choice && choice.outcome === 'accepted') hideInstallStrip();
        else dismissInstallHint();
      } catch (error) {
        openInstallDialog();
      }
      return;
    }
    openInstallDialog();
  }

  function openInstallDialog() {
    els.iosSteps.hidden = !IS_IOS;
    els.genericSteps.hidden = IS_IOS;
    if (els.newGameDialog.open) closeNewGameDialog();
    if (typeof els.installDialog.showModal === 'function') {
      if (!els.installDialog.open) els.installDialog.showModal();
    } else {
      els.installDialog.setAttribute('open', '');
    }
    document.body.classList.add('modal-open');
  }

  function closeInstallDialog() {
    if (typeof els.installDialog.close === 'function' && els.installDialog.open) {
      els.installDialog.close();
    } else {
      els.installDialog.removeAttribute('open');
    }
    document.body.classList.remove('modal-open');
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || !IS_INSTALLABLE_CONTEXT) return;
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js').catch(function (error) {
        console.warn('Service worker registration failed:', error);
      });
    });
  }

  /* =========================================================
     Keyboard
     ========================================================= */

  function handleKeydown(event) {
    if (event.isComposing) return;
    if (els.newGameDialog.open) return;

    const target = event.target;
    const tagName = target && target.tagName ? target.tagName : '';
    if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT' || (target && target.isContentEditable)) {
      return;
    }

    const key = event.key;
    const lower = key.toLowerCase();

    if ((event.metaKey || event.ctrlKey) && lower === 'z') {
      event.preventDefault();
      undo();
      return;
    }

    if (event.metaKey || event.ctrlKey || event.altKey) return;

    if (key >= '1' && key <= '9') {
      event.preventDefault();
      inputNumber(Number(key));
      return;
    }

    if (key === 'Backspace' || key === 'Delete') {
      event.preventDefault();
      eraseCell();
      return;
    }

    if (lower === 'n') {
      event.preventDefault();
      toggleNotesMode();
      return;
    }

    if (lower === 'h') {
      event.preventDefault();
      useHint();
      return;
    }

    if (lower === 'z') {
      event.preventDefault();
      undo();
      return;
    }

    if (key === ' ') {
      const interactive = target && target.closest && target.closest('button:not(.cell), a, input, select, textarea');
      if (interactive) return;
      event.preventDefault();
      togglePause();
      return;
    }

    if (key === 'Escape') {
      if (state.paused) {
        event.preventDefault();
        resumeGame();
      } else if (state.selected >= 0) {
        event.preventDefault();
        state.selected = -1;
        renderBoard();
      }
      return;
    }

    if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight') {
      const interactive = target && target.closest && target.closest('button:not(.cell), a, input, select, textarea');
      if (interactive) return;
      event.preventDefault();
      moveSelection(
        key === 'ArrowUp' ? -1 : key === 'ArrowDown' ? 1 : 0,
        key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : 0
      );
    }
  }

  function moveSelection(rowDelta, colDelta) {
    if (state.generating || state.paused || state.solved) return;
    if (state.selected < 0) {
      selectCell(0, { focus: true });
      return;
    }
    const row = Math.floor(state.selected / 9);
    const col = state.selected % 9;
    const nextRow = Math.max(0, Math.min(8, row + rowDelta));
    const nextCol = Math.max(0, Math.min(8, col + colDelta));
    const next = nextRow * 9 + nextCol;
    if (next === state.selected) return;
    selectCell(next, { focus: true });
  }

  /* =========================================================
     Helpers and storage
     ========================================================= */

  function toIntArray(value) {
    if (!Array.isArray(value) || value.length !== 81) return null;
    const array = new Array(81);
    for (let i = 0; i < 81; i++) {
      if (typeof value[i] !== 'number' || !Number.isFinite(value[i])) return null;
      array[i] = Math.trunc(value[i]);
    }
    return array;
  }

  function clampCount(value) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0;
    return Math.min(9999, Math.trunc(value));
  }

  function defaultStats() {
    return {
      completed: 0,
      best: { easy: null, medium: null, hard: null, expert: null }
    };
  }

  function loadStats() {
    const fallback = defaultStats();
    try {
      const raw = localStorage.getItem(STATS_KEY);
      if (!raw) return fallback;
      const data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return fallback;

      const result = defaultStats();
      result.completed = clampCount(data.completed);
      for (let i = 0; i < Core.LEVEL_ORDER.length; i++) {
        const level = Core.LEVEL_ORDER[i];
        const value = data.best && data.best[level];
        if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
          result.best[level] = value;
        }
      }
      return result;
    } catch (error) {
      return fallback;
    }
  }

  function saveStats() {
    try {
      localStorage.setItem(STATS_KEY, JSON.stringify(stats));
    } catch (error) {
      /* Ignore unavailable storage. */
    }
  }
})();
