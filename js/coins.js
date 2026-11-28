/* 코인: 게임머니로 코인을 사고파는 모의 투자 탭.
   - 비트코인: Coinbase 공개 시세(읽기 전용)를 10초마다 가져온다. 연결이 안 되면 시뮬레이션 가격.
   - 오케이코인/루나코인/치킨코인/거북코인: 우리끼리 만든 가짜 코인. 시세는 "지금 시각"만으로 계산하는 식이라
     서버 없이도 접속한 모두에게 같은 가격이 보이고, 지난 1시간 그래프도 바로 그려진다.
   전부 가짜 게임머니라 실제 코인/돈과 아무 관련 없고, 입출금도 없다. */
(function () {
  'use strict';
  var C = Casino;
  var root = document.getElementById('g-coins');
  var KEY = 'okay-casino-coins-v1', OLD_KEY = 'okay-casino-btc-v1';
  var RATE = 1400;            // 비트코인: 1달러 = 게임머니 1,400
  var FEE = 0.001;            // 사고팔 때 수수료 0.1%
  var SAT = 100000000;        // 1코인 = 1억 단위 (정수로 들고 있어서 소수점 오차가 없다)
  var POLL = 10000, TICK = 5000, MAXPTS = 60, STEP = 60000, MIN_TRADE = 1000;
  var FEED = 'https://api.coinbase.com/v2/prices/BTC-USD/spot';

  /* base: 기준 가격(게임머니), vol: 변동폭, ev: 30분마다 급등/급락이 터질 확률, mag: 급변 크기, crash: 급변이 급락일 확률 */
  var COINS = [
    { id: 'BTC', name: '비트코인', icon: '₿', real: true },
    { id: 'EUN', name: '은혁코인', icon: '👑', base: 120000, vol: 0.9, ev: 0.07, mag: 0.4, crash: 0.4, desc: '은혁이 이름을 건 코인. 비싸고, 가끔 확 날아가.' },
    { id: 'PNY', name: '푼돈코인', icon: '🪙', base: 45, vol: 1.3, ev: 0.12, mag: 0.6, crash: 0.5, desc: '한 개에 몇십 원. 많이 사서 한 방을 노려봐.' },
    { id: 'CHK', name: '치킨코인', icon: '🍗', base: 180, vol: 1.2, ev: 0.15, mag: 0.6, crash: 0.5, desc: '값이 싸고 제일 정신없어. 급등락 천국.' },
    { id: 'RMN', name: '라면코인', icon: '🍜', base: 950, vol: 0.6, ev: 0.04, mag: 0.25, crash: 0.5, desc: '서민 코인. 불어 터질 때도 있어.' },
    { id: 'LUN', name: '루나코인', icon: '🌙', base: 3500, vol: 1.0, ev: 0.10, mag: 0.5, crash: 0.6, desc: '크게 오르고 크게 떨어져. 가끔 폭락해.' },
    { id: 'RBT', name: '달토끼코인', icon: '🐰', base: 7200, vol: 1.1, ev: 0.10, mag: 0.5, crash: 0.45, desc: '깡충깡충 뛰어. 오를 땐 높이, 내릴 땐 깊이.' },
    { id: 'OKC', name: '오케이코인', icon: '🆗', base: 25000, vol: 0.75, ev: 0.03, mag: 0.25, crash: 0.5, desc: '우리 카지노 대표 코인. 적당히 출렁여.' },
    { id: 'TTL', name: '거북코인', icon: '🐢', base: 60000, vol: 0.25, ev: 0, mag: 0, crash: 0, desc: '느리고 얌전해. 큰돈은 안 되지만 덜 무서워.' },
    { id: 'BLT', name: '번개코인', icon: '⚡', base: 280000, vol: 0.7, ev: 0.08, mag: 0.35, crash: 0.5, desc: '비싼 대신 번쩍 하는 순간에 크게 움직여.' },
    { id: 'DIA', name: '다이아코인', icon: '💎', base: 2500000, vol: 0.35, ev: 0.02, mag: 0.2, crash: 0.5, desc: '제일 비싸고 묵직해. 한 개가 250만 원쯤.' }
  ];
  var byId = {};
  COINS.forEach(function (c) { byId[c.id] = c; });

  /* ---------- 가짜 코인 시세: 같은 시각이면 누구에게나 같은 값 ---------- */
  function hash(s, n) {
    var h = Math.imul((n | 0) ^ (s | 0), 0x9E3779B1);
    h ^= h >>> 15; h = Math.imul(h, 0x85EBCA6B); h ^= h >>> 13; h = Math.imul(h, 0xC2B2AE35); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function seedOf(str) { var s = 7; for (var i = 0; i < str.length; i++) s = Math.imul(s, 31) + str.charCodeAt(i) | 0; return s; }
  function noise(s, x) {                         // -1 ~ 1, 부드럽게 이어지는 값
    var i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
    var a = hash(s, i), b = hash(s, i + 1);
    return (a + (b - a) * u) * 2 - 1;
  }
  var LAYERS = [[172800000, 0.55], [21600000, 0.3], [3600000, 0.12], [600000, 0.05], [60000, 0.02]];  // [주기(ms), 크기]
  var EPOCH = 1800000, RAMP = 120000, DECAY = 1200000;
  function priceAt(c, t) {
    var s = seedOf(c.id), lp = 0, k, j;
    for (k = 0; k < LAYERS.length; k++) lp += LAYERS[k][1] * noise(s + k * 7919, t / LAYERS[k][0]);
    lp *= c.vol;
    if (c.ev > 0) {                              // 급등/급락: 2분 동안 확 움직이고 20분 정도에 걸쳐 돌아온다
      var e = Math.floor(t / EPOCH);
      for (j = e - 2; j <= e; j++) {
        if (hash(s + 991, j) >= c.ev) continue;
        var dt = t - j * EPOCH, shape = dt < RAMP ? dt / RAMP : Math.exp(-(dt - RAMP) / DECAY);
        lp += (hash(s + 17, j) < c.crash ? -1 : 1) * c.mag * shape;
      }
    }
    return Math.max(1, Math.round(c.base * Math.exp(lp)));
  }

  /* ---------- 내 보유 (코인별 단위 수, 투자원금) ---------- */
  var W = {};
  COINS.forEach(function (c) { W[c.id] = { sats: 0, cost: 0 }; });
  function okEntry(x) { return x && x.sats >= 0 && x.cost >= 0 && isFinite(x.sats) && isFinite(x.cost); }
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY));
      if (s) COINS.forEach(function (c) { if (okEntry(s[c.id])) W[c.id] = { sats: Math.floor(s[c.id].sats), cost: Math.floor(s[c.id].cost) }; });
      else {                                      // 예전 비트코인 탭 저장값을 가져온다
        var o = JSON.parse(localStorage.getItem(OLD_KEY));
        if (okEntry(o)) W.BTC = { sats: Math.floor(o.sats), cost: Math.floor(o.cost) };
      }
    } catch (e) {}
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(W)); } catch (e) {} }
  load();

  /* ---------- 시세 상태 ---------- */
  var M = {};           // id -> { price, hist, start, usd, live }
  COINS.forEach(function (c) { M[c.id] = { price: 0, hist: [], start: 0, usd: 0, live: false }; });
  var fakeNow = null, manualBtc = false, timer = null, tickN = 0, sel = 'BTC';
  function now() { return fakeNow === null ? Date.now() : fakeNow; }

  function refreshVirtual() {
    var t = now();
    COINS.forEach(function (c) {
      if (c.real) return;
      var m = M[c.id], h = [];
      for (var i = MAXPTS - 1; i >= 0; i--) h.push(priceAt(c, t - i * STEP));
      m.hist = h; m.start = h[0]; m.price = h[h.length - 1];
    });
  }
  function setBtc(v, isLive) {
    var m = M.BTC; m.usd = v; m.price = Math.round(v * RATE); m.live = !!isLive;
    if (!m.start) m.start = m.price;
    m.hist.push(m.price); if (m.hist.length > MAXPTS) m.hist.shift();
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
  function pollBtc() {
    if (manualBtc) return;
    Promise.resolve().then(fetchUsd).then(
      function (v) { if (!manualBtc) { setBtc(v, true); render(); } },
      function () { if (!manualBtc) { setBtc((M.BTC.usd || 95000) * (1 + (C.rand(2001) - 1000) / 1000000), false); render(); } });
  }
  function tick() { refreshVirtual(); if (tickN++ % 2 === 0) pollBtc(); render(); }
  function startTicking() { if (timer) return; tickN = 0; tick(); timer = setInterval(tick, TICK); }
  function stopTicking() { clearInterval(timer); timer = null; }
  document.addEventListener('casino:tab', function (e) { if (e.detail === 'coins') startTicking(); else stopTicking(); });
  refreshVirtual();

  /* ---------- 거래 계산 ---------- */
  function buyQuote(p, spend) { return Math.floor(spend * (1 - FEE) / p * SAT); }                // 받는 단위
  function sellQuote(p, u) { return Math.floor(u / SAT * p * (1 - FEE)); }                       // 받는 게임머니
  function holdValue(id) { return M[id].price ? Math.floor(W[id].sats / SAT * M[id].price) : 0; }
  function fmtAmt(u) { return (u / SAT).toFixed(8); }
  function sign(n) { return (n > 0 ? '+' : n < 0 ? '−' : '') + C.fmt(Math.abs(n)); }
  function pct(a, b) { return b > 0 ? (a / b * 100) : 0; }
  function pctText(p) { return (p > 0 ? '+' : p < 0 ? '−' : '') + Math.abs(p).toFixed(2) + '%'; }
  function res(ok, text) { return { ok: ok, text: text }; }

  function buy(id, spend) {
    var c = byId[id], p = M[id].price; spend = Math.floor(spend);
    if (!p) return res(false, '시세를 불러오는 중이야');
    if (!(spend >= MIN_TRADE)) return res(false, '최소 ' + C.fmt(MIN_TRADE) + '부터 살 수 있어');
    if (spend > C.money()) return res(false, '게임머니가 부족해');
    var got = buyQuote(p, spend);
    if (got < 1) return res(false, '너무 적은 금액이야');
    C.add(-spend);
    W[id].sats += got; W[id].cost += spend; save();
    return res(true, c.icon + ' ' + c.name + ' ' + fmtAmt(got) + ' 샀어 (−' + C.fmt(spend) + ')');
  }
  function sell(id, u) {
    var c = byId[id], p = M[id].price, w = W[id];
    u = Math.min(Math.floor(u), w.sats);
    if (!p) return res(false, '시세를 불러오는 중이야');
    if (!(u >= 1)) return res(false, w.sats ? '팔 금액을 입력해줘' : '팔 ' + c.name + '이 없어');
    var pay = sellQuote(p, u);
    if (pay < MIN_TRADE) return res(false, '너무 적은 금액이야 (최소 ' + C.fmt(MIN_TRADE) + ')');
    var costOut = u >= w.sats ? w.cost : Math.round(w.cost * u / w.sats);
    w.sats -= u; w.cost = w.sats ? Math.max(0, w.cost - costOut) : 0; save();
    C.add(pay);
    return res(true, c.icon + ' ' + c.name + ' ' + fmtAmt(u) + ' 팔았어 (+' + C.fmt(pay) + ')');
  }

  /* ---------- 화면 ---------- */
  root.innerHTML =
    '<div class="panel coin-market">' +
    '<div class="btc-head"><h2>코인</h2><span class="btc-badge" data-total-badge>모의 투자</span></div>' +
    '<div class="btc-hold"><div><small>코인 총 평가금액</small><b data-t-val>0</b></div><div><small>총 손익</small><b data-t-pl>0</b></div></div>' +
    '<div class="coin-list">' + COINS.map(function (c) {
      return '<button type="button" class="coin-row" data-coin="' + c.id + '"><span class="ci">' + c.icon + '</span>' +
        '<span class="cn"><b>' + c.name + '</b><small data-sub></small></span>' +
        '<span class="cp"><b data-p>—</b><small data-c></small></span></button>';
    }).join('') + '</div></div>' +
    '<div class="panel btc-panel">' +
    '<div class="btc-head"><h2 data-name></h2><span class="btc-badge" data-badge></span></div>' +
    '<p class="rule coin-desc" data-desc></p>' +
    '<div class="btc-price"><b data-price>—</b><small data-usd></small></div>' +
    '<div class="btc-change" data-change></div>' +
    '<svg class="btc-chart" data-chart viewBox="0 0 300 80" preserveAspectRatio="none" role="img" aria-label="가격 그래프"><polyline fill="none" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points=""></polyline></svg>' +
    '<div class="btc-hold">' +
    '<div><small>보유</small><b data-sats></b></div><div><small>평가금액</small><b data-val>0</b></div>' +
    '<div><small>투자원금</small><b data-cost>0</b></div><div><small>손익</small><b data-pl>0</b></div></div>' +
    '<div class="btc-trade" data-mode-host></div>' +
    '<div class="btc-quick"><button type="button" data-p="10">10%</button><button type="button" data-p="25">25%</button>' +
    '<button type="button" data-p="50">50%</button><button type="button" data-p="100">전부</button></div>' +
    '<div class="btc-row"><input type="number" inputmode="numeric" min="0" step="1000" data-amount aria-label="금액" enterkeyhint="done">' +
    '<button type="button" class="primary" data-go>사기</button></div>' +
    '<small class="rule" data-hint></small>' +
    '<div class="msg" data-msg></div>' +
    '<p class="rule">가짜 게임머니로 하는 모의 투자야. 실제 코인/돈과 관련 없고 입출금도 없어. 수수료는 사고팔 때 각각 0.1%. 보유한 코인은 랭킹 잔액에 들어가지 않아. 오케이·루나·치킨·거북코인은 우리끼리 만든 가짜 코인이라 접속한 모두에게 같은 시세가 보여.</p>' +
    '</div>';

  var q = function (s) { return root.querySelector(s); };
  var rows = {};
  root.querySelectorAll('.coin-row').forEach(function (r) { rows[r.dataset.coin] = r; });
  var mode = C.segmented([{ value: 'buy', label: '사기' }, { value: 'sell', label: '팔기' }], 'buy');
  q('[data-mode-host]').appendChild(mode);
  var amountEl = q('[data-amount]'), goEl = q('[data-go]'), hintEl = q('[data-hint]'), msgEl = q('[data-msg]');
  var allSell = false;   // "전부"를 눌렀으면 반올림 없이 보유 전량을 판다

  function changeOf(id) { var m = M[id]; return m.price && m.start ? pct(m.price - m.start, m.start) : 0; }
  function upDown(el, n) { el.classList.toggle('up', n > 0); el.classList.toggle('down', n < 0); }

  function render() {
    var c = byId[sel], m = M[sel], w = W[sel], buying = mode.value === 'buy', p = m.price;
    var totVal = 0, totCost = 0;
    COINS.forEach(function (k) {
      var r = rows[k.id], mk = M[k.id], v = holdValue(k.id), ch = changeOf(k.id);
      totVal += v; totCost += W[k.id].cost;
      r.classList.toggle('on', k.id === sel);
      r.querySelector('[data-p]').textContent = mk.price ? C.fmt(mk.price) : '—';
      var cEl = r.querySelector('[data-c]'); cEl.textContent = mk.price ? pctText(ch) : ''; upDown(cEl, ch);
      r.querySelector('[data-sub]').textContent = k.id + (W[k.id].sats ? ' · 보유 ' + C.fmt(v) : '');
    });
    var tpl = totVal - totCost, tplEl = q('[data-t-pl]');
    q('[data-t-val]').textContent = C.fmt(totVal);
    tplEl.textContent = totCost ? sign(tpl) + ' (' + pctText(pct(tpl, totCost)) + ')' : '0'; upDown(tplEl, totCost ? tpl : 0);

    q('[data-name]').textContent = c.icon + ' ' + c.name;
    q('[data-badge]').textContent = c.real ? (!p ? '시세 불러오는 중…' : m.live ? '실시간 · Coinbase' : '시뮬레이션 (실시간 연결 안 됨)') : '가상 코인 · 모두 같은 시세';
    q('[data-badge]').classList.toggle('sim', c.real && !!p && !m.live);
    q('[data-desc]').textContent = c.real ? '진짜 비트코인 시세를 따라가. 1달러 = 게임머니 1,400.' : c.desc;
    q('[data-price]').textContent = p ? '1 ' + c.id + ' = ' + C.fmt(p) : '—';
    q('[data-usd]').textContent = c.real && p ? '$' + m.usd.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '';
    var ch = changeOf(sel), chEl = q('[data-change]');
    chEl.textContent = p ? (c.real ? '이 화면 연 뒤로 ' : '1시간 전보다 ') + pctText(ch) : '';
    chEl.className = 'btc-change ' + (ch > 0 ? 'up' : ch < 0 ? 'down' : '');
    drawChart(m);
    var val = holdValue(sel), pl = val - w.cost, plEl = q('[data-pl]');
    q('[data-sats]').textContent = fmtAmt(w.sats) + ' ' + c.id;
    q('[data-val]').textContent = C.fmt(val);
    q('[data-cost]').textContent = C.fmt(w.cost);
    plEl.textContent = w.cost ? sign(pl) + ' (' + pctText(pct(pl, w.cost)) + ')' : '0';
    plEl.className = pl > 0 ? 'up' : pl < 0 ? 'down' : '';
    goEl.textContent = buying ? '사기' : '팔기';
    goEl.disabled = !p;
    amountEl.setAttribute('aria-label', buying ? '살 금액' : '팔 금액');
    var a = Math.floor(Number(amountEl.value)) || 0;
    if (!p) hintEl.textContent = '';
    else if (buying) hintEl.textContent = a >= MIN_TRADE ? '≈ ' + fmtAmt(buyQuote(p, Math.min(a, C.money()))) + ' ' + c.id + ' (수수료 포함, 보유 게임머니 ' + C.fmt(C.money()) + ')' : '살 금액을 입력해 (최소 ' + C.fmt(MIN_TRADE) + ', 보유 ' + C.fmt(C.money()) + ')';
    else hintEl.textContent = w.sats ? (a >= 1 || allSell ? '≈ ' + C.fmt(sellQuote(p, allSell ? w.sats : Math.min(w.sats, Math.round(a / p * SAT)))) + ' 받아 (수수료 포함)' : '팔 금액을 입력해 (최대 평가금액 ' + C.fmt(val) + ')') : '팔 ' + c.name + '이 없어';
  }

  function drawChart(m) {
    var line = q('[data-chart] polyline'), h = m.hist;
    if (h.length < 2) { line.setAttribute('points', ''); return; }
    var lo = Math.min.apply(null, h), hi = Math.max.apply(null, h), span = hi - lo || 1;
    line.setAttribute('points', h.map(function (p, i) {
      return ((MAXPTS - h.length + i) / (MAXPTS - 1) * 300).toFixed(1) + ',' + (74 - (p - lo) / span * 68).toFixed(1);
    }).join(' '));
    line.setAttribute('class', h[h.length - 1] >= h[0] ? 'up' : 'down');
  }

  function say(text, good) { msgEl.textContent = text; msgEl.classList.toggle('win', !!good); }
  function pick(id) { sel = id; allSell = false; amountEl.value = ''; say(''); render(); }

  root.querySelector('.coin-list').addEventListener('click', function (e) {
    var b = e.target.closest('[data-coin]'); if (b) pick(b.dataset.coin);
  });
  mode.addEventListener('change', function () { allSell = false; amountEl.value = ''; say(''); render(); });
  amountEl.addEventListener('input', function () { allSell = false; render(); });
  q('.btc-quick').addEventListener('click', function (e) {
    var b = e.target.closest('[data-p]'); if (!b) return;
    var p = Number(b.dataset.p) / 100;
    if (mode.value === 'buy') amountEl.value = Math.floor(C.money() * p);
    else { allSell = p === 1; amountEl.value = Math.floor(holdValue(sel) * p); }
    render();
  });
  goEl.addEventListener('click', function () {
    refreshVirtual();                                   // 누른 순간의 가격으로 거래한다
    var p = M[sel].price, r;
    if (mode.value === 'buy') r = buy(sel, Number(amountEl.value));
    else r = sell(sel, allSell ? W[sel].sats : Math.round(Number(amountEl.value) / p * SAT));
    say(r.text, r.ok); if (r.ok) { C.toast(r.text); amountEl.value = ''; allSell = false; }
    render();
  });

  C.onChange(render);
  document.addEventListener('casino:reset', function () {
    COINS.forEach(function (c) { W[c.id] = { sats: 0, cost: 0 }; });
    save(); allSell = false; amountEl.value = ''; say(''); render();
  });
  render();

  // 테스트용: 비트코인 시세/현재 시각을 직접 정한다 (정하면 자동 갱신은 그 값을 덮어쓰지 않는다)
  window.CasinoCoins = {
    setBtcUsd: function (v) { manualBtc = true; setBtc(v, true); render(); },
    setTime: function (t) { fakeNow = t; refreshVirtual(); render(); },
    priceAt: function (id, t) { return priceAt(byId[id], t); },
    state: function (id) { return { sats: W[id].sats, cost: W[id].cost, price: M[id].price }; }
  };
})();
