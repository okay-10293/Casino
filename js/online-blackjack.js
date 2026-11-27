/* 온라인 블랙잭 엔진 (방장 브라우저에서 돈다). 딜러 한 명 vs 친구들, 최대 6명.
   베팅 시간 → 한 명씩 차례로 카드 받기/멈추기/2배 → 딜러 → 정산. 모든 카드는 공개라 비공개 메시지가 없다. */
(function (root) {
  'use strict';

  function createEngine(opt) {
    var MIN = 100, MAX = opt.maxSeats || 6;
    var sleep = opt.sleep || function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    var betMs = opt.betMs || 20000, turnMs = opt.turnMs || 25000;
    var betweenMs = opt.betweenMs == null ? 5000 : opt.betweenMs;
    var shuffled = opt.shuffled;

    var seats = [], dealer = [], deck = [], reveal = false;
    var phase = 'waiting', toAct = null, deadline = 0, round = 0;
    var msg = '칩이 있는 플레이어를 기다리는 중', logs = [];
    var finishAct = null, betWaiter = null, running = false, stopped = false;

    function say(t) { logs.push(t); if (logs.length > 8) logs.shift(); }
    function find(id) { for (var i = 0; i < seats.length; i++) if (seats[i].id === id) return seats[i]; return null; }
    function draw() { if (deck.length < 12) deck = shuffled(); return deck.pop(); }
    function score(h) {
      var t = 0, a = 0;
      h.forEach(function (c) { if (c.r === 14) { a++; t += 11; } else t += Math.min(c.r, 10); });
      while (t > 21 && a) { t -= 10; a--; }
      return t;
    }
    function isBJ(h) { return h.length === 2 && score(h) === 21; }

    function snapshot() {
      return {
        game: 'blackjack', phase: phase, round: round, toAct: toAct, deadline: deadline, msg: msg, logs: logs.slice(),
        minBet: MIN, handNo: round,
        dealer: {
          cards: dealer.map(function (c, i) { return (i === 1 && !reveal) ? null : c; }),
          total: dealer.length ? (reveal ? score(dealer) : score([dealer[0]])) : 0
        },
        seats: seats.map(function (s) {
          return {
            id: s.id, name: s.name, stack: s.stack, bet: s.bet, cards: s.hand.slice(), total: s.hand.length ? score(s.hand) : 0,
            state: s.state, result: s.result, left: s.left, inRound: s.inRound
          };
        })
      };
    }
    function emit() { if (opt.onState) opt.onState(snapshot()); }

    function addPlayer(id, name, stack) {
      var s = find(id);
      if (s) { s.left = false; s.name = name; emit(); kick(); return { ok: true, stack: s.stack, rejoin: true }; }
      if (seats.filter(function (x) { return !x.left; }).length >= MAX) return { ok: false, reason: '자리가 꽉 찼어요' };
      if (!(stack >= MIN)) return { ok: false, reason: '바이인이 부족해요' };
      seats.push({ id: id, name: name, stack: Math.floor(stack), bet: 0, hand: [], state: phase === 'betting' ? 'idle' : 'out', result: '', left: false, inRound: false, doubled: false });
      say(name + ' 입장'); emit(); kick();
      return { ok: true, stack: Math.floor(stack) };
    }
    function removePlayer(id) {
      var s = find(id); if (!s || s.left) return;
      s.left = true; say(s.name + ' 퇴장');
      if (s.inRound && (phase === 'playing' || phase === 'dealer')) {
        s.forfeit = true;                      // 판 도중에 나가면 그 판 베팅은 포기
        if (toAct === id && finishAct) finishAct('stand');
      } else if (phase === 'betting' && s.bet === 0) {
        seats = seats.filter(function (x) { return x !== s; });
      }
      checkAllBet(); emit();
    }
    function rebuy(id, amount) {
      var s = find(id);
      var inPlay = s && s.inRound && (phase === 'playing' || phase === 'dealer');
      if (!s || s.left || s.stack >= MIN || inPlay || !(amount >= MIN)) return { ok: false, reason: '지금은 추가 바이인이 안 돼요' };
      s.stack += Math.floor(amount);
      if (phase === 'betting') s.state = 'idle';
      say(s.name + ' 리바이'); emit(); kick();
      return { ok: true, stack: s.stack };
    }

    function checkAllBet() {
      if (phase !== 'betting' || !betWaiter) return;
      var open = seats.filter(function (s) { return !s.left && (s.state === 'idle'); });
      var bet = seats.filter(function (s) { return !s.left && s.state === 'bet'; });
      if (open.length === 0 && bet.length > 0) betWaiter();
    }

    function action(id, a) {
      if (!a) return false;
      var s = find(id); if (!s) return false;
      if (a.type === 'bet') {
        if (phase !== 'betting' || s.state !== 'idle' || s.left) return false;
        var amt = Math.floor(Number(a.amount) / 100) * 100;
        if (!isFinite(amt)) return false;
        amt = Math.max(MIN, Math.min(amt, s.stack));
        s.stack -= amt; s.bet = amt; s.state = 'bet';
        say(s.name + ' 베팅 ' + amt);
        emit(); checkAllBet(); return true;
      }
      if ((a.type === 'hit' || a.type === 'stand' || a.type === 'double') && toAct === id && finishAct) {
        finishAct(a.type); return true;
      }
      return false;
    }

    function getAction(s) {
      return new Promise(function (resolve) {
        var done = false, timer;
        function fin(x) { if (done) return; done = true; clearTimeout(timer); finishAct = null; toAct = null; resolve(x); }
        toAct = s.id; deadline = Date.now() + turnMs; finishAct = fin;
        timer = setTimeout(function () { fin('stand'); }, turnMs);
        if (s.left || stopped) fin('stand'); else emit();
      });
    }

    async function bettingPhase() {
      phase = 'betting'; reveal = false; dealer = []; round++; toAct = null;
      seats.forEach(function (s) {
        s.hand = []; s.bet = 0; s.doubled = false; s.result = ''; s.inRound = false; s.forfeit = false;
        s.state = s.stack >= MIN ? 'idle' : 'out';
      });
      msg = '베팅해주세요'; deadline = Date.now() + betMs; emit();
      await new Promise(function (res) {
        var t = setTimeout(res, betMs);
        betWaiter = function () { clearTimeout(t); res(); };
      });
      betWaiter = null;
    }

    async function playRound(players) {
      phase = 'playing'; deadline = 0;
      players.forEach(function (s) { s.inRound = true; s.state = 'playing'; });
      dealer = [draw(), draw()];
      players.forEach(function (s) { s.hand = [draw(), draw()]; if (isBJ(s.hand)) s.state = 'bj'; });
      msg = '카드를 나눴어요'; emit();
      await sleep(opt.dealMs == null ? 700 : opt.dealMs);
      var dealerBJ = isBJ(dealer);
      if (!dealerBJ) {
        for (var i = 0; i < players.length && !stopped; i++) {
          var s = players[i];
          while (s.state === 'playing' && !stopped) {
            msg = s.name + ' 차례';
            var a = await getAction(s);
            if (a === 'hit') s.hand.push(draw());
            else if (a === 'double' && s.hand.length === 2 && s.stack >= s.bet) { s.stack -= s.bet; s.bet *= 2; s.doubled = true; s.hand.push(draw()); say(s.name + ' 2배'); }
            else { s.state = 'stood'; continue; }
            var t = score(s.hand);
            if (t > 21) { s.state = 'bust'; say(s.name + ' 21 초과'); }
            else if (t === 21 || a === 'double') s.state = 'stood';
            emit();
          }
        }
      }
      // 딜러 차례
      phase = 'dealer'; reveal = true; msg = '딜러 차례'; emit();
      var live = players.some(function (s) { return s.state === 'stood' && !s.forfeit; });
      if (live && !dealerBJ) {
        while (score(dealer) < 17 && !stopped) { await sleep(opt.dealerMs == null ? 700 : opt.dealerMs); dealer.push(draw()); emit(); }
      }
      // 정산
      var d = score(dealer), parts = [];
      players.forEach(function (s) {
        var p = score(s.hand), pay = 0, text;
        if (s.forfeit) text = '나감';
        else if (s.state === 'bj' && dealerBJ) { pay = s.bet; text = '무승부'; }
        else if (s.state === 'bj') { pay = Math.floor(s.bet * 2.5); text = '블랙잭 +' + (pay - s.bet); }
        else if (dealerBJ) text = '딜러 블랙잭 -' + s.bet;
        else if (p > 21) text = '21 초과 -' + s.bet;
        else if (d > 21) { pay = s.bet * 2; text = '승리 +' + s.bet; }
        else if (p > d) { pay = s.bet * 2; text = '승리 +' + s.bet; }
        else if (p < d) text = '패배 -' + s.bet;
        else { pay = s.bet; text = '무승부'; }
        s.stack += pay; s.result = text; parts.push(s.name + ' ' + text);
      });
      msg = '딜러 ' + d + (d > 21 ? ' (21 초과)' : '') + ' · ' + parts.join(' / '); say(msg);
      phase = 'between'; toAct = null; emit();
    }

    async function loop() {
      if (running) return; running = true;
      try {
        while (!stopped) {
          seats = seats.filter(function (s) { return !s.left; });
          if (!seats.some(function (s) { return s.stack >= MIN; })) {
            phase = 'waiting'; dealer = []; toAct = null; deadline = 0;
            seats.forEach(function (s) { s.hand = []; s.bet = 0; s.state = 'out'; });
            msg = '칩이 있는 플레이어를 기다리는 중'; emit(); return;
          }
          await bettingPhase();
          if (stopped) break;
          var players = seats.filter(function (s) { return s.state === 'bet' && !s.left; });
          if (!players.length) { msg = '아무도 베팅하지 않아서 다시 시작해요'; emit(); await sleep(1200); continue; }
          await playRound(players);
          await sleep(betweenMs);
        }
      } finally { running = false; }
    }
    function kick() { if (!running && !stopped) loop(); }

    return {
      addPlayer: addPlayer, removePlayer: removePlayer, rebuy: rebuy, action: action,
      snapshot: snapshot, kick: kick, privateFor: function () { return null; },
      stop: function () { stopped = true; if (finishAct) finishAct('stand'); if (betWaiter) betWaiter(); },
      _seats: function () { return seats; }
    };
  }

  var api = { createEngine: createEngine };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.OnlineBlackjack = api;
})(typeof window !== 'undefined' ? window : this);
