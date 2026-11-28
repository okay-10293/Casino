// node test/online-blackjack.test.js — 온라인 블랙잭 엔진: 정해진 덱으로 정산 규칙을 확인하고, 무작위로 많이 돌려 이상 상태가 없는지 본다.
const assert = require('assert');
const { createEngine } = require('../js/online-blackjack.js');

const R = { A: 14, K: 13, Q: 12, J: 11 };
const card = (x, s = 0) => ({ r: R[x] || Number(x), s });
// 앞에서부터 뽑히는 순서로 적는다 (엔진은 pop()으로 뽑으므로 맨 뒤에 뒤집어 둔다). 그 아래는 채움 카드.
const stacked = (...cs) => () => Array.from({ length: 40 }, () => card(2, 1)).concat(cs.map(c => card(c)).reverse());
const MIN = 10000;

function make(shuffled, opt = {}) {
  let snap = null; const waiters = [];
  const eng = createEngine(Object.assign({
    shuffled, minBet: MIN, bias: 0, turnMs: 5000, betMs: 5000, betweenMs: 1e9, dealMs: 0, dealerMs: 0,
    sleep: ms => (ms > 1e6 ? new Promise(() => {}) : Promise.resolve()),
    onState: s => { snap = s; waiters.slice().forEach(w => w(s)); }
  }, opt));
  const until = (pred, ms = 3000) => new Promise((res, rej) => {
    if (snap && pred(snap)) return res(snap);
    const t = setTimeout(() => rej(new Error('시간 초과: ' + JSON.stringify(snap && { phase: snap.phase, toAct: snap.toAct, msg: snap.msg }))), ms);
    const w = s => { if (pred(s)) { clearTimeout(t); waiters.splice(waiters.indexOf(w), 1); res(s); } };
    waiters.push(w);
  });
  return { eng, until, get snap() { return snap; } };
}

// 한 판: 모두 베팅 → 각자 정해둔 행동(순서대로) → 정산까지
async function round(deck, players, bets, moves) {
  const g = make(deck);
  players.forEach(([id, stack]) => assert(g.eng.addPlayer(id, id, stack).ok));
  await g.until(s => s.phase === 'betting');
  players.forEach(([id], i) => assert(g.eng.action(id, { type: 'bet', amount: bets[i] })));
  const idx = {};
  for (;;) {
    const s = await g.until(x => x.phase === 'between' || (x.phase === 'playing' && x.toAct) || x.phase === 'dealer');
    if (s.phase !== 'playing') break;
    const id = s.toAct; idx[id] = idx[id] || 0;
    const m = (moves[id] || [])[idx[id]++] || 'stand';
    const before = s.msg + s.seats.map(x => x.cards.length).join();
    assert(g.eng.action(id, { type: m }));
    await g.until(x => x.toAct !== id || x.seats.find(q => q.id === id).cards.length !== s.seats.find(q => q.id === id).cards.length || x.phase !== 'playing');
  }
  const s = await g.until(x => x.phase === 'between');
  g.eng.stop();
  return s;
}
const stackOf = (s, id) => s.seats.find(x => x.id === id).stack;
const resultOf = (s, id) => s.seats.find(x => x.id === id).result;

