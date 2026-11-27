// node test/online-hand-loss.test.js — 방장이 보낸 "내 패" 메시지가 유실돼도 손님 화면에 패가 다시 나타나야 한다. (npm i --no-save jsdom)
const { openPage, sleep } = require('./jsdom-page');
const errs = [];
async function join(name, hash) {
  const dom = openPage(hash, errs);
  const d = dom.window.document;
  d.querySelector('#player-name').value = name;
  d.querySelector('#player-name').dispatchEvent(new dom.window.Event('change'));
  return { d, w: dom.window };
}
(async () => {
  const H = await join('방장', '#online'), G = await join('철수', '#online');
  H.d.querySelector('#g-online [data-create]').click();
  for (let i = 0; i < 40 && !H.d.querySelector('[data-code]').textContent; i++) await sleep(100);
  H.w.__dropHand = 4;                                        // 앞으로 나가는 패 메시지 4개를 버린다
  G.d.querySelector('#on-code').value = H.d.querySelector('[data-code]').textContent;
  G.d.querySelector('#g-online [data-join]').click();
  for (let i = 0; i < 60 && G.d.querySelector('#g-online [data-table]').hidden; i++) await sleep(100);
  const mine = d => [...d.querySelectorAll('#g-online .seat-me .card:not(.back):not(.slot)')].length;
  let ok = false;
  for (let i = 0; i < 60; i++) { await sleep(100); if (mine(G.d) === 2) { ok = true; break; } }
  console.log('패 유실 후 손님 화면 카드 수:', mine(G.d), 'dropHand 남은 수:', H.w.__dropHand);
  console.log(errs.length ? 'ERRORS ' + JSON.stringify(errs) : 'no page errors');
  console.log(ok && !errs.length ? 'online-hand-loss OK' : 'online-hand-loss FAIL');
  process.exit(ok && !errs.length ? 0 : 1);
})();
