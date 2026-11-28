/* 비트코인: 게임머니로 비트코인을 사고파는 모의 투자 탭.
   시세는 Coinbase 공개 시세(읽기 전용)를 10초마다 가져오고, 연결이 안 되면 시뮬레이션 가격으로 움직인다.
   전부 가짜 게임머니라 실제 비트코인/돈과 아무 관련 없고, 입출금도 없다. */
(function () {
  'use strict';
  var C = Casino;
  var root = document.getElementById('g-bitcoin');
  var KEY = 'okay-casino-btc-v1';
  var RATE = 1400;            // 1달러 = 게임머니 1,400
  var FEE = 0.001;            // 사고팔 때 수수료 0.1%
  var SAT = 100000000;        // 1 BTC = 1억 사토시 (정수로 들고 있어서 소수점 오차가 없다)
  var POLL = 10000, MAXPTS = 60, MIN_TRADE = 1000;
  var FEED = 'https://api.coinbase.com/v2/prices/BTC-USD/spot';

  /* ---------- 내 보유 (사토시, 투자원금) ---------- */
  var W = { sats: 0, cost: 0 };
  try {
    var saved = JSON.parse(localStorage.getItem(KEY));
    if (saved && saved.sats >= 0 && saved.cost >= 0) { W.sats = Math.floor(saved.sats); W.cost = Math.floor(saved.cost); }
  } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(W)); } catch (e) {} }

  /* ---------- 시세 ---------- */
  var usd = 0, price = 0, live = false, manual = false, hist = [], timer = null, startPrice = 0;
  function setUsd(v, isLive) {
    usd = v; price = Math.round(v * RATE); live = !!isLive;
    if (!startPrice) startPrice = price;
    hist.push(price); if (hist.length > MAXPTS) hist.shift();
    render();
  }
  function fetchUsd() {
    return fetch(FEED, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('feed'); return r.json();
    }).then(function (j) {
      var v = parseFloat(j && j.data && j.data.amount);
      if (!(v > 1000 && v < 10000000)) throw new Error('feed');
      return v;
    });
  }
  function simulate() {   // 연결 실패 시: 직전 가격에서 ±0.1% 안쪽으로 움직인다
    var base = usd || 95000;
    setUsd(base * (1 + (C.rand(2001) - 1000) / 1000000), false);
  }
  function poll() {
    if (manual) return;
    Promise.resolve().then(fetchUsd).then(function (v) { if (!manual) setUsd(v, true); }, function () { if (!manual) simulate(); });
  }
  function startPolling() { if (timer) return; poll(); timer = setInterval(poll, POLL); }
  function stopPolling() { clearInterval(timer); timer = null; }
  document.addEventListener('casino:tab', function (e) { if (e.detail === 'bitcoin') startPolling(); else stopPolling(); });

  /* ---------- 거래 계산 ---------- */
  function buyQuote(spend) { return Math.floor(spend * (1 - FEE) / price * SAT); }                 // 받는 사토시
  function sellQuote(sats) { return Math.floor(sats / SAT * price * (1 - FEE)); }                   // 받는 게임머니
  function holdValue() { return price ? Math.floor(W.sats / SAT * price) : 0; }

  function buy(spend) {
    spend = Math.floor(spend);
    if (!price) return '시세를 불러오는 중이야';
    if (!(spend >= MIN_TRADE)) return '최소 ' + C.fmt(MIN_TRADE) + '부터 살 수 있어';
    if (spend > C.money()) return '게임머니가 부족해';
    var got = buyQuote(spend);
    if (got < 1) return '너무 적은 금액이야';
    C.add(-spend);
    W.sats += got; W.cost += spend; save();
    return '₿ ' + fmtBtc(got) + ' 샀어 (−' + C.fmt(spend) + ')';
  }
  function sell(sats) {
    sats = Math.min(Math.floor(sats), W.sats);
    if (!price) return '시세를 불러오는 중이야';
    if (!(sats >= 1)) return W.sats ? '팔 금액을 입력해줘' : '팔 비트코인이 없어';
    var pay = sellQuote(sats);
    if (pay < MIN_TRADE) return '너무 적은 금액이야 (최소 ' + C.fmt(MIN_TRADE) + ')';
    var costOut = sats >= W.sats ? W.cost : Math.round(W.cost * sats / W.sats);
    W.sats -= sats; W.cost = W.sats ? Math.max(0, W.cost - costOut) : 0; save();
    C.add(pay);
    return '₿ ' + fmtBtc(sats) + ' 팔았어 (+' + C.fmt(pay) + ')';
  }
  function fmtBtc(sats) { return (sats / SAT).toFixed(8); }
  function sign(n) { return (n > 0 ? '+' : n < 0 ? '−' : '') + C.fmt(Math.abs(n)); }
  function pct(a, b) { return b > 0 ? (a / b * 100) : 0; }
  function pctText(p) { return (p > 0 ? '+' : p < 0 ? '−' : '') + Math.abs(p).toFixed(2) + '%'; }

  /* ---------- 화면 ---------- */
  root.innerHTML =
    '<div class="panel btc-panel">' +
    '<div class="btc-head"><h2>비트코인</h2><span class="btc-badge" data-badge>시세 불러오는 중…</span></div>' +
    '<div class="btc-price"><b data-price>—</b><small data-usd></small></div>' +
    '<div class="btc-change" data-change></div>' +
    '<svg class="btc-chart" data-chart viewBox="0 0 300 80" preserveAspectRatio="none" role="img" aria-label="비트코인 가격 그래프"><polyline fill="none" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points=""></polyline></svg>' +
    '<div class="btc-hold">' +
    '<div><small>보유</small><b data-sats>₿ 0.00000000</b></div>' +
    '<div><small>평가금액</small><b data-val>0</b></div>' +
    '<div><small>투자원금</small><b data-cost>0</b></div>' +
    '<div><small>손익</small><b data-pl>0</b></div>' +
    '</div>' +
    '<div class="btc-trade" data-mode-host></div>' +
    '<div class="btc-quick">' +
    '<button type="button" data-p="10">10%</button><button type="button" data-p="25">25%</button>' +
    '<button type="button" data-p="50">50%</button><button type="button" data-p="100">전부</button></div>' +
    '<div class="btc-row"><input type="number" inputmode="numeric" min="0" step="1000" data-amount aria-label="금액" enterkeyhint="done">' +
    '<button type="button" class="primary" data-go>사기</button></div>' +
    '<small class="rule" data-hint></small>' +
    '<div class="msg" data-msg></div>' +
    '<p class="rule">가짜 게임머니로 하는 모의 투자야. 실제 비트코인/돈과 관련 없고 입출금도 없어. 수수료는 사고팔 때 각각 0.1%. 보유한 비트코인은 랭킹 잔액에 들어가지 않아.</p>' +
    '</div>';

  var q = function (s) { return root.querySelector(s); };
  var mode = C.segmented([{ value: 'buy', label: '사기' }, { value: 'sell', label: '팔기' }], 'buy');
  q('[data-mode-host]').appendChild(mode);
  var amountEl = q('[data-amount]'), goEl = q('[data-go]'), hintEl = q('[data-hint]'), msgEl = q('[data-msg]');
  var allSell = false;   // "전부"를 눌렀으면 반올림 없이 보유 전량을 판다

  function render() {
    var buying = mode.value === 'buy';
    q('[data-badge]').textContent = !price ? '시세 불러오는 중…' : live ? '실시간 · Coinbase' : '시뮬레이션 (실시간 연결 안 됨)';
    q('[data-badge]').classList.toggle('sim', !!price && !live);
    q('[data-price]').textContent = price ? '1 ₿ = ' + C.fmt(price) : '—';
    q('[data-usd]').textContent = price ? '$' + usd.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '';
    var ch = price && startPrice ? pct(price - startPrice, startPrice) : 0;
    var chEl = q('[data-change]');
    chEl.textContent = price ? '이 화면 연 뒤로 ' + pctText(ch) : '';
    chEl.className = 'btc-change ' + (ch > 0 ? 'up' : ch < 0 ? 'down' : '');
    drawChart();
    var val = holdValue(), pl = val - W.cost, plEl = q('[data-pl]');
    q('[data-sats]').textContent = '₿ ' + fmtBtc(W.sats);
    q('[data-val]').textContent = C.fmt(val);
    q('[data-cost]').textContent = C.fmt(W.cost);
    plEl.textContent = W.cost ? sign(pl) + ' (' + pctText(pct(pl, W.cost)) + ')' : '0';
    plEl.className = pl > 0 ? 'up' : pl < 0 ? 'down' : '';
    goEl.textContent = buying ? '사기' : '팔기';
    goEl.disabled = !price;
    amountEl.setAttribute('aria-label', buying ? '살 금액' : '팔 금액');
    var a = Math.floor(Number(amountEl.value)) || 0;
    if (!price) hintEl.textContent = '';
    else if (buying) hintEl.textContent = a >= MIN_TRADE ? '≈ ₿ ' + fmtBtc(buyQuote(Math.min(a, C.money()))) + ' (수수료 포함, 보유 게임머니 ' + C.fmt(C.money()) + ')' : '살 금액을 입력해 (최소 ' + C.fmt(MIN_TRADE) + ', 보유 ' + C.fmt(C.money()) + ')';
    else hintEl.textContent = W.sats ? (a >= 1 || allSell ? '≈ ' + C.fmt(sellQuote(allSell ? W.sats : Math.min(W.sats, Math.round(a / price * SAT)))) + ' 받아 (수수료 포함)' : '팔 금액을 입력해 (최대 평가금액 ' + C.fmt(val) + ')') : '팔 비트코인이 없어';
  }

  function drawChart() {
    var line = q('[data-chart] polyline');
    if (hist.length < 2) { line.setAttribute('points', ''); return; }
    var lo = Math.min.apply(null, hist), hi = Math.max.apply(null, hist), span = hi - lo || 1;
    line.setAttribute('points', hist.map(function (p, i) {
      return (i / (MAXPTS - 1) * 300).toFixed(1) + ',' + (74 - (p - lo) / span * 68).toFixed(1);
    }).join(' '));
    line.setAttribute('class', hist[hist.length - 1] >= hist[0] ? 'up' : 'down');
  }

  function say(text, good) { msgEl.textContent = text; msgEl.classList.toggle('win', !!good); }

  mode.addEventListener('change', function () { allSell = false; amountEl.value = ''; say(''); render(); });
  amountEl.addEventListener('input', function () { allSell = false; render(); });
  q('.btc-quick').addEventListener('click', function (e) {
    var b = e.target.closest('[data-p]'); if (!b) return;
    var p = Number(b.dataset.p) / 100;
    if (mode.value === 'buy') amountEl.value = Math.floor(C.money() * p);
    else { allSell = p === 1; amountEl.value = Math.floor(holdValue() * p); }
    render();
  });
  goEl.addEventListener('click', function () {
    var r;
    if (mode.value === 'buy') r = buy(Number(amountEl.value));
    else r = sell(allSell ? W.sats : Math.round(Number(amountEl.value) / price * SAT));
    var ok = r.charAt(0) === '₿';
    say(r, ok); if (ok) { C.toast(r); amountEl.value = ''; allSell = false; }
    render();
  });

  C.onChange(render);
  document.addEventListener('casino:reset', function () { W.sats = 0; W.cost = 0; save(); allSell = false; amountEl.value = ''; say(''); render(); });
  render();

  // 테스트용: 시세를 직접 정한다 (정하면 자동 시세 갱신은 멈춘다)
  window.CasinoBTC = { setUsd: function (v) { manual = true; setUsd(v, true); }, state: function () { return { sats: W.sats, cost: W.cost, price: price }; } };
})();