(async () => {
  // 딜러: 9 7 / 플레이어: A K → 블랙잭 3:2 (베팅 10000 → +15000)
  let s = await round(stacked(9, 7, 'A', 'K'), [['a', 100000]], [MIN], {});
  assert.strictEqual(stackOf(s, 'a'), 100000 - MIN + 25000, '블랙잭 3:2'); console.log('블랙잭 3:2 OK');

  // 푸시: 둘 다 18 → 베팅금 반환
  s = await round(stacked(10, 8, 10, 8), [['a', 100000]], [MIN], {});
  assert.strictEqual(stackOf(s, 'a'), 100000); assert.match(resultOf(s, 'a'), /무승부/); console.log('동점은 베팅금 반환 OK');

  // 승리: 19 vs 17 (딜러는 17에서 멈춤)
  s = await round(stacked(10, 7, 10, 9), [['a', 100000]], [MIN], {});
  assert.strictEqual(stackOf(s, 'a'), 110000); assert.strictEqual(s.dealer.total, 17); console.log('승리/딜러 17 스탠드 OK');

  // 패배: 18 vs 19
  s = await round(stacked(10, 9, 10, 8), [['a', 100000]], [MIN], {});
  assert.strictEqual(stackOf(s, 'a'), 90000); console.log('패배 OK');

  // 버스트: 16에서 히트해서 K → 21 초과 (딜러는 더 안 뽑음)
  s = await round(stacked(10, 6, 10, 6, 'K'), [['a', 100000]], [MIN], { a: ['hit'] });
  assert.strictEqual(stackOf(s, 'a'), 90000); assert.strictEqual(s.dealer.cards.length, 2); console.log('버스트 OK');

  // 더블: 11에서 2배 → 10을 받아 21, 딜러 16 → 6을 받아 22 버스트. 베팅 20000 승리 = +20000
  s = await round(stacked(10, 6, 5, 6, 10, 6), [['a', 100000]], [MIN], { a: ['double'] });
  assert.strictEqual(stackOf(s, 'a'), 120000, '더블 승리'); console.log('더블 OK');

  // 딜러 블랙잭이면 플레이어 행동 없이 끝 (플레이어 20 → 패배)
  s = await round(stacked('A', 'K', 10, 'K'), [['a', 100000]], [MIN], {});
  assert.strictEqual(stackOf(s, 'a'), 90000); assert.match(resultOf(s, 'a'), /딜러 블랙잭/); console.log('딜러 블랙잭 OK');

  // 두 명: 한 명은 이기고 한 명은 진다 (딜러 10+8=18)
  s = await round(stacked(10, 8, 10, 'K', 10, 7), [['a', 100000], ['b', 100000]], [MIN, 2 * MIN], {});
  assert.strictEqual(stackOf(s, 'a'), 110000); assert.strictEqual(stackOf(s, 'b'), 100000 - 2 * MIN); console.log('여러 명 정산 OK');

  // BIAS=1: 플레이어 16에서 히트하면 K(21 초과)와 2 중 딜러에게 유리한 K가 뽑힌다
  { const g = make(stacked(10, 8, 10, 6, 'K', 2), { bias: 1 });
    g.eng.addPlayer('a', 'a', 100000); await g.until(x => x.phase === 'betting'); g.eng.action('a', { type: 'bet', amount: MIN });
    const t = await g.until(x => x.toAct === 'a'); g.eng.action('a', { type: 'hit' });
    const e = await g.until(x => x.phase !== 'playing' || x.toAct !== 'a');
    assert.strictEqual(e.seats[0].state, 'bust', 'BIAS=1이면 플레이어는 불리한 카드를 받는다'); g.eng.stop(); console.log('딜러 유리 확률 보정 동작 OK'); }

  // 입장 제한: 최소 바이인, 자리, 베팅 검증
  { const g = make(stacked(10, 8, 10, 8));
    assert.strictEqual(g.eng.addPlayer('x', 'x', MIN - 1).ok, false, '최소 바이인 미만 거절');
    for (let i = 0; i < 6; i++) assert(g.eng.addPlayer('p' + i, 'p' + i, 50000).ok);
    assert.strictEqual(g.eng.addPlayer('p7', 'p7', 50000).ok, false, '7번째 거절');
    await g.until(x => x.phase === 'betting');
    assert.strictEqual(g.eng.action('p0', { type: 'bet', amount: NaN }), false);
    assert.strictEqual(g.eng.action('p0', { type: 'hit' }), false, '베팅 중 행동 불가');
    assert(g.eng.action('p0', { type: 'bet', amount: 10 ** 9 })); assert.strictEqual(stackOf(g.snap, 'p0'), 0, '가진 만큼만 건다');
    assert.strictEqual(g.eng.action('p0', { type: 'bet', amount: MIN }), false, '이중 베팅 불가');
    g.eng.stop(); console.log('입장/베팅 검증 OK'); }

  // 판 도중 나가면 그 판 베팅은 포기 (이겼어도 지급 없음)
  { const g = make(stacked(10, 7, 10, 9, 10, 8));
    g.eng.addPlayer('a', 'a', 100000); g.eng.addPlayer('b', 'b', 100000);
    await g.until(x => x.phase === 'betting'); g.eng.action('a', { type: 'bet', amount: MIN }); g.eng.action('b', { type: 'bet', amount: MIN });
    await g.until(x => x.toAct === 'a'); g.eng.removePlayer('a');
    await g.until(x => x.toAct === 'b'); g.eng.action('b', { type: 'stand' });
    const e = await g.until(x => x.phase === 'between');
    assert.strictEqual(stackOf(e, 'a'), 90000, '나간 사람은 돌려받지 못함'); g.eng.stop(); console.log('중도 퇴장 처리 OK'); }

  // 무작위 4명 × 많은 판: 칩이 음수/NaN이 되지 않고, 판이 끝까지 진행된다 (실제 셔플 + BIAS 0.55)
  { const deck = () => { const d = []; for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) d.push({ r, s }); for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; } return d; };
    let rounds = 0, snap = null;
    const eng = createEngine({ shuffled: deck, minBet: MIN, turnMs: 5000, betMs: 5000, betweenMs: 0, dealMs: 0, dealerMs: 0, sleep: () => Promise.resolve(), onState: x => { snap = x; if (x.phase === 'between') rounds++; } });
    ['a', 'b', 'c', 'd'].forEach((id, i) => eng.addPlayer(id, id, [50000, 100000, 30000, 200000][i]));
    let guard = 0;
    while (rounds < 150 && guard++ < 300000) {
      await new Promise(r => setImmediate(r));
      if (!snap) continue;
      snap.seats.forEach(p => { assert(Number.isInteger(p.stack) && p.stack >= 0 && p.bet >= 0, '칩 이상: ' + JSON.stringify(p)); });
      if (snap.phase === 'waiting') {                              // 다 털리면 다시 넣어 준다
        snap.seats.forEach(p => { if (p.stack < MIN) eng.rebuy(p.id, 50000); }); continue;
      }
      if (snap.phase === 'betting') snap.seats.forEach(p => { if (p.state === 'idle') eng.action(p.id, { type: 'bet', amount: MIN * (1 + Math.floor(Math.random() * 5)) }); });
      else if (snap.phase === 'between') snap.seats.forEach(p => { if (p.stack < MIN) eng.rebuy(p.id, 50000); });
      if (snap.toAct) eng.action(snap.toAct, { type: ['hit', 'stand', 'double'][Math.floor(Math.random() * 3)] });
      eng.action('nobody', { type: 'hit' }); eng.action('a', { type: 'bogus' });
    }
    eng.stop(); assert(rounds >= 100, '진행된 판 수 ' + rounds); console.log('무작위 ' + rounds + '판 OK'); }
  console.log('online-blackjack OK');
})().catch(e => { console.error(e); process.exit(1); });
