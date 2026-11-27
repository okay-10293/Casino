// node test/poker-eval.test.js
const assert = require('assert');
const P = require('../js/poker-eval.js');
const c = (s) => s.split(' ').map(x => ({ r: '23456789TJQKA'.indexOf(x[0]) + 2, s: 'shdc'.indexOf(x[1]) }));
const cat = (s) => P.best(c(s))[0];
assert.strictEqual(cat('As Ks Qs Js Ts 2d 3c'), 8);
assert.strictEqual(P.name(P.best(c('As Ks Qs Js Ts 2d 3c'))), '로열 플러시');
assert.strictEqual(cat('9s 9h 9d 9c 2s 3d 4c'), 7);
assert.strictEqual(cat('9s 9h 9d 4c 4s 3d 2c'), 6);
assert.strictEqual(cat('As 3s 9s Js 5s 2d 2c'), 5);
assert.strictEqual(cat('As 2d 3h 4c 5s 9d Kc'), 4);      // 휠
assert.strictEqual(cat('9s 9h 9d 4c 5s Jd 2c'), 3);
assert.strictEqual(cat('9s 9h 4d 4c 5s Jd 2c'), 2);
assert.strictEqual(cat('9s 9h 4d 8c 5s Jd 2c'), 1);
assert.strictEqual(cat('9s Kh 4d 8c 5s Jd 2c'), 0);
// 비교: 킥커, 휠 < 6하이 스트레이트
assert(P.cmp(P.best(c('As Ad Kc 5s 2d 7h 9c')), P.best(c('Ah Ac Qc 5d 2s 7d 9s'))) > 0);
assert(P.cmp(P.best(c('2s 3d 4h 5c 6s Kd Kc')), P.best(c('As 2d 3h 4c 5s Kh 9c'))) > 0);
// 풀하우스 두 세트 중 높은 트리플이 승
assert(P.cmp(P.best(c('Ks Kd Kh 2c 2s 9d 4c')), P.best(c('Qs Qd Qh Ac As 9h 4d'))) > 0);
console.log('poker-eval OK');
