/* 공용: 지갑, 난수, 카드, 베팅바, 탭 */
(function () {
  'use strict';
  var KEY = 'okay-casino-v1';
  var SCALE = 100;            // 모든 금액 100배 (v2)
  var START = 10000 * SCALE;  // 리셋 금액 100만
  var S = { v: 2, id: '', name: '플레이어', money: START, table: 0, peak: START, skip: false };
  try {
    var saved = JSON.parse(localStorage.getItem(KEY));
    if (saved && typeof saved.id === 'string' && /^[0-9a-f-]{36}$/.test(saved.id)) S.id = saved.id;
    if (saved && typeof saved.money === 'number') {
      S.name = typeof saved.name === 'string' ? saved.name.slice(0, 10) : S.name;
      S.money = Math.max(0, Math.floor(saved.money));
      S.table = Math.max(0, Math.floor(saved.table || 0));
      S.peak = Math.max(S.money, saved.peak || 0);
      S.skip = saved.skip === true;
      // 예전(100배 이전) 저장값이면 한 번만 100배로 올려준다
      if (saved.v !== 2) { S.money *= SCALE; S.table *= SCALE; S.peak *= SCALE; }
    }
  } catch (e) {}
  if (!S.id) S.id = (crypto.randomUUID ? crypto.randomUUID() : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, function (c) { return (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16); }));
  // 홀덤 테이블에서 탭을 닫았으면 테이블 칩을 지갑으로 돌려준다
  if (S.table > 0) { S.money += S.table; S.table = 0; }

  var listeners = [];
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
  function emit() { save(); listeners.forEach(function (f) { f(); }); }

  function rand(n) {
    var a = new Uint32Array(1);
    var lim = Math.floor(4294967296 / n) * n;
    do { crypto.getRandomValues(a); } while (a[0] >= lim);
    return a[0] % n;
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function fmt(n) { return Math.floor(n).toLocaleString('ko-KR'); }
  function fmtShort(n) {
    if (n >= 100000000) return (n / 100000000) + '억';
    if (n >= 10000) return (n / 10000) + '만';
    if (n >= 1000) return (n / 1000) + '천';
    return String(n);
  }

  /* ---------- 카드 ---------- */
  var SUITS = ['♠', '♥', '♦', '♣'];
  var LABEL = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
  function rankLabel(r) { return LABEL[r] || String(r); }
  function newDeck() {
    var d = [];
    for (var s = 0; s < 4; s++) for (var r = 2; r <= 14; r++) d.push({ r: r, s: s });
    return d;
  }
  function shuffled() {
    var d = newDeck();
    for (var i = d.length - 1; i > 0; i--) {
      var j = rand(i + 1), t = d[i]; d[i] = d[j]; d[j] = t;
    }
    return d;
  }
  function cardEl(card, hidden) {
    var el = document.createElement('div');
    if (hidden || !card) { el.className = 'card back'; return el; }
    el.className = 'card' + (card.s === 1 || card.s === 2 ? ' red' : '');
    var a = document.createElement('span'); a.className = 'cr'; a.textContent = rankLabel(card.r);
    var b = document.createElement('span'); b.className = 'cs'; b.textContent = SUITS[card.s];
    el.appendChild(a); el.appendChild(b);
    return el;
  }

  /* ---------- 베팅 바 ---------- */
  function betBar(el, opts) {
    opts = opts || {};
    var min = opts.min || 100 * SCALE;
    var value = 0;
    var chips = [100, 500, 1000, 5000, 10000].map(function (v) { return v * SCALE; });
    el.className = 'betbar';
    el.innerHTML =
      '<div class="bet-line"><span>베팅</span><b data-v>0</b></div>' +
      '<div class="chips">' + chips.map(function (v) {
        return '<button type="button" class="chip c' + (v / SCALE) + '" data-add="' + v + '">' + fmtShort(v) + '</button>';
      }).join('') + '</div>' +
      '<div class="bet-tools"><button type="button" data-act="half">절반</button>' +
      '<button type="button" data-act="max">올인</button>' +
      '<button type="button" data-act="clear">초기화</button></div>';
    var disp = el.querySelector('[data-v]');
    function set(v) {
      value = Math.max(0, Math.min(Math.floor(v), S.money));
      disp.textContent = fmt(value);
      if (opts.onChange) opts.onChange(value);
    }
    el.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b || b.disabled) return;
      if (b.dataset.add) set(value + Number(b.dataset.add));
      else if (b.dataset.act === 'half') set(Math.max(min, Math.floor(value / 2)));
      else if (b.dataset.act === 'max') set(S.money);
      else if (b.dataset.act === 'clear') set(0);
    });
    listeners.push(function () { if (value > S.money) set(S.money); });
    return {
      get value() { return value; },
      min: min,
      set: set,
      lock: function (on) {
        el.classList.toggle('locked', on);
        el.querySelectorAll('button').forEach(function (b) { b.disabled = on; });
      }
    };
  }

  /* ---------- 스핀 연출 건너뛰기 (슬롯/룰렛 공용, 저장됨) ---------- */
  function skipBox() {
    var label = document.createElement('label'); label.className = 'skip';
    var cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = S.skip;
    label.appendChild(cb); label.appendChild(document.createTextNode('스핀 연출 건너뛰기'));
    cb.addEventListener('change', function () { S.skip = cb.checked; emit(); });
    listeners.push(function () { cb.checked = S.skip; });
    return label;
  }

  /* ---------- 토스트 ---------- */
  var toastTimer;
  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  /* ---------- 바이인 (전 재산의 80%까지, 최소 빅블라인드 1개) ---------- */
  var MIN_BUYIN = 20 * SCALE;
  function maxBuyin() { return Math.floor(S.money * 0.8); }
  function buyinPicker(opt) {
    opt = opt || {};
    var wrap = document.createElement('div'); wrap.className = 'buyin-pick';
    var row = document.createElement('div'); row.className = 'buyin-row';
    var input = document.createElement('input');
    input.type = 'number'; input.inputMode = 'numeric'; input.min = MIN_BUYIN; input.step = 10 * SCALE;
    input.setAttribute('aria-label', '바이인 금액');
    var maxBtn = document.createElement('button'); maxBtn.type = 'button'; maxBtn.className = 'ghost'; maxBtn.textContent = '최대';
    var hint = document.createElement('small'); hint.className = 'rule';
    row.appendChild(input); row.appendChild(maxBtn);
    var go = null;
    if (opt.label) {
      go = document.createElement('button'); go.type = 'button'; go.className = 'primary'; go.textContent = opt.label;
      row.appendChild(go);
    }
    wrap.appendChild(row); wrap.appendChild(hint);
    var touched = false;
    function sync() {
      var mx = maxBuyin();
      input.max = mx;
      if (mx < MIN_BUYIN) hint.textContent = '바이인은 전 재산의 80%까지인데 최소 ' + MIN_BUYIN + '은 있어야 해. 노동 탭에서 벌거나 리셋해줘.';
      else hint.textContent = '최대 ' + fmt(mx) + ' (전 재산 ' + fmt(S.money) + '의 80%)';
      if (!touched) input.value = mx < MIN_BUYIN ? '' : Math.min(2000 * SCALE, mx);
      if (go) go.disabled = mx < MIN_BUYIN;
    }
    input.addEventListener('input', function () { touched = true; });
    maxBtn.addEventListener('click', function () { touched = true; input.value = maxBuyin(); });
    function read() {
      var v = Math.floor(Number(input.value)), mx = maxBuyin();
      if (!(v >= MIN_BUYIN)) { toast('바이인은 최소 ' + MIN_BUYIN + '부터야'); return 0; }
      if (v > mx) { toast('전 재산의 80%까지만 가져갈 수 있어 (최대 ' + fmt(mx) + ')'); return 0; }
      return v;
    }
    if (go) go.addEventListener('click', function () { var v = read(); if (v && opt.onPick) opt.onPick(v); });
    listeners.push(sync); sync();
    return { el: wrap, read: read };
  }

  /* ---------- 족보 표 ---------- */
  var RANKS = [
    ['로열 플러시', '같은 무늬 10-J-Q-K-A', [[10, 0], [11, 0], [12, 0], [13, 0], [14, 0]]],
    ['스트레이트 플러시', '같은 무늬 5장 연속', [[5, 1], [6, 1], [7, 1], [8, 1], [9, 1]]],
    ['포카드', '같은 숫자 4장', [[13, 0], [13, 1], [13, 2], [13, 3], [3, 2]]],
    ['풀하우스', '트리플 + 원페어', [[12, 0], [12, 1], [12, 2], [8, 3], [8, 1]]],
    ['플러시', '같은 무늬 5장 (숫자는 아무거나)', [[14, 1], [11, 1], [9, 1], [6, 1], [3, 1]]],
    ['스트레이트', '무늬 상관없이 5장 연속 (A-2-3-4-5도 가능)', [[5, 0], [6, 1], [7, 2], [8, 3], [9, 0]]],
    ['트리플', '같은 숫자 3장', [[7, 0], [7, 1], [7, 3], [13, 2], [2, 1]]],
    ['투페어', '페어가 두 개', [[11, 0], [11, 2], [4, 1], [4, 3], [14, 0]]],
    ['원페어', '같은 숫자 2장', [[10, 0], [10, 3], [14, 2], [8, 1], [3, 0]]],
    ['하이카드', '아무 조합도 없을 때. 제일 높은 카드로 겨뤄', [[14, 0], [12, 1], [9, 3], [6, 2], [2, 0]]]
  ];
  function handTable() {
    var d = document.createElement('details'); d.className = 'help rank-help'; d.open = true;
    var sm = document.createElement('summary'); sm.textContent = '족보 (센 순서)'; d.appendChild(sm);
    var t = document.createElement('table'); t.className = 'rank-table';
    var tb = document.createElement('tbody');
    RANKS.forEach(function (r, i) {
      var tr = document.createElement('tr');
      var a = document.createElement('td'); a.className = 'rk'; a.textContent = i + 1;
      var b = document.createElement('td'); b.className = 'rn';
      var nm = document.createElement('b'); nm.textContent = r[0];
      var ds = document.createElement('small'); ds.textContent = r[1];
      b.appendChild(nm); b.appendChild(ds);
      var c = document.createElement('td');
      var h = document.createElement('div'); h.className = 'hand small';
      r[2].forEach(function (x) { h.appendChild(cardEl({ r: x[0], s: x[1] })); });
      c.appendChild(h);
      tr.appendChild(a); tr.appendChild(b); tr.appendChild(c); tb.appendChild(tr);
    });
    t.appendChild(tb); d.appendChild(t);
    var p = document.createElement('p'); p.className = 'rule';
    p.textContent = '내 카드 2장 + 공용 카드 5장, 모두 7장 중 가장 센 5장으로 겨뤄. 같은 족보면 숫자가 높은 쪽이 이겨.';
    d.appendChild(p);
    return d;
  }

  // 내 카드 + 공용 카드로 지금 만들어진 족보 이름 (카드가 2장이면 페어 여부만)
  function handName(cards) {
    var P = window.Poker;
    if (!P || !cards || cards.length < 2) return '';
    if (cards.length < 5) return cards[0].r === cards[1].r ? '원페어' : '하이카드';
    return P.name(P.best(cards));
  }
  // 족보 표에서 지금 내 족보 줄을 강조
  function markRank(name) {
    document.querySelectorAll('.rank-table tr').forEach(function (tr) {
      var b = tr.querySelector('.rn b');
      tr.classList.toggle('cur', !!name && !!b && b.textContent === name);
    });
  }

  /* ---------- 리셋 (리셋 버튼 두 번 / 슬롯에서 엔터 두 번) ---------- */
  function reset() {
    S.money = START; S.table = 0; emit();
    document.dispatchEvent(new CustomEvent('casino:reset'));
    toast('게임머니 ' + fmt(START) + '으로 리셋');
  }

  /* ---------- 시작/탭 ---------- */
  var games = ['blackjack', 'holdem', 'roulette', 'slots', 'online', 'work', 'ranking'];
  function show(tab) {
    if (games.indexOf(tab) < 0) tab = 'blackjack';
    games.forEach(function (g) { document.getElementById('g-' + g).hidden = g !== tab; });
    document.querySelectorAll('#tabs button').forEach(function (b) {
      b.classList.toggle('on', b.dataset.tab === tab);
    });
    if (location.hash !== '#' + tab) history.replaceState(null, '', '#' + tab);
    document.dispatchEvent(new CustomEvent('casino:tab', { detail: tab }));
  }

  function start() {
    var nameEl = document.getElementById('player-name');
    var balEl = document.getElementById('balance');
    var resetBtn = document.getElementById('reset-btn');
    nameEl.value = S.name;
    nameEl.addEventListener('change', function () {
      S.name = (nameEl.value.trim() || '플레이어').slice(0, 10);
      nameEl.value = S.name; emit();
    });
    var armed = false, armTimer;
    resetBtn.addEventListener('click', function () {
      if (!armed) {
        armed = true; resetBtn.textContent = '한 번 더';
        armTimer = setTimeout(function () { armed = false; resetBtn.textContent = '리셋'; }, 2500);
        return;
      }
      clearTimeout(armTimer); armed = false; resetBtn.textContent = '리셋';
      reset();
    });
    listeners.push(function () { balEl.textContent = fmt(S.money); });
    document.getElementById('tabs').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (b) show(b.dataset.tab);
    });
    window.addEventListener('hashchange', function () { show(location.hash.slice(1)); });
    document.dispatchEvent(new CustomEvent('casino:init'));
    emit();
    show(location.hash.slice(1) || 'blackjack');
  }

  window.Casino = {
    start: start,
    reset: reset,
    scale: SCALE,
    money: function () { return S.money; },
    add: function (n) {
      S.money = Math.max(0, S.money + Math.floor(n));
      if (S.money > S.peak) S.peak = S.money;
      emit();
    },
    setTable: function (n) { S.table = Math.max(0, Math.floor(n)); save(); },
    maxBuyin: maxBuyin, minBuyin: function () { return MIN_BUYIN; }, buyinPicker: buyinPicker, handTable: handTable, handName: handName, markRank: markRank,
    playerName: function () { return S.name; },
    playerId: function () { return S.id; },
    onChange: function (f) { listeners.push(f); },
    rand: rand, sleep: sleep, fmt: fmt, fmtShort: fmtShort, toast: toast,
    betBar: betBar, skipBox: skipBox, skipMotion: function () { return S.skip; },
    holdemHelp: function () {
      var d = document.createElement('details'); d.className = 'help';
      d.innerHTML = '<summary>홀덤이 처음이면</summary><ul>' +
        '<li>내 카드 2장 + 가운데 공용 카드 5장 중 <b>제일 센 5장 조합</b>으로 겨뤄.</li>' +
        '<li>순서: 처음 2장 → 플랍(3장) → 턴(1장) → 리버(1장). 카드가 깔릴 때마다 베팅해.</li>' +
        '<li><b>포기(폴드)</b>: 이번 판을 포기해. 낸 칩은 돌려받지 못해.</li>' +
        '<li><b>넘기기(체크)</b>: 올리는 사람이 없을 때 칩 안 내고 넘겨.</li>' +
        '<li><b>맞추기(콜)</b>: 상대가 건 만큼 나도 내.</li>' +
        '<li><b>올리기(레이즈)</b>: 판돈을 더 키워. 올인은 가진 칩 전부.</li>' +
        '<li>족보 표는 게임 화면 아래에 있어.</li></ul>';
      return d;
    },
    Cards: { shuffled: shuffled, el: cardEl, rankLabel: rankLabel, SUITS: SUITS }
  };
})();
