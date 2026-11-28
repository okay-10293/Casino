/* 온라인(친구랑 같이): Supabase Realtime(브로드캐스트+프레즌스)로 방을 만든다. 게임은 홀덤 또는 블랙잭.
   방장 브라우저가 게임 진행을 맡고(online-engine.js / online-blackjack.js), 다른 사람은 행동만 보내고 상태를 받아 그린다. */
(function () {
  'use strict';
  var C = Casino;
  var sb = window.CasinoSB;
  var root = document.getElementById('g-online');
  var ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  root.innerHTML =
    '<div data-lobby class="lobby panel">' +
    '<h2>친구랑 같이 하기 <small class="who" data-who></small></h2>' +
    '<p>친구들이랑 같이 하는 방이야. 홀덤이나 블랙잭을 2~6명이 할 수 있어. 열린 방에서 <b>입장</b>을 누르거나, 게임을 골라 직접 방을 만들어봐.</p>' +
    '<div class="field"><span>바이인 (전 재산의 80%까지)</span><div data-buyin></div></div>' +
    '<div class="rooms" data-rooms></div>' +
    '<div class="field"><span>만들 방의 게임</span><div data-game-slot></div></div>' +
    '<div class="field"><span>방 제목 (비워두면 내 이름으로)</span><input class="txt" data-title maxlength="14" placeholder="예: 초보 환영" autocomplete="off" autocorrect="off" enterkeyhint="done"></div>' +
    '<div class="actions"><button type="button" class="primary" data-create>방 만들기</button></div>' +
    '<details class="code-join"><summary>코드로 입장하기</summary>' +
    '<div class="join-row"><input id="on-code" maxlength="4" placeholder="방 코드 4자리" autocomplete="off" autocapitalize="characters" autocorrect="off" spellcheck="false" enterkeyhint="go">' +
    '<button type="button" data-join>입장</button></div></details>' +
    '<p class="rule" data-status></p><div data-help></div></div>' +
    '<div data-table hidden>' +
    '<div class="room-bar"><span><span data-gamename></span> · 방 코드 <b data-code></b></span><button type="button" data-copy class="ghost">초대 링크 복사</button></div>' +
    '<div class="felt poker-felt">' +
    '<div class="seats-top" data-top></div>' +
    '<div class="board-area"><div class="pot"><span data-potlabel>팟</span> <b data-pot>0</b></div><div class="board" data-board></div><div class="msg" data-msg></div></div>' +
    '<div class="seat-me" data-me></div></div>' +
    '<div class="panel hctrl" data-ctrl></div>' +
    '<ul class="log" data-log></ul><div data-ranks></div></div>';

  var gameSeg = C.segmented([{ value: 'holdem', label: '텍사스 홀덤' }, { value: 'blackjack', label: '블랙잭' }], 'holdem');
  gameSeg.id = 'on-game';
  root.querySelector('[data-game-slot]').appendChild(gameSeg);
  var q = function (s) { return root.querySelector(s); };
  q('[data-help]').appendChild(C.holdemHelp());
  q('[data-help]').appendChild(bjHelp());
  q('[data-ranks]').appendChild(C.handTable());
  var buyinPick = C.buyinPicker();
  q('[data-buyin]').appendChild(buyinPick.el);
  var lobbyEl = q('[data-lobby]'), tableEl = q('[data-table]'), statusEl = q('[data-status]');
  var topEl = q('[data-top]'), meEl = q('[data-me]'), boardEl = q('[data-board]'), potEl = q('[data-pot]');
  var msgEl = q('[data-msg]'), ctrlEl = q('[data-ctrl]'), logEl = q('[data-log]');
  var codeInput = q('#on-code'), gameSel = q('#on-game');
  var roomsEl = q('[data-rooms]'), whoEl = q('[data-who]'), titleInput = q('[data-title]'), codeBox = q('.code-join');

  if (!sb) {
    statusEl.textContent = '서버 라이브러리를 불러오지 못했어. 새로고침하거나 네트워크를 확인해줘.';
    root.querySelectorAll('button, input, select').forEach(function (e) { e.disabled = true; });
    return;
  }

  var channel = null, role = null, code = '', me = null, engine = null;
  var snap = null, myHand = [], myHandNo = 0, localDeadline = 0, hostKey = null, busy = false;
  var sendTimer = null, pendingState = null, ctrlKey = '', clock = null;
  var roomGame = 'holdem', hostGame = null, bjBet = 0, lastBjBet = 0;
  var GAME_NAMES = { holdem: '텍사스 홀덤', blackjack: '블랙잭' };
  function bjMin() { return 100 * C.scale; }      // 혼자 하는 블랙잭과 같은 최소 베팅

  function bjHelp() {
    var d = document.createElement('details'); d.className = 'help';
    d.innerHTML = '<summary>블랙잭이 처음이면</summary><ul>' +
      '<li>다 같이 딜러 한 명이랑 겨뤄. 친구끼리 싸우는 게 아니야.</li>' +
      '<li>카드 합을 <b>21에 가깝게</b> 만들면 이겨. 21을 넘으면 져.</li>' +
      '<li>베팅 시간 안에 베팅하면, 한 명씩 차례로 <b>카드 받기 / 멈추기 / 2배로 한 장</b>을 골라.</li>' +
      '<li>처음 두 장이 21이면 <b>블랙잭</b>(1.5배 보너스). 동점은 베팅금 반환.</li>' +
      '<li>딜러는 합이 17이 될 때까지 카드를 받아.</li>' +
      '<li>판 도중에 나가면 그 판 베팅은 돌려받지 못해.</li></ul>';
    return d;
  }
  function setStatus(t) { statusEl.textContent = t || ''; }
  function genCode() { var s = ''; for (var i = 0; i < 4; i++) s += ALPHA.charAt(C.rand(ALPHA.length)); return s; }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function send(payload) { return channel.send({ type: 'broadcast', event: 'msg', payload: payload }); }

  /* ---------- 연결 ---------- */
  function hostFromPresence() {
    var st = channel.presenceState(), found = null;
    Object.keys(st).forEach(function (k) {
      (st[k] || []).forEach(function (m) { if (m && m.host) { found = k; hostGame = m.game === 'blackjack' ? 'blackjack' : 'holdem'; } });
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
    await ch.track({ name: me.name, host: asRole === 'host', game: roomGame });
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

  /* ---------- 대기실: 공용 채널의 프레즌스로 열린 방 목록을 공유한다 ----------
     방장은 자기 방(제목/인원/진행 여부)을 올리고, 대기실에 있는 사람은 목록을 보고 바로 입장한다. */
  var lobbyCh = null, lobbyUp = false, adKey = '', curTab = '', roomTitle = '';

  async function lobbyOpen() {
    if (lobbyCh || !sb) return;
    if (!me) prepareMe();
    var ch = sb.channel('casino-lobby', { config: { broadcast: { self: false }, presence: { key: me.id } } });
    lobbyCh = ch;
    ch.on('presence', { event: 'sync' }, renderRooms);
    ch.subscribe(function (status) {
      if (ch !== lobbyCh) return;
      if (status === 'SUBSCRIBED') { lobbyUp = true; adKey = ''; trackLobby(); renderRooms(); }
    });
  }
  async function lobbyClose() {
    var ch = lobbyCh; lobbyCh = null; lobbyUp = false; adKey = '';
    roomsEl.innerHTML = ''; whoEl.textContent = '';
    if (ch) { try { await sb.removeChannel(ch); } catch (e) {} }
  }
  // 내 상태를 올린다. 방장이면 방 정보도 같이. 바뀐 게 없으면 다시 올리지 않는다.
  function trackLobby() {
    if (!lobbyCh || !lobbyUp) return;
    var ad = { name: me.name };
    if (role === 'host' && snap) {
      ad.room = code; ad.title = roomTitle; ad.game = roomGame; ad.max = 6;
      ad.n = snap.seats.filter(function (x) { return !x.left; }).length;
      ad.live = snap.phase === 'waiting' ? 0 : 1;
    }
    var k = JSON.stringify(ad);
    if (k === adKey) return;
    adKey = k; lobbyCh.track(ad);
  }
  function renderRooms() {
    if (!lobbyCh || role) return;
    var st = lobbyCh.presenceState(), rooms = [], count = 0;
    Object.keys(st).forEach(function (k) {
      count++;
      var metas = st[k] || [], m = metas[metas.length - 1];
      if (m && m.room && /^[A-Z0-9]{4}$/.test(String(m.room))) rooms.push(m);
    });
    rooms.sort(function (a, b) { return (a.live ? 1 : 0) - (b.live ? 1 : 0) || (Number(b.n) || 0) - (Number(a.n) || 0); });
    whoEl.textContent = '지금 ' + count + '명';
    roomsEl.innerHTML = '';
    if (!rooms.length) {
      var none = document.createElement('p'); none.className = 'rule';
      none.textContent = '열린 방이 없어. 방을 만들어서 친구를 불러봐!';
      roomsEl.appendChild(none); return;
    }
    rooms.forEach(function (m) {
      // 남이 보낸 글자라서 전부 textContent로만 넣는다
      var n = Math.max(0, Math.min(6, Number(m.n) || 0)), max = Math.max(2, Math.min(6, Number(m.max) || 6));
      var row = document.createElement('div'); row.className = 'room';
      var info = document.createElement('div'); info.className = 'rinfo';
      var t = document.createElement('b'); t.textContent = String(m.title || '').slice(0, 14) || '이름 없는 방';
      var sub = document.createElement('small');
      ['방장 ' + String(m.name || '').slice(0, 10), m.game === 'blackjack' ? '블랙잭' : '홀덤', '코드 ' + m.room, n + '/' + max + '명', m.live ? '게임 중' : '대기 중']
        .forEach(function (part, i) {                      // 조각 단위로만 줄바꿈 ("1/6\n명" 방지)
          if (i) sub.appendChild(document.createTextNode(' · '));
          var sp = document.createElement('span'); sp.textContent = part; sub.appendChild(sp);
        });
      info.appendChild(t); info.appendChild(sub);
      var go = document.createElement('button'); go.type = 'button'; go.className = 'primary';
      go.textContent = n >= max ? '꽉 참' : '입장'; go.disabled = n >= max;
      go.addEventListener('click', function () { joinRoom(m.room); });
      row.appendChild(info); row.appendChild(go); roomsEl.appendChild(row);
    });
  }
  document.addEventListener('casino:tab', function (e) {
    curTab = e.detail;
    if (curTab === 'online') { if (!role) lobbyOpen(); }
    else if (role !== 'host') lobbyClose();     // 방장은 다른 탭을 봐도 방 광고를 유지한다
  });

  /* ---------- 방 만들기 / 입장 ---------- */
  function readBuyin(game) {
    var v = buyinPick.read(); if (!v) return 0;
    if (game === 'blackjack' && v < bjMin()) { C.toast('블랙잭 방은 바이인이 최소 ' + C.fmt(bjMin()) + '이야'); return 0; }
    return v;
  }
  function prepareMe() { me = { id: C.playerId(), name: C.playerName() }; }

  async function createRoom() {
    if (busy) return;
    roomGame = gameSel.value === 'blackjack' ? 'blackjack' : 'holdem';
    var buyin = readBuyin(roomGame); if (!buyin) return;
    busy = true; setStatus('방을 만드는 중…'); prepareMe();
    var result = 'error';
    for (var i = 0; i < 4; i++) {
      code = genCode(); result = await connect(code, 'host');
      if (result !== 'taken') break;
    }
    if (result !== 'ok') { busy = false; return setStatus('방을 만들지 못했어. 잠시 뒤 다시 해봐.'); }
    role = 'host';
    roomTitle = (titleInput.value || '').trim().slice(0, 14) || (me.name + '의 방');
    engine = (roomGame === 'blackjack' ? OnlineBlackjack : OnlineEngine).createEngine({
      shuffled: C.Cards.shuffled,
      minBet: bjMin(),
      onState: function (s) { onEngineState(s); },
      onPrivate: function (id, cards, no) {
        if (id === me.id) { myHand = cards; myHandNo = no; render(); } else send({ t: 'hand', to: id, cards: cards, no: no });
      }
    });
    C.add(-buyin); C.setTable(buyin);
    lobbyOpen();
    engine.addPlayer(me.id, me.name, buyin);
    enterTable(); busy = false;
  }

  async function joinRoom(roomCode) {
    if (busy) return; var buyin = buyinPick.read(); if (!buyin) return;
    roomCode = (roomCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (roomCode.length !== 4) return setStatus('방 코드는 4자리야.');
    busy = true; setStatus('방을 찾는 중…'); prepareMe(); code = roomCode;
    var result = await connect(code, 'guest');
    if (result === 'nohost') { busy = false; return setStatus('그 코드의 방이 없어.'); }
    if (result !== 'ok') { busy = false; return setStatus('연결하지 못했어. 잠시 뒤 다시 해봐.'); }
    role = 'guest'; roomGame = hostGame || 'holdem';
    if (roomGame === 'blackjack' && buyin < bjMin()) {
      await closeChannel(); role = null; busy = false;
      return setStatus('이 방은 블랙잭이야. 바이인이 최소 ' + C.fmt(bjMin()) + '이어야 해.');
    }
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
    q('[data-gamename]').textContent = GAME_NAMES[roomGame];
    q('[data-potlabel]').textContent = roomGame === 'blackjack' ? '딜러' : '팟';
    q('[data-ranks]').hidden = roomGame === 'blackjack';
    bjBet = 0; ctrlKey = '';
    clearInterval(clock); clock = setInterval(tick, 500);
    if (role === 'guest') { lobbyClose(); send({ t: 'hello', id: me.id }); }
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
    engine = null; snap = null; myHand = []; myHandNo = 0; ctrlKey = '';
    lobbyEl.hidden = false; tableEl.hidden = true; busy = false; setStatus('');
    await lobbyClose();                       // 방장이었다면 방 광고도 내린다
    if (curTab === 'online') lobbyOpen();
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
        if (roomGame === 'holdem' && seat && seat.hand.length && !seat.folded) send({ t: 'hand', to: m.id, cards: seat.hand, no: engine.snapshot().handNo });
      } else if (m.t === 'needhand') {
        // 손님이 이번 핸드 패를 못 받았다고 다시 요청 (브로드캐스트는 유실될 수 있다)
        var ns = engine._seats().filter(function (s) { return s.id === m.id; })[0];
        if (roomGame === 'holdem' && ns && ns.hand.length && !ns.folded) send({ t: 'hand', to: m.id, cards: ns.hand, no: engine.snapshot().handNo });
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
        myHand = m.cards || []; myHandNo = Number(m.no) || 0; render();
      } else if (m.t === 'bye' && role === 'guest') {
        hostGone();
      }
    }
  }

  /* 상태 전파 (너무 자주 보내지 않게 합친다) */
  function onEngineState(s) {
    if (!role || !channel) return;
    s.turnLeft = (s.toAct || s.phase === 'betting') ? Math.max(0, s.deadline - Date.now()) : 0;
    applyState(s);
    pendingState = s;
    if (!sendTimer) sendTimer = setTimeout(function () { sendTimer = null; if (pendingState) { send({ t: 'state', s: pendingState }); pendingState = null; } }, 70);
  }
  function pushState(force) {
    if (!engine) return;
    var s = engine.snapshot(); s.turnLeft = (s.toAct || s.phase === 'betting') ? Math.max(0, s.deadline - Date.now()) : 0;
    pendingState = s;
    if (force) { clearTimeout(sendTimer); sendTimer = null; send({ t: 'state', s: s }); pendingState = null; }
  }
  function applyState(s) {
    if (!role) return;
    snap = s; localDeadline = Date.now() + (s.turnLeft || 0);
    var mine = s.seats.filter(function (x) { return x.id === me.id; })[0];
    if (mine) C.setTable(mine.stack);
    trackLobby();
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
    if (isMe && myHand.length && myHandNo === snap.handNo && s.inHand) myHand.forEach(function (c) { cards.appendChild(C.Cards.el(c)); });
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
    if (isMe && myCombo) {
      var cb = document.createElement('div'); cb.className = 'pcombo'; cb.textContent = '내 족보: ' + myCombo; d.appendChild(cb);
    }
    return d;
  }

  var myCombo = '';
  function render() {
    if (!snap || tableEl.hidden) return;
    if (snap.game === 'blackjack') return renderBJ();
    var ms = snap.seats.filter(function (x) { return x.id === me.id; })[0];
    myCombo = (ms && ms.inHand && !ms.folded && myHand.length === 2 && myHandNo === snap.handNo) ? C.handName(myHand.concat(snap.board)) : '';
    C.markRank(myCombo);
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

  /* ---------- 블랙잭 화면 ---------- */
  var STATE_TEXT = { bj: '블랙잭!', bust: '21 넘음', stood: '멈춤', bet: '베팅 완료' };
  function bjSeatEl(s, isMe) {
    var d = document.createElement('div');
    d.className = 'pseat' + (snap.toAct === s.id ? ' acting' : '') + (isMe ? ' me' : '') + (s.left ? ' folded' : '');
    var head = document.createElement('div'); head.className = 'ph';
    var nm = document.createElement('span'); nm.className = 'pn'; nm.textContent = s.name + (isMe ? ' (나)' : '');
    head.appendChild(nm); d.appendChild(head);
    var st = document.createElement('div'); st.className = 'pstack'; st.textContent = C.fmt(s.stack); d.appendChild(st);
    var cards = document.createElement('div'); cards.className = 'hand small';
    s.cards.forEach(function (c) { cards.appendChild(C.Cards.el(c)); });
    d.appendChild(cards);
    var note = document.createElement('div'); note.className = 'pnote';
    var t = [];
    if (s.cards.length) t.push('합 ' + s.total);
    if (s.bet) t.push('베팅 ' + C.fmt(s.bet));
    if (s.left) t.push('나감'); else if (STATE_TEXT[s.state] && !(s.state === 'bet' && s.cards.length)) t.push(STATE_TEXT[s.state]);
    note.textContent = t.join(' · ');
    if (s.result && snap.phase === 'between') { note.textContent = s.result; note.classList.add('res'); }
    if (snap.toAct === s.id) { var tm = document.createElement('span'); tm.className = 'timer'; tm.setAttribute('data-timer', ''); note.appendChild(document.createTextNode(' ')); note.appendChild(tm); }
    d.appendChild(note);
    return d;
  }
  function renderBJ() {
    topEl.innerHTML = ''; meEl.innerHTML = '';
    var mine = null;
    snap.seats.forEach(function (s) {
      if (s.id === me.id) { mine = s; meEl.appendChild(bjSeatEl(s, true)); } else topEl.appendChild(bjSeatEl(s, false));
    });
    boardEl.innerHTML = '';
    if (snap.dealer.cards.length) snap.dealer.cards.forEach(function (c) { boardEl.appendChild(C.Cards.el(c, !c)); });
    else for (var i = 0; i < 2; i++) boardEl.appendChild(Object.assign(document.createElement('div'), { className: 'card slot' }));
    potEl.textContent = snap.dealer.cards.length ? snap.dealer.total : '-';
    msgEl.textContent = snap.msg;
    if (snap.phase === 'betting') {
      var tm = document.createElement('span'); tm.className = 'timer'; tm.setAttribute('data-timer', '');
      msgEl.appendChild(document.createTextNode(' ')); msgEl.appendChild(tm);
    }
    logEl.innerHTML = '';
    snap.logs.slice().reverse().forEach(function (t) { var li = document.createElement('li'); li.textContent = t; logEl.appendChild(li); });
    renderBJControls(mine);
    tick();
  }
  function renderBJControls(mine) {
    if (!mine) { ctrlEl.innerHTML = ''; return; }
    var key = [snap.round, snap.phase, snap.toAct, mine.stack, mine.bet, mine.state, mine.cards.length].join('|');
    if (key === ctrlKey) return;
    ctrlKey = key; ctrlEl.innerHTML = ''; ctrlEl.onclick = null;
    var minBet = snap.minBet;
    var inPlay = mine.inRound && (snap.phase === 'playing' || snap.phase === 'dealer');

    if (snap.phase === 'betting' && mine.state === 'idle') {
      bjBet = Math.max(minBet, Math.min(lastBjBet || minBet, mine.stack));
      ctrlEl.innerHTML =
        '<div class="bet-line"><span>이번 판 베팅</span><b data-bv>' + C.fmt(bjBet) + '</b></div>' +
        '<div class="chips">' + [[1, 100], [5, 500], [10, 1000], [50, 5000]].map(function (m) {
          return '<button type="button" class="chip c' + m[1] + '" data-add="' + (m[0] * minBet) + '">+' + C.fmtShort(m[0] * minBet) + '</button>';
        }).join('') + '</div>' +
        '<div class="actions"><button type="button" class="primary" data-ok>베팅하기</button>' +
        '<button type="button" data-clr>최소로</button><button type="button" data-all>올인</button></div>';
      var bv = ctrlEl.querySelector('[data-bv]');
      var step = Math.max(1, Math.floor(minBet / 10));
      var setBet = function (v) { bjBet = Math.max(minBet, Math.min(Math.floor(v / step) * step, mine.stack)); bv.textContent = C.fmt(bjBet); };
      ctrlEl.onclick = function (e) {
        var b = e.target.closest('button'); if (!b) return;
        if (b.dataset.add) setBet(bjBet + Number(b.dataset.add));
        else if (b.hasAttribute('data-clr')) setBet(minBet);
        else if (b.hasAttribute('data-all')) setBet(mine.stack);
        else if (b.hasAttribute('data-ok')) { lastBjBet = bjBet; act({ type: 'bet', amount: bjBet }); }
      };
      return;
    }
    if (snap.toAct === me.id) {
      var canDouble = mine.cards.length === 2 && mine.stack >= mine.bet;
      ctrlEl.innerHTML = '<div class="actions">' +
        '<button type="button" class="primary" data-a="hit">카드 받기<small>히트</small></button>' +
        '<button type="button" data-a="stand">멈추기<small>스탠드</small></button>' +
        '<button type="button" data-a="double"' + (canDouble ? '' : ' disabled') + '>2배로 한 장<small>더블</small></button></div>';
      ctrlEl.onclick = function (e) {
        var b = e.target.closest('button'); if (!b || !b.dataset.a) return;
        act({ type: b.dataset.a });
      };
      return;
    }
    var busted = mine.stack < minBet && !inPlay;
    var info = document.createElement('p'); info.className = 'rule';
    info.textContent = busted ? '칩이 부족해. 리바이하면 다음 판부터 다시 참여해.'
      : snap.phase === 'betting' ? (mine.state === 'bet' ? '다른 사람 베팅을 기다리는 중이야.' : '이번 판은 쉬어.')
      : snap.phase === 'waiting' ? '친구를 기다리는 중이야. 코드 ' + code + ' 를 알려줘.'
      : snap.phase === 'between' ? '곧 다음 판 베팅이 시작돼.'
      : (snap.toAct ? '다른 사람 차례야.' : '진행 중…');
    ctrlEl.appendChild(info);
    var row = document.createElement('div'); row.className = 'actions';
    if (busted) {
      [0.2, 0.5, 0.8].map(function (f) { return Math.floor(C.money() * f); })
        .filter(function (v, i, a) { return v >= minBet && v >= C.minBuyin() && a.indexOf(v) === i; }).forEach(function (v) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'primary';
        b.textContent = C.fmt(v) + ' 리바이'; b.disabled = v > C.maxBuyin();
        b.addEventListener('click', function () {
          if (role === 'host') { var r = engine.rebuy(me.id, v); if (r.ok) C.add(-v); else C.toast(r.reason); }
          else send({ t: 'rebuy', id: me.id, amount: v });
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

  var lastNeedHand = 0;
  function tick() {
    var el = root.querySelector('[data-timer]');
    if (el && snap && (snap.toAct || snap.phase === 'betting')) el.textContent = Math.max(0, Math.ceil((localDeadline - Date.now()) / 1000)) + '초';
    // 손님: 이번 핸드 내 패가 아직 없으면 방장에게 다시 달라고 한다 (1초마다)
    if (role === 'guest' && snap && snap.phase === 'hand' && Date.now() - lastNeedHand > 1000) {
      var me2 = snap.seats.filter(function (x) { return x.id === me.id; })[0];
      if (me2 && me2.inHand && !me2.folded && (myHandNo !== snap.handNo || !myHand.length)) {
        lastNeedHand = Date.now(); send({ t: 'needhand', id: me.id });
      }
    }
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
        var to = snap.currentBet + Math.round((snap.pot + (snap.currentBet - mine.bet)) * f / 1000) * 1000;
        return Math.max(minTo, Math.min(maxTo, to));
      };
      ctrlEl.innerHTML =
        '<div class="actions"><button type="button" data-a="fold">폴드</button>' +
        '<button type="button" class="primary" data-a="call">' + (toCall === 0 ? '넘기기<small>체크</small>' : '맞추기 ' + C.fmt(toCall) + '<small>콜</small>') + '</button>' +
        (canRaise ? '<button type="button" class="primary" data-a="raise">' + (snap.currentBet === 0 ? '베팅하기' : '올리기<small>레이즈</small>') + ' <b data-rv>' + C.fmt(minTo) + '</b></button>' : '') + '</div>' +
        (canRaise ? '<div class="raise-row"><input type="range" id="on-raise" min="' + minTo + '" max="' + maxTo + '" step="1000" value="' + minTo + '">' +
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
        [0.2, 0.5, 0.8].map(function (f) { return Math.floor(C.money() * f); })
          .filter(function (v, i, a) { return v >= C.minBuyin() && a.indexOf(v) === i; }).forEach(function (v) {
          var b = document.createElement('button'); b.type = 'button'; b.className = 'primary';
          b.textContent = C.fmt(v) + ' 리바이'; b.disabled = v > C.maxBuyin();
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
    if (p) { codeBox.open = true; codeInput.value = p.toUpperCase().slice(0, 4); location.hash = '#online'; setStatus('바이인을 고르고 입장을 눌러줘.'); }
  });
})();
