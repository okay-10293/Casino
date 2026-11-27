/* 온라인 홀덤 엔진 (방장 브라우저에서만 돈다). 네트워크와 UI를 모르고 콜백만 호출한다.
   카드는 {r, s}. 블라인드 SB/BB, 노리밋, 사이드팟, 최대 6명. */
(function (root) {
  'use strict';
  var Poker = (typeof require !== 'undefined' && typeof module !== 'undefined') ? require('./poker-eval.js') : root.Poker;

  function createEngine(opt) {
    var SB = opt.sb || 10, BB = opt.bb || 20, MAX = opt.maxSeats || 6;
    var sleep = opt.sleep || function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    var turnMs = opt.turnMs || 30000;
    var betweenMs = opt.betweenMs == null ? 6000 : opt.betweenMs;
    var shuffled = opt.shuffled;

    var seats = [], hand = [], deck = [], board = [], dealerSeat = null;
    var currentBet = 0, minRaise = BB, phase = 'waiting', toAct = null, deadline = 0;
    var msg = '플레이어를 기다리는 중 (2명 이상 필요)', logs = [], handNo = 0;
    var finishAct = null, running = false, stopped = false;

    function pot() { return seats.reduce(function (s, p) { return s + p.total; }, 0); }
    function canAct(p) { return !p.folded && !p.allin; }
    function say(t) { logs.push(t); if (logs.length > 8) logs.shift(); }
    function find(id) { for (var i = 0; i < seats.length; i++) if (seats[i].id === id) return seats[i]; return null; }

    function snapshot() {
      return {
        phase: phase, handNo: handNo, board: board.slice(), pot: pot(), currentBet: currentBet, minRaise: minRaise,
        toAct: toAct, deadline: deadline, msg: msg, logs: logs.slice(), dealer: dealerSeat ? dealerSeat.id : null,
        sb: SB, bb: BB,
        seats: seats.map(function (s) {
          return {
            id: s.id, name: s.name, stack: s.stack, bet: s.bet, folded: s.folded, allin: s.allin,
            inHand: s.inHand, left: s.left, hasCards: s.hand.length > 0,
            hand: s.show ? s.hand.slice() : null, result: s.result
          };
        })
      };
    }
    function emit() { if (opt.onState) opt.onState(snapshot()); }

    /* ---------- 참가/퇴장 ---------- */
    function addPlayer(id, name, stack) {
      var s = find(id);
      if (s) { s.left = false; s.name = name; emit(); kick(); return { ok: true, stack: s.stack, rejoin: true }; }
      if (seats.filter(function (x) { return !x.left; }).length >= MAX) return { ok: false, reason: '자리가 꽉 찼어요' };
      if (!(stack > 0)) return { ok: false, reason: '바이인이 필요해요' };
      seats.push({ id: id, name: name, stack: Math.floor(stack), hand: [], bet: 0, total: 0, folded: true, allin: false, left: false, show: false, result: '', inHand: false });
      say(name + ' 입장'); emit(); kick();
      return { ok: true, stack: Math.floor(stack) };
    }
    function removePlayer(id) {
      var s = find(id); if (!s || s.left) return;
      s.left = true; say(s.name + ' 퇴장');
      if (phase === 'hand' && s.inHand) {
        s.folded = true; // 나간 사람은 즉시 폴드 처리 (칩은 팟에 남는다)
        if (toAct === id && finishAct) finishAct({ type: 'fold' });
      } else { seats = seats.filter(function (x) { return x !== s; }); }
      emit();
    }
    function rebuy(id, amount) {
      var s = find(id);
      if (!s || s.left || s.stack > 0 || !(amount > 0)) return { ok: false, reason: '지금은 추가 바이인이 안 돼요' };
      s.stack = Math.floor(amount); say(s.name + ' 리바이'); emit(); kick();
      return { ok: true, stack: s.stack };
    }

    /* ---------- 행동 ---------- */
    function action(id, a) {
      if (toAct !== id || !finishAct) return false;
      var p = find(id); if (!p || !a) return false;
      var t = a.type;
      if (t === 'fold') { finishAct({ type: 'fold' }); return true; }
      if (t === 'raise') {
        var to = Math.floor(Number(a.to));
        var maxTo = p.bet + p.stack, minTo = Math.min(currentBet + minRaise, maxTo);
        if (!isFinite(to) || maxTo <= currentBet) { finishAct({ type: 'call' }); return true; }
        to = Math.max(minTo, Math.min(maxTo, to));
        finishAct({ type: 'raise', to: to }); return true;
      }
      finishAct({ type: 'call' }); return true;
    }
    function getAction(p) {
      return new Promise(function (resolve) {
        var done = false, timer;
        function fin(x) {
          if (done) return; done = true; clearTimeout(timer);
          finishAct = null; toAct = null; resolve(x);
        }
        toAct = p.id; deadline = Date.now() + turnMs; finishAct = fin;
        timer = setTimeout(function () { fin(currentBet - p.bet > 0 ? { type: 'fold' } : { type: 'call' }); }, turnMs);
        if (p.left || stopped) fin({ type: 'fold' }); else emit();
      });
    }

    function post(p, amt) {
      var a = Math.max(0, Math.min(amt, p.stack));
      p.stack -= a; p.bet += a; p.total += a;
      if (p.stack === 0) p.allin = true;
      return a;
    }

    async function betRound(start) {
      var n = hand.length, i = start;
      var pending = new Set(hand.filter(canAct));
      while (!stopped) {
        var alive = hand.filter(function (p) { return !p.folded; });
        if (alive.length <= 1) return;
        var actable = hand.filter(canAct);
        if (actable.length === 0) return;
        if (actable.length === 1 && actable[0].bet >= currentBet) return;
        if (pending.size === 0) return;
        var p = null;
        for (var k = 0; k < n; k++) {
          var c = hand[(i + k) % n];
          if (pending.has(c)) { p = c; i = (i + k) % n; break; }
        }
        if (!p) return;
        pending.delete(p);
        var a = await getAction(p);
        var prev = currentBet;
        if (a.type === 'fold') { p.folded = true; say(p.name + ' 폴드'); }
        else if (a.type === 'call') {
          var paid = post(p, currentBet - p.bet);
          say(p.name + (paid === 0 ? ' 체크' : ' 콜 ' + paid + (p.allin ? ' (올인)' : '')));
        } else {
          post(p, Math.min(a.to, p.bet + p.stack) - p.bet);
          if (p.bet > prev) {
            minRaise = Math.max(minRaise, p.bet - prev); currentBet = p.bet;
            pending = new Set(hand.filter(function (x) { return canAct(x) && x !== p; }));
            say(p.name + (prev === 0 ? ' 베팅 ' : ' 레이즈 ') + p.bet + (p.allin ? ' (올인)' : ''));
          } else say(p.name + ' 콜 (올인)');
        }
        emit();
        i = (i + 1) % n;
      }
    }

    function buildPots() {
      var levels = Array.from(new Set(hand.map(function (p) { return p.total; }).filter(function (t) { return t > 0; })))
        .sort(function (a, b) { return a - b; });
      var prev = 0, pots = [], carry = 0;
      levels.forEach(function (lv) {
        var amt = carry;
        hand.forEach(function (p) { amt += Math.max(0, Math.min(p.total, lv) - prev); });
        var elig = hand.filter(function (p) { return !p.folded && p.total >= lv; });
        if (!elig.length) carry = amt; else { pots.push({ amt: amt, elig: elig }); carry = 0; }
        prev = lv;
      });
      if (carry > 0 && pots.length) pots[pots.length - 1].amt += carry;
      return pots;
    }

    function settle() {
      var alive = hand.filter(function (p) { return !p.folded; });
      var won = new Map(), total = pot(), text;
      if (alive.length === 1) {
        alive[0].stack += total; won.set(alive[0], total);
        text = alive[0].name + ' 승리 (전원 폴드) +' + total;
      } else {
        alive.forEach(function (p) { p.show = true; p.score = Poker.best(p.hand.concat(board)); });
        buildPots().forEach(function (pt) {
          var top = pt.elig.reduce(function (b, p) { return !b || Poker.cmp(p.score, b) > 0 ? p.score : b; }, null);
          var ws = pt.elig.filter(function (p) { return Poker.cmp(p.score, top) === 0; });
          var share = Math.floor(pt.amt / ws.length), rem = pt.amt - share * ws.length;
          ws.forEach(function (p, i) {
            var g = share + (i === 0 ? rem : 0);
            p.stack += g; won.set(p, (won.get(p) || 0) + g);
          });
        });
        var parts = [];
        won.forEach(function (v, p) { parts.push(p.name + ' ' + Poker.name(p.score) + ' +' + v); });
        text = parts.join(' / ');
      }
      won.forEach(function (v, p) { p.result = '+' + v; });
      hand.forEach(function (p) { p.bet = 0; p.total = 0; });
      msg = text; say(text);
    }

    async function playHand(elig) {
      handNo++; deck = shuffled(); board = []; hand = elig; phase = 'hand';
      seats.forEach(function (s) {
        var inH = elig.indexOf(s) >= 0;
        s.hand = []; s.bet = 0; s.total = 0; s.folded = !inH; s.allin = false; s.show = false; s.result = ''; s.inHand = inH;
      });
      var from = dealerSeat ? seats.indexOf(dealerSeat) : -1, next = null;
      for (var k = 1; k <= seats.length; k++) {
        var cand = seats[(from + k + seats.length) % seats.length];
        if (elig.indexOf(cand) >= 0) { next = cand; break; }
      }
      dealerSeat = next;
      var n = hand.length, d = hand.indexOf(dealerSeat);
      var sb = n === 2 ? d : (d + 1) % n, bb = n === 2 ? (d + 1) % n : (d + 2) % n;
      post(hand[sb], SB); post(hand[bb], BB);
      currentBet = BB; minRaise = BB;
      hand.forEach(function (p) {
        p.hand = [deck.pop(), deck.pop()];
        if (opt.onPrivate) opt.onPrivate(p.id, p.hand.slice(), handNo);
      });
      msg = '새 핸드 #' + handNo;
      say(hand[sb].name + ' SB ' + SB + ', ' + hand[bb].name + ' BB ' + BB);
      emit();
      await sleep(opt.dealMs == null ? 600 : opt.dealMs);
      await betRound((bb + 1) % n);
      var stages = [['플랍', 3], ['턴', 1], ['리버', 1]];
      for (var s = 0; s < stages.length && !stopped; s++) {
        if (hand.filter(function (p) { return !p.folded; }).length <= 1) break;
        for (var c = 0; c < stages[s][1]; c++) board.push(deck.pop());
        hand.forEach(function (p) { p.bet = 0; });
        currentBet = 0; minRaise = BB; msg = stages[s][0]; emit();
        await sleep(opt.streetMs == null ? 800 : opt.streetMs);
        await betRound((d + 1) % n);
      }
      if (!stopped) settle();
      phase = 'between'; toAct = null; emit();
    }

    async function loop() {
      if (running) return; running = true;
      try {
        while (!stopped) {
          seats = seats.filter(function (s) { return !s.left; });
          var elig = seats.filter(function (s) { return s.stack > 0; });
          if (elig.length < 2) {
            phase = 'waiting'; hand = []; toAct = null;
            seats.forEach(function (s) { s.show = false; s.hand = []; s.bet = 0; s.total = 0; });
            msg = '플레이어를 기다리는 중 (2명 이상 필요)'; emit(); return;
          }
          await playHand(elig);
          await sleep(betweenMs);
        }
      } finally { running = false; }
    }
    function kick() { if (!running && !stopped) loop(); }

    return {
      addPlayer: addPlayer, removePlayer: removePlayer, rebuy: rebuy, action: action,
      snapshot: snapshot, kick: kick,
      stop: function () { stopped = true; if (finishAct) finishAct({ type: 'fold' }); },
      _seats: function () { return seats; }
    };
  }

  var api = { createEngine: createEngine };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OnlineEngine = api;
})(typeof window !== 'undefined' ? window : this);
