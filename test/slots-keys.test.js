// node test/slots-keys.test.js — 슬롯: 스페이스 스핀, 베팅 100만 고정, 돈 부족, 엔터 두 번 리셋 (npm i --no-save jsdom)
const { openPage, sleep } = require('./jsdom-page');
const errs = [];
const dom = openPage('#slots', errs);
const w = dom.window, d = w.document, q = s => d.querySelector(s);
let fails = 0; const check = (n, c) => { console.log(c ? 'OK  ' : 'FAIL', n); if (!c) fails++; };
const bal = () => Number(q('#balance').textContent.replace(/,/g, ''));
const key = (k, code, target) => (target || d.body).dispatchEvent(new w.KeyboardEvent('keydown', { key: k, code, bubbles: true, cancelable: true }));
const space = t => key(' ', 'Space', t), enter = t => key('Enter', 'Enter', t);
const msg = () => q('#g-slots [data-msg]').textContent;
const toast = () => q('#toast').textContent;

(async () => {
  check('시작 잔액 1,000,000', bal() === 1000000);
  check('베팅 1,000,000 고정 표시', /1,000,000/.test(q('#g-slots .bet-line').textContent));
  // 스킵 켜서 즉시 결과
  const box = d.querySelector('.skip input'); box.checked = true; box.dispatchEvent(new w.Event('change'));

  space(); await sleep(60);
  check('스페이스로 스핀 (결과 메시지)', !/스페이스바/.test(msg()) && !/돌아간다/.test(msg()));
  const after = bal();
  check('베팅 100만이 정산됨 (꽝이면 0, 당첨이면 100만 이상 배수)', after === 0 || after % 1000000 === 0 || after % 2000000 === 0);

  // 돈 부족: 잔액을 999,999로 만들기 (리셋 후 -1)
  enter(); enter(); await sleep(20);
  check('엔터 두 번 → 리셋 1,000,000', bal() === 1000000);
  w.Casino.add(-1);
  const before = bal();
  space(); await sleep(60);
  check('돈 부족: 안 돌아감 + "돈이 부족해요"', bal() === before && msg() === '돈이 부족해요' && /돈이 부족해요/.test(toast()));
  space(); await sleep(60);
  check('다시 눌러도 안 돌아감', bal() === before);

  // 엔터 한 번은 리셋 안 됨
  enter(); await sleep(700);
  check('엔터 한 번은 리셋 안 됨 (600ms 지나면 무효)', bal() === before);
  enter(); await sleep(700); enter();
  check('엔터 사이가 길면 리셋 안 됨', bal() === before);
  enter(); await sleep(20);
  check('엔터 빠르게 두 번 → 리셋', bal() === 1000000);

  // 입력창에서는 무시
  const inp = q('#player-name'); w.Casino.add(-1); const b2 = bal();
  space(inp); enter(inp); enter(inp); await sleep(40);
  check('입력창에서 스페이스/엔터는 무시', bal() === b2);

  // 다른 탭에서는 무시
  w.Casino.add(0);
  q('#tabs [data-tab=blackjack]').click();
  enter(); enter(); space(); await sleep(40);
  check('슬롯 탭이 아니면 무시', bal() === b2);
  check('페이지 오류 없음', !errs.length); if (errs.length) console.log(errs);
  process.exit(fails ? 1 : 0);
})();
