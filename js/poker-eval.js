/* 포커 핸드 평가기. 카드는 {r: 2..14, s: 0..3}. 점수는 배열이고 사전식으로 비교한다. */
(function (root) {
  'use strict';
  var NAMES = ['하이카드', '원페어', '투페어', '트리플', '스트레이트', '플러시', '풀하우스', '포카드', '스트레이트 플러시'];

  function eval5(c) {
    var r = c.map(function (x) { return x.r; }).sort(function (a, b) { return b - a; });
    var flush = c.every(function (x) { return x.s === c[0].s; });
    var counts = {};
    r.forEach(function (x) { counts[x] = (counts[x] || 0) + 1; });
    var groups = Object.keys(counts).map(function (k) { return [+k, counts[k]]; })
      .sort(function (a, b) { return b[1] - a[1] || b[0] - a[0]; });
    var straightHigh = 0;
    if (groups.length === 5) {
      if (r[0] - r[4] === 4) straightHigh = r[0];
      else if (r[0] === 14 && r[1] === 5) straightHigh = 5; // A-2-3-4-5
    }
    var rest = function (from) { return groups.slice(from).map(function (g) { return g[0]; }); };
    if (straightHigh && flush) return [8, straightHigh];
    if (groups[0][1] === 4) return [7, groups[0][0], groups[1][0]];
    if (groups[0][1] === 3 && groups[1][1] === 2) return [6, groups[0][0], groups[1][0]];
    if (flush) return [5].concat(r);
    if (straightHigh) return [4, straightHigh];
    if (groups[0][1] === 3) return [3, groups[0][0]].concat(rest(1));
    if (groups[0][1] === 2 && groups[1][1] === 2) return [2, groups[0][0], groups[1][0], groups[2][0]];
    if (groups[0][1] === 2) return [1, groups[0][0]].concat(rest(1));
    return [0].concat(r);
  }

  function cmp(a, b) {
    var n = Math.max(a.length, b.length);
    for (var i = 0; i < n; i++) {
      var d = (a[i] || 0) - (b[i] || 0);
      if (d) return d;
    }
    return 0;
  }

  // 5~7장 중 가장 좋은 5장 조합
  function best(cards) {
    var n = cards.length, top = null;
    if (n === 5) return eval5(cards);
    for (var a = 0; a < n - 4; a++)
      for (var b = a + 1; b < n - 3; b++)
        for (var c = b + 1; c < n - 2; c++)
          for (var d = c + 1; d < n - 1; d++)
            for (var e = d + 1; e < n; e++) {
              var s = eval5([cards[a], cards[b], cards[c], cards[d], cards[e]]);
              if (!top || cmp(s, top) > 0) top = s;
            }
    return top;
  }

  function name(score) {
    if (score[0] === 8 && score[1] === 14) return '로열 플러시';
    return NAMES[score[0]];
  }

  var api = { eval5: eval5, best: best, cmp: cmp, name: name, NAMES: NAMES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Poker = api;
})(typeof window !== 'undefined' ? window : this);
