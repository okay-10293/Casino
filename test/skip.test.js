// node test/skip.test.js — 슬롯/룰렛 스핀 연출 건너뛰기 (npm i --no-save jsdom)
const { openPage, sleep } = require('./jsdom-page');
const errs = [];
const dom = openPage('#slots', errs);
const w = dom.window, d = w.document, q = s => d.querySelector(s);
let fails = 0; const check = (n, c) => { console.log(c ? 'OK  ' : 'FAIL', n); if (!c) fails++; };
const click = el => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const tab = t => click(q('#tabs [data-tab=' + t + ']'));
const skipBoxes = () => [...d.querySelectorAll('.skip input')];

(async () => {
  check('체크박스가 슬롯·룰렛에 하나씩', skipBoxes().length === 2);

  // ---- 슬롯: 연출 중 버튼 눌러 건너뛰기
  tab('slots');
  click(q('#g-slots [data-add="500"]'));
  const pull = q('#g-slots [data-pull]'), msg = () => q('#g-slots [data-msg]').textContent;
  let t0 = Date.now(); click(pull);
  await sleep(100);
  check('슬롯: 도는 중엔 버튼이 "건너뛰기"', pull.textContent === '건너뛰기' && !pull.disabled && /돌아간다/.test(msg()));
  click(pull); await sleep(60);
  check('슬롯: 누르면 바로 결과 (0.5초 안)', Date.now() - t0 < 500 && !/돌아간다/.test(msg()) && pull.textContent === '스핀');
  check('슬롯: 릴이 멈춰 있음', ![...d.querySelectorAll('#g-slots .reel')].some(r => r.classList.contains('spin')));

  // ---- 슬롯: 항상 건너뛰기 켜기 → 연출 없이 즉시
  const box = skipBoxes()[0]; box.checked = true; box.dispatchEvent(new w.Event('change'));
  check('설정이 두 체크박스에 동기화', skipBoxes().every(b => b.checked));
  check('설정이 저장됨', JSON.parse(w.localStorage.getItem('okay-casino-v1')).skip === true);
  click(q('#g-slots [data-add="500"]')); click(pull); await sleep(40);
  check('슬롯: 건너뛰기 켜면 바로 결과', !/돌아간다/.test(msg()) && pull.textContent === '스핀' && !pull.disabled);

  // ---- 룰렛: 항상 건너뛰기
  tab('roulette');
  click(q('#g-roulette [data-key=red]'));
  const spin = q('#g-roulette [data-spin]'), rmsg = () => q('#g-roulette [data-msg]').textContent;
  click(spin); await sleep(80);
  check('룰렛: 건너뛰기 켜면 바로 결과', !/돌아간다/.test(rmsg()) && rmsg() !== '' && spin.textContent === '스핀');

  // ---- 룰렛: 끄고, 도는 중 버튼으로 건너뛰기
  box.checked = false; box.dispatchEvent(new w.Event('change'));
  click(q('#g-roulette [data-key=red]'));
  t0 = Date.now(); click(spin); await sleep(100);
  check('룰렛: 도는 중엔 "건너뛰기"', spin.textContent === '건너뛰기' && !spin.disabled && /돌아간다/.test(rmsg()));
  click(spin);
  for (let i = 0; i < 30 && /돌아간다/.test(rmsg()); i++) await sleep(50);
  check('룰렛: 누르면 1초 안에 결과 (원래 약 4초)', Date.now() - t0 < 1000 && !/돌아간다/.test(rmsg()) && spin.textContent === '스핀');
  check('룰렛: 베팅이 정산돼 비어 있음', q('#g-roulette [data-total]').textContent === '0');
  check('페이지 오류 없음', !errs.length); if (errs.length) console.log(errs);
  process.exit(fails ? 1 : 0);
})();
