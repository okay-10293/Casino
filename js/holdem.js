/* 텍사스 홀덤: 나 + 봇 3명, 블라인드 10/20, 노리밋, 사이드팟 지원.
   바이인은 지갑에서 빠지고, 자리에서 일어나면 남은 칩이 지갑으로 돌아온다. */
(function () {
  'use strict';
  var C = Casino, P = Poker;
  var root = document.getElementById('g-holdem');
  var SB = 1000, BB = 2000, BOT_STACK = 200000;
  var BOT_NAMES = ['민수', '지훈', '서연'];
  var STAGES = [['플랍', 3], ['턴', 1], ['리버', 1]];

  root.innerHTML =
    '<div data-lobby class="lobby panel">' +
    '<h2>텍사스 홀덤</h2>' +
    '<p>혼자 연습하는 판이야. 봇 3명과 한 테이블, 블라인드(강제 베팅) ' + SB + '/' + BB + '.<br>친구랑 하려면 위의 <b>친구랑 같이</b> 탭을 써줘.</p>' +
    '<p>바이인(테이블로 가져가는 칩)은 전 재산의 80%까지 원하는 만큼 가져갈 수 있어. 일어나면 남은 칩이 지갑으로 돌아와.</p>' +
    '<div class="buyins" data-buyins></div><div data-help></div></div>' +
    '<div data-table hidden>' +
    '<div class="felt poker-felt">' +
    '<div class="seats-top" data-top></div>' +
    '<div class="board-area"><div class="pot">팟 <b data-pot>0</b></div><div class="board" data-board></div>' +
    '<div class="msg" data-msg></div></div>' +
    '<div class="seat-me" data-me></div>' +
    '</div>' +
    '<div class="panel hctrl" data-ctrl></div>' +
    '<ul class="log" data-log></ul>' +
    '<div data-ranks></div>' +
    '</div>';

  var q = function (s) { return root.querySelector(s); };
  q('[data-help]').appendChild(C.holdemHelp());
  q('[data-ranks]').appendChild(C.handTable());
  q('[data-buyins]').appendChild(C.buyinPicker({ label: '앉기', onPick: sit }).el);
  var lobbyEl = q('[data-lobby]'), tableEl = q('[data-table]');
  var topEl = q('[data-top]'), meEl = q('[data-me]'), boardEl = q('[data-board]');
  var potEl = q('[data-pot]'), msgEl = q('[data-msg]'), ctrlEl = q('[data-ctrl]'), logEl = q('[data-log]');

  var seats = [], deck = [], board = [], dealerIdx = -1;
  var currentBet = 0, minRaise = BB, inHand = false, humanResolve = null, logs = [];
  var humanFolded = false;

  function human() { return seats[0]; }
  function pot() { return seats.reduce(function (s, p) { return s + p.total; }, 0); }
  function canAct(p) { return !p.folded && !p.allin; }
  function say(t) { logs.push(t); if (logs.length > 6) logs.shift(); renderLog(); }
  function renderLog() {
    logEl.innerHTML = '';
    logs.slice().reverse().forEach(function (t) {
      var li = document.createElement('li'); li.textContent = t; logEl.appendChild(li);
    });
  }

  /* ---------- 로비 ---------- */
  function sit(buyin) {
    if (buyin < C.minBuyin() || buyin > C.maxBuyin()) return C.toast('바이인은 전 재산의 80%까지야');
    C.add(-buyin); C.setTable(buyin);
    seats = [{ name: C.playerName(), bot: false, stack: buyin }].concat(
      BOT_NAMES.map(function (n) { return { name: n, bot: true, stack: BOT_STACK }; }));
    dealerIdx = C.rand(seats.length) - 1;
    logs = []; board = [];
    lobbyEl.hidden = true; tableEl.hidden = false;
    startHand();
  }

  function leave() {
    if (inHand || !seats.length) return;
    var s = human().stack;
    if (s > 0) C.add(s);
    C.setTable(0);
    C.toast(s > 0 ? C.fmt(s) + ' 칩을 지갑으로 가져왔어' : '칩이 다 떨어졌어');
    seats = []; board = [];
    lobbyEl.hidden = false; tableEl.hidden = true;
  }

  /* ---------- 렌더 ---------- */
  function seatEl(p, idx) {
    var d = document.createElement('div');
    d.className = 'pseat' + (p.folded ? ' folded' : '') + (p === acting ? ' acting' : '') + (p.bot ? '' : ' me');
    var head = document.createElement('div'); head.className = 'ph';
    var nm = document.createElement('span'); nm.className = 'pn'; nm.textContent = p.name;
    head.appendChild(nm);
    if (idx === dealerIdx) { var db = document.createElement('i'); db.className = 'dbtn'; db.textContent = 'D'; head.appendChild(db); }
    d.appendChild(head);
    var st = document.createElement('div'); st.className = 'pstack'; st.textContent = C.fmt(p.stack);
    d.appendChild(st);
    var cards = document.createElement('div'); cards.className = 'hand small';
    (p.hand || []).forEach(function (c) { cards.appendChild(C.Cards.el(c, p.bot && !p.show)); });
    d.appendChild(cards);
    var note = document.createElement('div'); note.className = 'pnote';
    note.textContent = p.folded ? '폴드' : (p.allin ? '올인' : '') ;
    if (p.bet && !p.folded) note.textContent = (note.textContent ? note.textContent + ' · ' : '') + '베팅 ' + C.fmt(p.bet);
    if (p.result) { note.textContent = p.result; note.classList.add('res'); }
    d.appendChild(note);
    if (!p.bot && myCombo) {
      var cb = document.createElement('div'); cb.className = 'pcombo'; cb.textContent = '내 족보: ' + myCombo; d.appendChild(cb);
    }
    return d;
  }
  var acting = null, myCombo = '';
  function render() {
    var me0 = seats[0];
    myCombo = (me0 && me0.hand && me0.hand.length === 2 && !me0.folded) ? C.handName(me0.hand.concat(board)) : '';
    C.markRank(myCombo);
    topEl.innerHTML = ''; meEl.innerHTML = '';
    seats.forEach(function (p, i) { (i === 0 ? meEl : topEl).appendChild(seatEl(p, i)); });
    boardEl.innerHTML = '';
    for (var i = 0; i < 5; i++) {
      boardEl.appendChild(board[i] ? C.Cards.el(board[i]) : Object.assign(document.createElement('div'), { className: 'card slot' }));
    }
    potEl.textContent = C.fmt(pot());
  }

  /* ---------- 진행 ---------- */
  function post(p, amt) {
    var a = Math.max(0, Math.min(amt, p.stack));
    p.stack -= a; p.bet += a; p.total += a;
    if (p.stack === 0) p.allin = true;
    return a;
  }

  async function startHand() {
    inHand = true; humanFolded = false; board = []; deck = C.Cards.shuffled();
    seats.forEach(function (p) {
      if (p.bot && p.stack < BB * 2) p.stack = BOT_STACK;
      p.hand = []; p.bet = 0; p.total = 0; p.folded = false; p.allin = false; p.show = false; p.result = '';
    });
    var n = seats.length;
    dealerIdx = (dealerIdx + 1) % n;
    var sb = (dealerIdx + 1) % n, bb = (dealerIdx + 2) % n;
    post(seats[sb], SB); post(seats[bb], BB);
    currentBet = BB; minRaise = BB;
    seats.forEach(function (p) { p.hand = [deck.pop(), deck.pop()]; });
    msgEl.textContent = '새 핸드'; ctrlEl.innerHTML = '';
    say(seats[sb].name + ' SB ' + SB + ', ' + seats[bb].name + ' BB ' + BB);
    render();
    await C.sleep(500);
    await betRound((bb + 1) % n);
    for (var s = 0; s < STAGES.length; s++) {
      if (seats.filter(function (p) { return !p.folded; }).length <= 1) break;
      for (var k = 0; k < STAGES[s][1]; k++) board.push(deck.pop());
      seats.forEach(function (p) { p.bet = 0; });
      currentBet = 0; minRaise = BB;
      msgEl.textContent = STAGES[s][0]; render();
      await C.sleep(humanFolded ? 350 : 800);
      await betRound((dealerIdx + 1) % n);
    }
    await settle();
  }

  async function betRound(start) {
    var n = seats.length, i = start;
    var pending = new Set(seats.filter(canAct));
    while (true) {
      var alive = seats.filter(function (p) { return !p.folded; });
      if (alive.length <= 1) return;
      var actable = seats.filter(canAct);
      if (actable.length === 0) return;
      if (actable.length === 1 && actable[0].bet >= currentBet) return;
      if (pending.size === 0) return;
      var p = null;
      for (var k = 0; k < n; k++) {
        var c = seats[(i + k) % n];
        if (pending.has(c)) { p = c; i = (i + k) % n; break; }
      }
      if (!p) return;
      pending.delete(p);
      acting = p; render();
      var a = await getAction(p);
      acting = null;
      var prev = currentBet;
      if (a.type === 'fold') {
        p.folded = true; say(p.name + ' 폴드');
      } else if (a.type === 'call') {
        var paid = post(p, currentBet - p.bet);
        say(p.name + (paid === 0 ? ' 체크' : ' 콜 ' + C.fmt(paid)));
      } else {
        var to = Math.min(a.to, p.bet + p.stack);
        post(p, to - p.bet);
        if (p.bet > prev) {
          minRaise = Math.max(minRaise, p.bet - prev);
          currentBet = p.bet;
          pending = new Set(seats.filter(function (x) { return canAct(x) && x !== p; }));
          say(p.name + (prev === 0 ? ' 베팅 ' : ' 레이즈 ') + C.fmt(p.bet) + (p.allin ? ' (올인)' : ''));
        } else {
          say(p.name + ' 콜 (올인)');
        }
      }
      render();
      i = (i + 1) % n;
    }
  }

  function getAction(p) {
    if (p.bot) {
      return C.sleep(humanFolded ? 180 : 600 + C.rand(600)).then(function () { return botDecide(p); });
    }
    return new Promise(function (resolve) {
      humanResolve = resolve; renderControls(p);
    });
  }

  /* ---------- 사람 컨트롤 ---------- */
  function renderControls(p) {
    var toCall = Math.min(currentBet - p.bet, p.stack);
    var minTo = Math.min(currentBet + minRaise, p.bet + p.stack);
    var maxTo = p.bet + p.stack;
    var canRaise = maxTo > currentBet;
    var potNow = pot();
    function sized(frac) {
      var to = currentBet + Math.round((potNow + (currentBet - p.bet)) * frac / 1000) * 1000;
      return Math.max(minTo, Math.min(maxTo, to));
    }
    ctrlEl.innerHTML =
      '<div class="actions">' +
      '<button type="button" data-a="fold">포기<small>폴드</small></button>' +
      '<button type="button" class="primary" data-a="call">' + (toCall === 0 ? '넘기기<small>체크</small>' : '맞추기 ' + C.fmt(toCall) + '<small>콜</small>') + '</button>' +
      (canRaise ? '<button type="button" data-a="raise" class="primary">' + (currentBet === 0 ? '베팅하기' : '올리기<small>레이즈</small>') + ' <b data-rv>' + C.fmt(minTo) + '</b></button>' : '') +
      '</div>' +
      (canRaise ? '<div class="raise-row"><input type="range" id="raise-range" min="' + minTo + '" max="' + maxTo + '" step="1000" value="' + minTo + '">' +
        '<div class="presets"><button type="button" data-set="' + minTo + '">최소</button>' +
        '<button type="button" data-set="' + sized(0.5) + '">1/2 팟</button>' +
        '<button type="button" data-set="' + sized(1) + '">팟</button>' +
        '<button type="button" data-set="' + maxTo + '">올인</button></div></div>' : '');
    var range = ctrlEl.querySelector('#raise-range');
    var rv = ctrlEl.querySelector('[data-rv]');
    if (range) {
      range.addEventListener('input', function () { rv.textContent = C.fmt(Number(range.value)); });
    }
    ctrlEl.onclick = function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.set && range) { range.value = b.dataset.set; rv.textContent = C.fmt(Number(range.value)); return; }
      var act = b.dataset.a; if (!act || !humanResolve) return;
      var res = humanResolve; humanResolve = null; ctrlEl.innerHTML = ''; ctrlEl.onclick = null;
      if (act === 'fold') { humanFolded = true; res({ type: 'fold' }); }
      else if (act === 'call') res({ type: 'call' });
      else res({ type: 'raise', to: Number(range.value) });
    };
  }

  /* ---------- 봇 ---------- */
  function strength(p) {
    var h = p.hand;
    if (board.length === 0) {
      var hi = Math.max(h[0].r, h[1].r), lo = Math.min(h[0].r, h[1].r);
      var s = (hi - 2) / 12 * 0.42 + (lo - 2) / 12 * 0.2;
      if (hi === lo) s = 0.55 + (hi - 2) / 12 * 0.4;
      if (h[0].s === h[1].s) s += 0.06;
      if (Math.abs(hi - lo) === 1) s += 0.04;
      return Math.min(1, s);
    }
    var sc = P.best(h.concat(board));
    var base = [0.22, 0.5, 0.68, 0.8, 0.86, 0.9, 0.95, 0.98, 1][sc[0]];
    return Math.min(1, base + (sc[0] <= 1 ? (sc[1] - 2) / 12 * 0.12 : 0));
  }
  function botDecide(p) {
    var toCall = currentBet - p.bet, potNow = pot();
    var str = strength(p), r = Math.random();
    var raiseTo = function (frac) {
      var to = currentBet + Math.max(minRaise, Math.round((potNow + toCall) * frac / 1000) * 1000);
      return { type: 'raise', to: Math.min(to, p.bet + p.stack) };
    };
    if (toCall <= 0) {
      if (str > 0.68 && r < 0.65) return raiseTo(0.4 + Math.random() * 0.4);
      if (str > 0.45 && r < 0.2) return raiseTo(0.35);
      return { type: 'call' };
    }
    var odds = toCall / (potNow + toCall);
    if (toCall >= p.stack && str < 0.8 && r < 0.6) return { type: 'fold' };
    if (str < odds * 0.9 + 0.1 && r < 0.85) return { type: 'fold' };
    if (str > 0.8 && r < 0.5) return raiseTo(0.5 + Math.random() * 0.5);
    if (str > 0.6 && r < 0.2) return raiseTo(0.5);
    return { type: 'call' };
  }

  /* ---------- 정산 ---------- */
  function buildPots() {
    var levels = Array.from(new Set(seats.map(function (p) { return p.total; }).filter(function (t) { return t > 0; })))
      .sort(function (a, b) { return a - b; });
    var prev = 0, pots = [], carry = 0;
    levels.forEach(function (lv) {
      var amt = carry;
      seats.forEach(function (p) { amt += Math.max(0, Math.min(p.total, lv) - prev); });
      var elig = seats.filter(function (p) { return !p.folded && p.total >= lv; });
      if (!elig.length) carry = amt; else { pots.push({ amt: amt, elig: elig }); carry = 0; }
      prev = lv;
    });
    if (carry > 0 && pots.length) pots[pots.length - 1].amt += carry;
    return pots;
  }

  async function settle() {
    var alive = seats.filter(function (p) { return !p.folded; });
    var won = new Map();
    var total = pot();
    var text;
    if (alive.length === 1) {
      alive[0].stack += total; won.set(alive[0], total);
      text = alive[0].name + ' 승리 (상대 전원 폴드) +' + C.fmt(total);
    } else {
      alive.forEach(function (p) { p.show = true; p.score = P.best(p.hand.concat(board)); });
      buildPots().forEach(function (pt) {
        var top = pt.elig.reduce(function (b, p) { return !b || P.cmp(p.score, b) > 0 ? p.score : b; }, null);
        var ws = pt.elig.filter(function (p) { return P.cmp(p.score, top) === 0; });
        var share = Math.floor(pt.amt / ws.length), rem = pt.amt - share * ws.length;
        ws.forEach(function (p, i) {
          var g = share + (i === 0 ? rem : 0);
          p.stack += g; won.set(p, (won.get(p) || 0) + g);
        });
      });
      var names = [];
      won.forEach(function (v, p) { names.push(p.name + ' ' + P.name(p.score) + ' +' + C.fmt(v)); });
      text = names.join(' / ');
    }
    won.forEach(function (v, p) { p.result = '+' + C.fmt(v); });
    seats.forEach(function (p) { p.bet = 0; p.total = 0; });
    msgEl.textContent = text; say(text);
    render();
    inHand = false;
    C.setTable(human().stack);
    renderEnd();
  }

  function renderEnd() {
    if (human().stack <= 0) {
      ctrlEl.innerHTML = '<p class="rule">칩이 다 떨어졌어. 로비에서 다시 바이인할 수 있어.</p><div class="actions"><button type="button" class="primary" data-end="leave">로비로</button></div>';
    } else {
      ctrlEl.innerHTML = '<div class="actions"><button type="button" class="primary" data-end="next">다음 핸드</button><button type="button" data-end="leave">일어나기 (' + C.fmt(human().stack) + ')</button></div>';
    }
    ctrlEl.onclick = function (e) {
      var b = e.target.closest('[data-end]'); if (!b) return;
      ctrlEl.onclick = null;
      if (b.dataset.end === 'next') startHand(); else leave();
    };
  }

  document.addEventListener('casino:reset', function () {
    if (seats.length) location.reload(); // 진행 중인 테이블 상태를 깔끔하게 버린다
  });
})();
