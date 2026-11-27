// node test/online-engine.test.js
// 가짜 플레이어 4명이 무작위로 행동하며 수백 핸드를 돌리고, 칩 보존/진행 중단 여부를 검사한다.
const assert = require('assert');
const { createEngine } = require('../js/online-engine.js');

function shuffled() {
  const d = [];
  for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) d.push({ r, s });
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
}

async function run(label, nPlayers, hands, opts = {}) {
  let snap = null, handsDone = 0, expectedTotal = 0;
  const privates = {};
  const eng = createEngine({
    shuffled, turnMs: 5000, betweenMs: 0, dealMs: 0, streetMs: 0, sleep: () => Promise.resolve(),
    onState: s => { snap = s; if (s.phase === 'between') handsDone++; },
    onPrivate: (id, cards) => { privates[id] = cards; }
  });
  const ids = [];
  for (let i = 0; i < nPlayers; i++) {
    const id = 'p' + i; ids.push(id);
    const stack = [1000, 2000, 5000, 300, 800, 1500][i];
    assert(eng.addPlayer(id, 'P' + i, stack).ok);
    expectedTotal += stack;
  }
  const total = () => eng._seats().reduce((s, p) => s + p.stack + p.total, 0);
  let guard = 0, invariantChecks = 0;
  while (handsDone < hands && guard++ < 200000) {
    await new Promise(r => setImmediate(r));
    if (!snap) continue;
    if (snap.phase === 'waiting') break;
    if (snap.toAct) {
      const me = snap.seats.find(s => s.id === snap.toAct);
      const toCall = snap.currentBet - me.bet, r = Math.random();
      if (r < 0.12 && toCall > 0) eng.action(me.id, { type: 'fold' });
      else if (r < 0.35) eng.action(me.id, { type: 'raise', to: snap.currentBet + snap.minRaise * (1 + Math.floor(Math.random() * 6)) });
      else if (r < 0.40) eng.action(me.id, { type: 'raise', to: 10 ** 9 }); // 올인
      else eng.action(me.id, { type: 'call' });
      // 부정 입력도 섞는다
      eng.action('nobody', { type: 'raise', to: 999999 });
      eng.action(me.id, { type: 'raise', to: NaN });
    }
    assert.strictEqual(total(), expectedTotal, label + ': 칩 보존 위반');
    invariantChecks++;
  }
  assert(handsDone >= Math.min(hands, 1), label + ': 핸드가 진행되지 않음');
  eng.stop();
  console.log(`${label}: ${handsDone}핸드, 칩 보존 검사 ${invariantChecks}회 OK`);
}

(async () => {
  await run('헤즈업(2명)', 2, 60);
  await run('3명', 3, 80);
  await run('6명 (스택 제각각)', 6, 80);

  // 중도 퇴장/리바이/자리 꽉 참
  const eng = createEngine({ shuffled, turnMs: 5000, betweenMs: 0, dealMs: 0, streetMs: 0, sleep: () => Promise.resolve() });
  for (let i = 0; i < 6; i++) assert(eng.addPlayer('q' + i, 'Q' + i, 1000).ok);
  assert.strictEqual(eng.addPlayer('q6', 'Q6', 1000).ok, false, '7번째는 거절');
  assert.strictEqual(eng.addPlayer('qx', 'QX', 0).ok, false);
  assert.strictEqual(eng.rebuy('q0', 500).ok, false, '칩이 남아있으면 리바이 불가');
  eng.stop();
  console.log('입장 제한 OK');
})().catch(e => { console.error(e); process.exit(1); });
