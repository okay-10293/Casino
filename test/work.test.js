// node test/work.test.js — 노동 탭: 일하면 돈이 들어오고, 리셋은 1만원으로 되돌린다. 약 35초 걸림. (npm i --no-save jsdom)
const { openPage } = require('./jsdom-page');
const errs = [];
const dom = openPage('#work', errs);
const d = dom.window.document, sleep = ms => new Promise(r => setTimeout(r, ms));
const bal = () => Number(d.querySelector('#balance').textContent.replace(/,/g, ''));
const q = s => d.querySelector(s);
let fails = 0; const check = (n, c) => { console.log(c ? 'OK  ' : 'FAIL', n); if (!c) fails++; };
(async () => {
  check('리셋 버튼 있음', !!q('#reset-btn'));
  check('노동 탭 보임', !q('#g-work').hidden && q('#tabs [data-tab=work]').classList.contains('on'));
  const start = bal(); check('시작 잔액 10,000', start === 10000);

  // 전단지: 20번 누르고 그만두기 → 160
  q('[data-job=flyer]').click();
  check('일하는 화면으로 전환', !q('[data-stage]').hidden && q('[data-list]').hidden);
  for (let i = 0; i < 20; i++) q('[data-tap]').click();
  q('[data-quit]').click();
  check('전단지 20장 → +800', bal() === start + 800);
  check('결과 메시지', /800/.test(q('[data-result]').textContent));

  // 한 번에 한 일만
  q('[data-job=flyer]').click(); q('[data-job=sort]').click();
  check('동시에 두 일 안 됨', q('[data-jname]').textContent.includes('전단지'));
  q('[data-quit]').click();

  // 택배: 맞게 3번 + 틀리게 1번
  const before = bal();
  q('[data-job=sort]').click();
  for (let i = 0; i < 3; i++) {
    const want = q('[data-dest]').textContent; const idx = ['서울', '부산', '제주'].indexOf(want);
    q('[data-d="' + idx + '"]').click();
  }
  const want = q('[data-dest]').textContent, idx = ['서울', '부산', '제주'].indexOf(want);
  q('[data-d="' + ((idx + 1) % 3) + '"]').click();
  check('틀리면 버튼 잠김', q('[data-d="0"]').disabled && q('[data-dest]').textContent === '앗!');
  await sleep(700);
  check('잠깐 뒤 풀림', !q('[data-d="0"]').disabled);
  q('[data-quit]').click();
  check('택배 3개 → +750', bal() === before + 750);

  // 청소: 중간에 그만두면 0
  const b2 = bal(); q('[data-job=clean]').click(); q('[data-quit]').click();
  check('청소 중도포기 0', bal() === b2);

  // 전단지 끝까지(10초): 자동 종료 + 지급
  const b3 = bal(); q('[data-job=flyer]').click(); for (let i = 0; i < 50; i++) q('[data-tap]').click();
  await sleep(10500);
  check('전단지 10초 자동 종료 → +2,000', bal() === b3 + 2000 && !q('[data-list]').hidden);

  // 청소 끝까지(20초)
  const b4 = bal(); q('[data-job=clean]').click();
  await sleep(20500);
  check('청소 20초 → +1,500', bal() === b4 + 1500);
  check('총 번 돈 표시', q('[data-earned]').textContent === (800 + 750 + 2000 + 1500).toLocaleString('ko-KR'));
  // 리셋: 한 번은 확인만, 두 번째에 1만원으로
  q('#reset-btn').click(); check('리셋 한 번은 확인만', bal() !== 10000 && q('#reset-btn').textContent === '한 번 더');
  q('#reset-btn').click(); check('리셋 두 번 → 10,000', bal() === 10000);
  check('페이지 오류 없음', !errs.length); if (errs.length) console.log(errs);
  process.exit(fails ? 1 : 0);
})();
