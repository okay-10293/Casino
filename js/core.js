/* 공용: 지갑, 난수, 카드, 베팅바, 탭 */
(function () {
  'use strict';
  var KEY = 'okay-casino-v1';
  var START = 10000;
  var S = { id: '', name: '플레이어', money: START, table: 0, peak: START };
  try {
    var saved = JSON.parse(localStorage.getItem(KEY));
    if (saved && typeof saved.id === 'string' && /^[0-9a-f-]{36}$/.test(saved.id)) S.id = saved.id;
    if (saved && typeof saved.money === 'number') {
      S.name = typeof saved.name === 'string' ? saved.name.slice(0, 10) : S.name;
      S.money = Math.max(0, Math.floor(saved.money));
      S.table = Math.max(0, Math.floor(saved.table || 0));
      S.peak = Math.max(S.money, saved.peak || 0);
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
    var min = opts.min || 100;
    var value = 0;
    var chips = [100, 500, 1000, 5000, 10000];
    el.className = 'betbar';
    el.innerHTML =
      '<div class="bet-line"><span>베팅</span><b data-v>0</b></div>' +
      '<div class="chips">' + chips.map(function (v) {
        return '<button type="button" class="chip c' + v + '" data-add="' + v + '">' + fmtShort(v) + '</button>';
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

  /* ---------- 토스트 ---------- */
  var toastTimer;
  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }

  /* ---------- 시작/탭 ---------- */
  var games = ['blackjack', 'holdem', 'roulette', 'slots', 'online', 'ranking'];
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
      S.money = START; S.table = 0; emit();
      document.dispatchEvent(new CustomEvent('casino:reset'));
      toast('게임머니 ' + fmt(START) + '으로 리셋');
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
    money: function () { return S.money; },
    add: function (n) {
      S.money = Math.max(0, S.money + Math.floor(n));
      if (S.money > S.peak) S.peak = S.money;
      emit();
    },
    setTable: function (n) { S.table = Math.max(0, Math.floor(n)); save(); },
    playerName: function () { return S.name; },
    playerId: function () { return S.id; },
    onChange: function (f) { listeners.push(f); },
    rand: rand, sleep: sleep, fmt: fmt, fmtShort: fmtShort, toast: toast,
    betBar: betBar,
    holdemHelp: function () {
      var d = document.createElement('details'); d.className = 'help';
      d.innerHTML = '<summary>홀덤이 처음이면</summary><ul>' +
        '<li>내 카드 2장 + 가운데 공용 카드 5장 중 <b>제일 센 5장 조합</b>으로 겨뤄.</li>' +
        '<li>순서: 처음 2장 → 플랍(3장) → 턴(1장) → 리버(1장). 카드가 깔릴 때마다 베팅해.</li>' +
        '<li><b>포기(폴드)</b>: 이번 판을 포기해. 낸 칩은 돌려받지 못해.</li>' +
        '<li><b>넘기기(체크)</b>: 올리는 사람이 없을 때 칩 안 내고 넘겨.</li>' +
        '<li><b>맞추기(콜)</b>: 상대가 건 만큼 나도 내.</li>' +
        '<li><b>올리기(레이즈)</b>: 판돈을 더 키워. 올인은 가진 칩 전부.</li>' +
        '<li>족보(약→강): 하이카드 &lt; 원페어 &lt; 투페어 &lt; 트리플 &lt; 스트레이트 &lt; 플러시 &lt; 풀하우스 &lt; 포카드 &lt; 스트레이트 플러시</li></ul>';
      return d;
    },
    Cards: { shuffled: shuffled, el: cardEl, rankLabel: rankLabel, SUITS: SUITS }
  };
})();
