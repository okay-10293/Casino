// node test/bitcoin.test.js — 비트코인 탭: 매수/매도/손익/수수료/리셋. (npm i --no-save jsdom)
const { openPage } = require('./jsdom-page');
const errs = [];
const dom = openPage('#bitcoin', errs);
const w = dom.window, d = w.document, sleep = ms => new Promise(r => setTimeout(r, ms));
const bal = () => Number(d.querySelector('#balance').textContent.replace(/,/g, ''));
const q = s => d.querySelector(s);
const type = v => { q('[data-amount]').value = String(v); q('[data-amount]').dispatchEvent(new w.Event('input', { bubbles: true })); };
let fails = 0; const check = (n, c) => { console.log(c ? 'OK  ' : 'FAIL', n); if (!c) fails++; };
const RATE = 1400, FEE = 0.001, SAT = 1e8;
(async () => {
  await sleep(50);  // 실시간 연결 실패 → 시뮬레이션 가격으로 시작하는 걸 먼저 지나간다
  check('비트코인 탭 보임', !q('#g-bitcoin').hidden && q('#tabs [data-tab=bitcoin]').classList.contains('on'));
  check('시세 연결 안 되면 시뮬레이션 표시', /시뮬레이션/.test(q('[data-badge]').textContent));

  w.CasinoBTC.setUsd(100000);
  const p1 = 100000 * RATE;
  check('가격 표시(1달러=1,400)', q('[data-price]').textContent.includes(p1.toLocaleString('ko-KR')));
  check('실시간 표시', /실시간/.test(q('[data-badge]').textContent));
  const start = bal(); check('시작 잔액 1,000,000', start === 1000000);

  // 최소 금액 / 잔액 초과
  type(500); q('[data-go]').click();
  check('최소 금액 미만은 거절', bal() === start && /최소/.test(q('#g-bitcoin [data-msg]').textContent));
  type(start + 1); q('[data-go]').click();
  check('잔액 초과는 거절', bal() === start && /부족/.test(q('#g-bitcoin [data-msg]').textContent));
  type(''); q('[data-go]').click();
  check('빈 입력은 거절', bal() === start);

  // 50만 매수
  type(500000); q('[data-go]').click();
  const sats = Math.floor(500000 * (1 - FEE) / p1 * SAT);
  check('50만 매수: 잔액 -500,000', bal() === start - 500000);
  check('보유 사토시 계산(수수료 0.1%)', w.CasinoBTC.state().sats === sats && w.CasinoBTC.state().cost === 500000);
  check('보유 표시', q('[data-sats]').textContent === '₿ ' + (sats / SAT).toFixed(8));

  // 가격 10% 상승 → 평가금액/손익
  w.CasinoBTC.setUsd(110000);
  const p2 = 110000 * RATE, val = Math.floor(sats / SAT * p2);
  check('평가금액 = 보유×현재가', q('[data-val]').textContent === val.toLocaleString('ko-KR'));
  check('이익이면 초록(up)', q('[data-pl]').classList.contains('up') && q('[data-pl]').textContent.startsWith('+'));

  // 팔기: 절반 → 그 다음 전부
  q('.seg [data-v=sell]').click();
  check('팔기 모드 버튼', q('[data-go]').textContent === '팔기');
  q('[data-p="50"]').click(); q('[data-go]').click();
  const sold = Math.round(Math.floor(val * 0.5) / p2 * SAT);
  check('절반 매도: 보유 감소', w.CasinoBTC.state().sats === sats - sold);
  check('절반 매도: 투자원금도 비례 감소', Math.abs(w.CasinoBTC.state().cost - Math.round(500000 * (sats - sold) / sats)) <= 1);
  q('[data-p="100"]').click(); q('[data-go]').click();
  check('전부 매도: 보유 0, 원금 0', w.CasinoBTC.state().sats === 0 && w.CasinoBTC.state().cost === 0);
  check('수수료 감안해도 10% 오른 만큼 이익', bal() > start && bal() < start + 500000 * 0.1);
  q('[data-go]').click();
  check('보유 없이 팔기는 거절', /없어/.test(q('#g-bitcoin [data-msg]').textContent));

  // 올인 매수 → 리셋하면 보유도 초기화
  q('.seg [data-v=buy]').click(); q('[data-p="100"]').click(); q('[data-go]').click();
  check('올인 매수: 잔액 0', bal() === 0 && w.CasinoBTC.state().sats > 0);
  q('#reset-btn').click(); q('#reset-btn').click();
  check('리셋: 게임머니 1,000,000 + 보유 0', bal() === 1000000 && w.CasinoBTC.state().sats === 0);
  check('저장 확인(localStorage)', JSON.parse(w.localStorage.getItem('okay-casino-btc-v1')).sats === 0);
  check('페이지 오류 없음', !errs.length); if (errs.length) console.log(errs);
  process.exit(fails ? 1 : 0);
})();
