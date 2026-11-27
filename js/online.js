/* 온라인 홀덤: Supabase Realtime(브로드캐스트+프레즌스)로 방을 만든다.
   방장 브라우저가 게임 진행을 맡고(online-engine.js), 다른 사람은 행동만 보내고 상태를 받아 그린다. */
(function () {
  'use strict';
  var C = Casino;
  var sb = window.CasinoSB;
  var root = document.getElementById('g-online');
  var BUYINS = [1000, 2000, 5000, 10000];
  var ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  root.innerHTML =
    '<div data-lobby class="lobby panel">' +
    '<h2>온라인 홀덤</h2>' +
    '<p>친구들이랑 같이 하는 홀덤이야. 2~6명이 칠 수 있어.</p>' +
    '<ol class="steps"><li><b>방 만들기</b>를 눌러 코드를 받아</li><li>코드나 초대 링크를 친구한테 보내</li><li>친구는 같은 주소로 들어와서 <b>코드를 넣고 입장</b></li></ol>' +
    '<label class="field">바이인<select id="on-buyin"></select></label>' +
    '<div class="actions"><button type="button" class="primary" data-create>방 만들기</button></div>' +
    '<div class="join-row"><input id="on-code" maxlength="4" placeholder="방 코드 4자리" autocomplete="off" autocapitalize="characters">' +
    '<button type="button" data-join>입장</button></div>' +
    '<p class="rule" data-status></p><div data-help></div></div>' +
    '<div data-table hidden>' +
    '<div class="room-bar"><span>방 코드 <b data-code></b></span><button type="button" data-copy class="ghost">초대 링크 복사</button></div>' +
    '<div class="felt poker-felt">' +
    '<div class="seats-top" data-top></div>' +
    '<div class="board-area"><div class="pot">팟 <b data-pot>0</b></div><div class="board" data-board></div><div class="msg" data-msg></div></div>' +
    '<div class="seat-me" data-me></div></div>' +
    '<div class="panel hctrl" data-ctrl></div>' +
    '<ul class="log" data-log></ul></div>';

  var q = function (s) { return root.querySelector(s); };
  q('[data-help]').appendChild(C.holdemHelp());
  var lobbyEl = q('[data-lobby]'), tableEl = q('[data-table]'), statusEl = q('[data-status]');
  var topEl = q('[data-top]'), meEl = q('[data-me]'), boardEl = q('[data-board]'), potEl = q('[data-pot]');
  var msgEl = q('[data-msg]'), ctrlEl = q('[data-ctrl]'), logEl = q('[data-log]');
  var buyinSel = q('#on-buyin'), codeInput = q('#on-code');
  BUYINS.forEach(function (v) {
    var o = document.createElement('option'); o.value = v; o.textContent = C.fmt(v); buyinSel.appendChild(o);
  });
  buyinSel.value = 2000;

  if (!sb) {
    statusEl.textContent = '서버 라이브러리를 불러오지 못했어. 새로고침하거나 네트워크를 확인해줘.';
    root.querySelectorAll('button, input, select').forEach(function (e) { e.disabled = true; });
    return;
  }

  var channel = null, role = null, code = '', me = null, engine = null;
  var snap = null, myHand = [], localDeadline = 0, hostKey = null, busy = false;
  var sendTimer = null, pendingState = null, ctrlKey = '', clock = null;

  function setStatus(t) { statusEl.textContent = t || ''; }
  function genCode() { var s = ''; for (var i = 0; i < 4; i++) s += ALPHA.charAt(C.rand(ALPHA.length)); return s; }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function send(payload) { return channel.send({ type: 'broadcast', event: 'msg', payload: payload }); }

  /* ---------- 연결 ---------- */
  function hostFromPresence() {
    var st = channel.presenceState(), found = null;
    Object.keys(st).forEach(function (k) {
      (st[k] || []).forEach(function (m) { if (m && m.host) found = k; });
    });
    return found;
  }

  async function connect(roomCode, asRole) {
    var ch = sb.channel('casino-room-' + roomCode, { config: { broadcast: { self: false }, presence: { key: me.id } } });
    channel = ch;
    ch.on('broadcast', { event: 'msg' }, function (m) { onMessage(m.payload || {}); });
    ch.on('presence', { event: 'sync' }, function () { hostKey = hostFromPresence(); });
    ch.on('presence', { event: 'leave' }, function (e) {
      var key = e && (e.key || (e.leftPresences && e.leftPresences[0] && e.leftPresences[0].key));
      if (!key) return;
      if (role === 'host' && engine) engine.removePlayer(key);
      if (role === 'guest' && key === hostKey) { hostKey = null; hostGone(); }
    });
    var ok = await new Promise(function (resolve) {
      var t = setTimeout(function () { resolve(false); }, 9000);
      ch.subscribe(function (status) {
        if (status === 'SUBSCRIBED') { clearTimeout(t); resolve(true); }
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { clearTimeout(t); resolve(false); }
      });
    });
    if (!ok) { await sb.removeChannel(ch); channel = null; return 'error'; }
    await ch.track({ name: me.name, host: asRole === 'host' });
    for (var i = 0; i < 12; i++) {           // 프레즌스 동기화를 최대 3초 기다림
      await wait(250);
      hostKey = hostFromPresence();
      if (asRole === 'guest' && hostKey) break;
      if (asRole === 'host' && i >= 3) break;
    }
    if (asRole === 'host' && hostKey && hostKey !== me.id) { await sb.removeChannel(ch); channel = null; return 'taken'; }
    if (asRole === 'guest' && !hostKey) { await sb.removeChannel(ch); channel = null; return 'nohost'; }
    return 'ok';
  }

  async function closeChannel() {
    clearTimeout(sendTimer); sendTimer = null; pendingState = null;
    if (channel) { try { await sb.removeChannel(channel); } catch (e) {} }
    channel = null;
  }

  /* ---------- 방 만들기 / 입장 ---------- */
  function readBuyin() {
    var v = Number(buyinSel.value);
    if (C.money() < v) { setStatus('게임머니가 부족해. 바이인을 낮춰줘.'); return 0; }
    return v;
  }
  function prepareMe() { me = { id: C.playerId(), name: C.playerName() }; }

  async function createRoom() {
    if (busy) return; var buyin = readBuyin(); if (!buyin) return;
    busy = true; setStatus('방을 만드는 중…'); prepareMe();
    var result = 'error';
    for (var i = 0; i < 4; i++) {
      code = genCode(); result = await connect(code, 'host');
      if (result !== 'taken') break;
    }
    if (result !== 'ok') { busy = false; return setStatus('방을 만들지 못했어. 잠시 뒤 다시 해봐.'); }
    role = 'host';
    engine = OnlineEngine.createEngine({
      shuffled: C.Cards.shuffled,
      onState: function (s) { onEngineState(s); },
      onPrivate: function (id, cards) {
        if (id === me.id) { myHand = cards; render(); } else send({ t: 'hand', to: id, cards: cards });
      }
    });
    C.add(-buyin); C.setTable(buyin);
    engine.addPlayer(me.id, me.name, buyin);
    enterTable(); busy = false;
  }

  async function joinRoom(roomCode) {
    if (busy) return; var buyin = readBuyin(); if (!buyin) return;
    roomCode = (roomCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (roomCode.length !== 4) return setStatus('방 코드는 4자리야.');
    busy = true; setStatus('방을 찾는 중…'); prepareMe(); code = roomCode;
    var result = await connect(code, 'guest');
    if (result === 'nohost') { busy = false; return setStatus('그 코드의 방이 없어.'); }
    if (result !== 'ok') { busy = false; return setStatus('연결하지 못했어. 잠시 뒤 다시 해봐.'); }
    role = 'guest';
    var ack = await new Promise(function (resolve) {
      var t = setTimeout(function () { joinWaiter = null; resolve(null); }, 6000);
      joinWaiter = function (a) { clearTimeout(t); joinWaiter = null; resolve(a); };
      send({ t: 'join', id: me.id, name: me.name, stack: buyin });
    });
    if (!ack || !ack.ok) {
      await closeChannel(); role = null; busy = false;
      return setStatus(ack ? (ack.reason || '입장하지 못했어.') : '방장이 응답하지 않아.');
    }
    C.add(-buyin); C.setTable(buyin);
    enterTable(); busy = false;
  }
  var joinWaiter = null;

  function enterTable() {
    setStatus(''); lobbyEl.hidden = true; tableEl.hidden = false;
    q('[data-code]').textContent = code;
    clearInterval(clock); clock = setInterval(tick, 500);
    if (role === 'guest') send({ t: 'hello', id: me.id });
    render();
  }

  async function leaveRoom(refund) {
    var stack = 0;
    if (snap) { var mine = snap.seats.filter(function (s) { return s.id === me.id; })[0]; if (mine) stack = mine.stack; }
    var was = role, eng = engine;
    role = null;                       // 이후 들어오는 상태/이벤트는 무시한다
    if (was === 'host') {
      try { await send({ t: 'bye' }); } catch (e) {}
      eng.stop();
    } else if (was === 'guest' && refund) {
      try { await send({ t: 'leave', id: me.id }); } catch (e) {}
    }
    await closeChannel();
    clearInterval(clock);
    if (stack > 0) C.add(stack);
    C.setTable(0);
    if (refund !== false) C.toast(stack > 0 ? C.fmt(stack) + ' 칩을 지갑으로 가져왔어' : '방에서 나왔어');
    engine = null; snap = null; myHand = []; ctrlKey = '';
    lobbyEl.hidden = false; tableEl.hidden = true; busy = false; setStatus('');
  }

  function hostGone() {
    C.toast('방장이 나가서 방이 닫혔어');
    leaveRoom(false).then(function () { /* 칩은 leaveRoom에서 돌려줌 */ });
  }

  /* ---------- 메시지 ---------- */
  function onMessage(m) {
    if (role === 'host') {
      if (m.t === 'join') {
        var r = engine.addPlayer(String(m.id), String(m.name || '').slice(0, 10) || '손님', Number(m.stack));
        send({ t: 'ack', to: m.id, kind: 'join', ok: r.ok, reason: r.reason });
        pushState(true);
      } else if (m.t === 'hello') {
        pushState(true);
        var seat = engine._seats().filter(function (s) { return s.id === m.id; })[0];
        if (seat && seat.hand.length && !seat.folded) send({ t: 'hand', to: m.id, cards: seat.hand });
      } else if (m.t === 'action') {
        engine.action(String(m.id), m.a);
      } else if (m.t === 'leave') {
        engine.removePlayer(String(m.id));
      } else if (m.t === 'rebuy') {
        var rb = engine.rebuy(String(m.id), Number(m.amount));
        send({ t: 'ack', to: m.id, kind: 'rebuy', ok: rb.ok, amount: m.amount, reason: rb.reason });
      }
      return;
    }
    if (role === 'guest' || joinWaiter) {
      if (m.t === 'ack' && m.to === me.id) {
        if (m.kind === 'join' && joinWaiter) joinWaiter(m);
        else if (m.kind === 'rebuy') {
          if (m.ok) { C.add(-Number(m.amount)); C.toast('리바이 완료'); }
          else C.toast(m.reason || '리바이가 안 됐어');
        }
      } else if (m.t === 'state' && role === 'guest') {
        applyState(m.s);
      } else if (m.t === 'hand' && m.to === me.id) {
        myHand = m.cards || []; render();
      } else if (m.t === 'bye' && role === 'guest') {
        hostGone();
      }
    }
  }

  /* 상태 전파 (너무 자주 보내지 않게 합친다) */
  function onEngineState(s) {
    if (!role || !channel) return;
    s.turnLeft = s.toAct ? Math.max(0, s.deadline - Date.now()) : 0;
    applyState(s);
    pendingState = s;
    if (!sendTimer) sendTimer = setTimeout(function () { sendTimer = null; if (pendingState) { send({ t: 'state', s: pendingState }); pendingState = null; } }, 70);
  }
  function pushState(force) {
    if (!engine) return;
    var s = engine.snapshot(); s.turnLeft = s.toAct ? Math.max(0, s.deadline - Date.now()) : 0;
    pendingState = s;
    if (force) { clearTimeout(sendTimer); sendTimer = null; send({ t: 'state', s: s }); pendingState = null; }
  }
  function applyState(s) {
    if (!role) return;
    var prevHand = snap ? snap.handNo : 0;
    snap = s; localDeadline = Date.now() + (s.turnLeft || 0);
    if (s.handNo !== prevHand && s.phase === 'hand' && role === 'guest') myHand = [];
    var mine = s.seats.filter(function (x) { return x.id === me.id; })[0];
    if (mine) C.setTable(mine.stack);
    render();
  }

  function act(a) {
    if (role === 'host') engine.action(me.id, a);
    else send({ t: 'action', id: me.id, a: a });
    ctrlEl.innerHTML = ''; ctrlKey = '';
  }

  /* ---------- 그리기 ---------- */
  function seatEl(s, isMe) {
    var d = document.createElement('div');
    d.className = 'pseat' + (s.folded && s.inHand ? ' folded' : '') + (snap.toAct === s.id ? ' acting' : '') + (isMe ? ' me' : '') + (s.left ? ' folded' : '');
    var head = document.createElement('div'); head.className = 'ph';
    var nm = document.createElement('span'); nm.className = 'pn'; nm.textContent = s.name + (isMe ? ' (나)' : '');
    head.appendChild(nm);
    if (snap.dealer === s.id) { var db = document.createElement('i'); db.className = 'dbtn'; db.textContent = 'D'; head.appendChild(db); }
    d.appendChild(head);
    var st = document.createElement('div'); st.className = 'pstack'; st.textContent = C.fmt(s.stack); d.appendChild(st);
    var cards = document.createElement('div'); cards.className = 'hand small';
    if (isMe && myHand.length && s.inHand) myHand.forEach(function (c) { cards.appendChild(C.Cards.el(c)); });
    else if (s.hand) s.hand.forEach(function (c) { cards.appendChild(C.Cards.el(c)); });
    else if (s.hasCards && s.inHand) { cards.appendChild(C.Cards.el(null, true)); cards.appendChild(C.Cards.el(null, true)); }
    d.appendChild(cards);
    var note = document.createElement('div'); note.className = 'pnote';
    var t = [];
    if (s.left) t.push('나감'); else if (s.folded && s.inHand) t.push('폴드'); else if (s.allin) t.push('올인');
    if (s.bet && !s.folded) t.push('베팅 ' + C.fmt(s.bet));
    note.textContent = t.join(' · ');
    if (s.result) { note.textContent = s.result; note.classList.add('res'); }
    if (snap.toAct === s.id) { var tm = document.createElement('span'); tm.className = 'timer'; tm.setAttribute('data-timer', ''); note.appendChild(document.createTextNode(' ')); note.appendChild(tm); }
    d.appendChild(note);
    return d;
  }

  function render() {
    if (!snap || tableEl.hidden) return;
    topEl.innerHTML = ''; meEl.innerHTML = '';
    var mine = null;
    snap.seats.forEach(function (s) {
      if (s.id === me.id) { mine = s; meEl.appendChild(seatEl(s, true)); } else topEl.appendChild(seatEl(s, false));
    });
    boardEl.innerHTML = '';
    for (var i = 0; i < 5; i++) {
      boardEl.appendChild(snap.board[i] ? C.Cards.el(snap.board[i]) : Object.assign(document.createElement('div'), { className: 'card slot' }));
    }
    potEl.textContent = C.fmt(snap.pot);
    msgEl.textContent = snap.msg;
    logEl.innerHTML = '';
    snap.logs.slice().reverse().forEach(function (t) { var li = document.createElement('li'); li.textContent = t; logEl.appendChild(li); });
    renderControls(mine);
    tick();
  }

  function tick() {
    var el = root.querySelector('[data-timer]');
    if (el && snap && snap.toAct) el.textContent = Math.max(0, Math.ceil((localDeadline - Date.now()) / 1000)) + '초';
  }

  function renderControls(mine) {
    var key;
    if (!mine) { ctrlEl.innerHTML = ''; return; }
    var myTurn = snap.toAct === me.id;
    var busted = mine.stack === 0 && !(snap.phase === 'hand' && mine.inHand);
    key = [snap.handNo, snap.phase, snap.toAct, snap.currentBet, snap.board.length, mine.stack, busted].join('|');
    if (key === ctrlKey) return;
    ctrlKey = key;
    ctrlEl.innerHTML = '';
    ctrlEl.onclick = null;

    if (myTurn) {
      var toCall = Math.min(snap.currentBet - mine.bet, mine.stack);
      var maxTo = mine.bet + mine.stack, minTo = Math.min(snap.currentBet + snap.minRaise, maxTo);
      var canRaise = maxTo > snap.currentBet;
      var sized = function (f) {
        var to = snap.currentBet + Math.round((snap.pot + (snap.currentBet - mine.bet)) * f / 10) * 10;
        return Math.max(minTo, Math.min(maxTo, to));
      };
      ctrlEl.innerHTML =
        '<div class="actions"><button type="button" data-a="fold">폴드</button>' +
        '<button type="button" class="primary" data-a="call">' + (toCall === 0 ? '넘기기<small>체크</small>' : '맞추기 ' + C.fmt(toCall) + '<small>콜</small>') + '</button>' +
        (canRaise ? '<button type="button" class="primary" data-a="raise">' + (snap.currentBet === 0 ? '베팅하기' : '올리기<small>레이즈</small>') + ' <b data-rv>' + C.fmt(minTo) + '</b></button>' : '') + '</div>' +
        (canRaise ? '<div class="raise-row"><input type="range" id="on-raise" min="' + minTo + '" max="' + maxTo + '" step="10" value="' + minTo + '">' +
          '<div class="presets"><button type="button" data-set="' + minTo + '">최소</button><button type="button" data-set="' + sized(0.5) + '">1/2 팟</button>' +
          '<button type="button" data-set="' + sized(1) + '">팟</button><button type="button" data-set="' + maxTo + '">올인</button></div></div>' : '');
      var range = ctrlEl.querySelector('#on-raise'), rv = ctrlEl.querySelector('[data-rv]');
      if (range) range.addEventListener('input', function () { rv.textContent = C.fmt(Number(range.value)); });
      ctrlEl.onclick = function (e) {
        var b = e.target.closest('button'); if (!b) return;
        if (b.dataset.set && range) { range.value = b.dataset.set; rv.textContent = C.fmt(Number(range.value)); return; }
        if (b.dataset.a === 'fold') act({ type: 'fold' });
        else if (b.dataset.a === 'call') act({ type: 'call' });
        else if (b.dataset.a === 'raise') act({ type: 'raise', to: Number(range.value) });
      };
    } else {
      var info = document.createElement('p'); info.className = 'rule';
      info.textContent = busted ? '칩이 다 떨어졌어. 리바이하면 다음 핸드부터 다시 참여해.'
        : snap.phase === 'waiting' ? '친구를 기다리는 중이야. 코드 ' + code + ' 를 알려줘.'
        : snap.phase === 'between' ? '곧 다음 핸드가 시작돼.'
        : (snap.toAct ? '다른 사람 차례야.' : '진행 중…');
      ctrlEl.appendChild(info);
      var row = document.createElement('div'); row.className = 'actions';
      if (busted) {
        BUYINS.slice(0, 3).forEach(function (v) {
          var b = document.createElement('button'); b.type = 'button'; b.className = 'primary';
          b.textContent = C.fmt(v) + ' 리바이'; b.disabled = C.money() < v;
          b.addEventListener('click', function () {
            if (role === 'host') {
              var r = engine.rebuy(me.id, v); if (r.ok) C.add(-v); else C.toast(r.reason);
            } else send({ t: 'rebuy', id: me.id, amount: v });
          });
          row.appendChild(b);
        });
      }
      var lv = document.createElement('button'); lv.type = 'button';
      lv.textContent = role === 'host' ? '방 닫고 나가기' : '나가기 (' + C.fmt(mine.stack) + ')';
      lv.addEventListener('click', function () { leaveRoom(true); });
      row.appendChild(lv);
      ctrlEl.appendChild(row);
    }
  }

  /* ---------- 로비 이벤트 ---------- */
  q('[data-create]').addEventListener('click', createRoom);
  q('[data-join]').addEventListener('click', function () { joinRoom(codeInput.value); });
  codeInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') joinRoom(codeInput.value); });
  q('[data-copy]').addEventListener('click', function () {
    var link = location.origin + location.pathname + '?room=' + code + '#online';
    var done = function () { C.toast('초대 링크를 복사했어'); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done, function () { C.toast('방 코드: ' + code); });
    else C.toast('방 코드: ' + code);
  });
  document.addEventListener('casino:reset', function () { if (role) location.reload(); });
  window.addEventListener('beforeunload', function () { if (role === 'host' && channel) { try { send({ t: 'bye' }); } catch (e) {} } });

  // 초대 링크(?room=ABCD)로 들어오면 온라인 탭을 열고 코드를 채운다
  document.addEventListener('casino:init', function () {
    var p = new URLSearchParams(location.search).get('room');
    if (p) { codeInput.value = p.toUpperCase().slice(0, 4); location.hash = '#online'; setStatus('바이인을 고르고 입장을 눌러줘.'); }
  });
})();
