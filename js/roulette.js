/* 유러피안 룰렛 (0 하나). 스트레이트 35:1, 더즌 2:1, 나머지 1:1 */
(function () {
  'use strict';
  var C = Casino;
  var root = document.getElementById('g-roulette');
  var RED = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
  var OUTSIDE = [
    ['red', '빨강', 2], ['black', '검정', 2], ['odd', '홀', 2], ['even', '짝', 2],
    ['low', '1–18', 2], ['high', '19–36', 2], ['d1', '1–12', 3], ['d2', '13–24', 3], ['d3', '25–36', 3]
  ];
  var MULT = { red: 2, black: 2, odd: 2, even: 2, low: 2, high: 2, d1: 3, d2: 3, d3: 3 };
  var CHIPS = [100, 500, 1000, 5000];

  function colorOf(n) { return n === 0 ? 'green' : (RED.indexOf(n) >= 0 ? 'red' : 'black'); }
  function wins(key, n) {
    if (key.charAt(0) === 'n') return Number(key.slice(1)) === n;
    if (n === 0) return false;
    switch (key) {
      case 'red': return RED.indexOf(n) >= 0;
      case 'black': return RED.indexOf(n) < 0;
      case 'odd': return n % 2 === 1;
      case 'even': return n % 2 === 0;
      case 'low': return n <= 18;
      case 'high': return n >= 19;
      case 'd1': return n <= 12;
      case 'd2': return n > 12 && n <= 24;
      case 'd3': return n > 24;
    }
    return false;
  }

  var nums = '<button type="button" class="spot zero green" data-key="n0">0<i class="stake"></i></button>';
  for (var row = 1; row <= 12; row++) {
    for (var k = 0; k < 3; k++) {
      var n = row * 3 - 2 + k;
      nums += '<button type="button" class="spot ' + colorOf(n) + '" data-key="n' + n + '">' + n + '<i class="stake"></i></button>';
    }
  }
  var outs = OUTSIDE.map(function (o) {
    return '<button type="button" class="spot out" data-key="' + o[0] + '"><span>' + o[1] + '</span><small>x' + o[2] + '</small><i class="stake"></i></button>';
  }).join('');

  root.innerHTML =
    '<div class="felt roulette-felt">' +
    '<div class="wheel"><div class="ball" data-ball>–</div></div>' +
    '<div class="msg" data-msg>칩을 고르고 숫자나 구역을 눌러 베팅해줘</div>' +
    '<div class="history" data-history></div>' +
    '</div>' +
    '<div class="panel">' +
    '<div class="chip-pick" data-chips>' + CHIPS.map(function (v, i) {
      return '<button type="button" class="chip c' + v + (i === 0 ? ' sel' : '') + '" data-chip="' + v + '">' + C.fmtShort(v) + '</button>';
    }).join('') + '</div>' +
    '<div class="bet-line"><span>총 베팅</span><b data-total>0</b></div>' +
    '<div class="actions">' +
    '<button type="button" class="primary" data-spin>스핀</button>' +
    '<button type="button" data-undo>되돌리기</button>' +
    '<button type="button" data-clear>전체 취소</button>' +
    '<button type="button" data-again>같은 베팅</button>' +
    '</div></div>' +
    '<div class="rboard"><div class="numgrid" data-grid>' + nums + '</div>' +
    '<div class="outgrid" data-out>' + outs + '</div></div>';

  var q = function (s) { return root.querySelector(s); };
  var ballEl = q('[data-ball]'), msgEl = q('[data-msg]'), histEl = q('[data-history]'), totalEl = q('[data-total]');
  var spinBtn = q('[data-spin]');
  var chip = CHIPS[0], bets = {}, stack = [], last = null, spinning = false, hist = [];

  function total() { return Object.keys(bets).reduce(function (s, k) { return s + bets[k]; }, 0); }
  function paint() {
    root.querySelectorAll('.spot').forEach(function (el) {
      var v = bets[el.dataset.key];
      var st = el.querySelector('.stake');
      st.textContent = v ? C.fmtShort(v) : '';
      el.classList.toggle('has', !!v);
    });
    totalEl.textContent = C.fmt(total());
    spinBtn.disabled = spinning || total() === 0;
  }
  function place(key, amt) {
    if (spinning) return;
    if (amt > C.money()) return C.toast('게임머니가 부족해');
    C.add(-amt);
    bets[key] = (bets[key] || 0) + amt;
    stack.push([key, amt]);
    paint();
  }
  function refundAll() {
    var t = total();
    if (t) C.add(t);
    bets = {}; stack = [];
  }

  q('[data-chips]').addEventListener('click', function (e) {
    var b = e.target.closest('[data-chip]'); if (!b) return;
    chip = Number(b.dataset.chip);
    root.querySelectorAll('[data-chip]').forEach(function (x) { x.classList.toggle('sel', x === b); });
  });
  root.querySelector('.rboard').addEventListener('click', function (e) {
    var s = e.target.closest('.spot'); if (s) place(s.dataset.key, chip);
  });
  q('[data-undo]').addEventListener('click', function () {
    if (spinning || !stack.length) return;
    var x = stack.pop();
    bets[x[0]] -= x[1]; if (bets[x[0]] <= 0) delete bets[x[0]];
    C.add(x[1]); paint();
  });
  q('[data-clear]').addEventListener('click', function () { if (!spinning) { refundAll(); paint(); } });
  q('[data-again]').addEventListener('click', function () {
    if (spinning || !last) return;
    var need = Object.keys(last).reduce(function (s, k) { return s + last[k]; }, 0);
    if (need > C.money()) return C.toast('게임머니가 부족해');
    refundAll();
    Object.keys(last).forEach(function (k) { C.add(-last[k]); bets[k] = last[k]; stack.push([k, last[k]]); });
    paint();
  });

  function setBall(n) {
    ballEl.textContent = n; ballEl.className = 'ball ' + colorOf(n);
  }
  function renderHist() {
    histEl.innerHTML = '';
    hist.slice(-12).reverse().forEach(function (n) {
      var s = document.createElement('span'); s.className = 'h ' + colorOf(n); s.textContent = n;
      histEl.appendChild(s);
    });
  }

  async function spin() {
    if (spinning || total() === 0) return;
    spinning = true; paint(); msgEl.classList.remove('win');
    msgEl.textContent = '돌아간다…';
    var result = C.rand(37);
    for (var i = 0; i < 26; i++) {
      setBall(C.rand(37));
      await C.sleep(55 + i * i * 0.5);
    }
    setBall(result);
    var stake = total(), pay = 0;
    Object.keys(bets).forEach(function (k) {
      if (wins(k, result)) pay += bets[k] * (k.charAt(0) === 'n' ? 36 : MULT[k]);
    });
    if (pay) C.add(pay);
    var net = pay - stake;
    msgEl.textContent = result + ' ' + { red: '빨강', black: '검정', green: '초록' }[colorOf(result)] + ' · ' +
      (net > 0 ? '+' + C.fmt(net) + ' 획득!' : net === 0 ? '본전' : C.fmt(-net) + ' 잃음');
    msgEl.classList.toggle('win', net > 0);
    hist.push(result); renderHist();
    last = bets; bets = {}; stack = [];
    spinning = false; paint();
    if (C.money() < 100) C.toast('게임머니가 바닥났어. 노동 탭에서 벌거나 위의 리셋을 눌러줘');
  }
  spinBtn.addEventListener('click', spin);
  document.addEventListener('casino:reset', function () { if (!spinning) { bets = {}; stack = []; paint(); } });
  setBall(0); ballEl.textContent = '–'; ballEl.className = 'ball';
  paint();
})();
