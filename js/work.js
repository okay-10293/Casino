/* 노동: 게임머니가 바닥났을 때(또는 그냥) 일해서 버는 탭.
   한 번에 하나의 일만 할 수 있고, 일이 끝나면 번 돈이 지갑에 들어온다. */
(function () {
  'use strict';
  var C = Casino;
  var root = document.getElementById('g-work');
  var DEST = ['서울', '부산', '제주'];

  var JOBS = [
    {
      id: 'flyer', icon: '📄', name: '전단지 돌리기', secs: 10, label: '최대 400,000',
      desc: '10초 동안 버튼을 최대한 많이 눌러. 한 번에 4,000원.',
      pay: function (s) { return Math.min(400000, s.n * 4000); },
      build: function (s, body) {
        body.innerHTML =
          '<button type="button" class="primary work-big" data-tap>전단지 주기 📄</button>' +
          '<div class="work-count"><b data-c>0</b>장 · <b data-p>0</b>원</div>';
        var c = body.querySelector('[data-c]'), p = body.querySelector('[data-p]');
        body.querySelector('[data-tap]').addEventListener('click', function () {
          if (s.done) return;
          s.n++; c.textContent = s.n; p.textContent = C.fmt(JOBS[0].pay(s));
        });
      }
    },
    {
      id: 'sort', icon: '📦', name: '택배 분류', secs: 15, label: '최대 750,000',
      desc: '상자에 적힌 지역 버튼을 눌러 분류해. 맞힐 때마다 25,000원, 틀리면 잠깐 멈춰.',
      pay: function (s) { return Math.min(750000, s.n * 25000); },
      build: function (s, body) {
        body.innerHTML =
          '<div class="parcel">📦<b data-dest></b></div>' +
          '<div class="dest">' + DEST.map(function (d, i) {
            return '<button type="button" data-d="' + i + '">' + d + '</button>';
          }).join('') + '</div>' +
          '<div class="work-count"><b data-c>0</b>개 · <b data-p>0</b>원</div>';
        var destEl = body.querySelector('[data-dest]'), c = body.querySelector('[data-c]'), p = body.querySelector('[data-p]');
        var btns = body.querySelectorAll('[data-d]');
        function next() { s.want = C.rand(DEST.length); destEl.textContent = DEST[s.want]; }
        function lock(on) { btns.forEach(function (b) { b.disabled = on; }); }
        next();
        body.querySelector('.dest').addEventListener('click', function (e) {
          var b = e.target.closest('[data-d]'); if (!b || s.done || b.disabled) return;
          if (Number(b.dataset.d) === s.want) {
            s.n++; c.textContent = s.n; p.textContent = C.fmt(JOBS[1].pay(s)); next();
          } else {
            destEl.textContent = '앗!'; lock(true);
            setTimeout(function () { if (!s.done) { lock(false); next(); } }, 600);
          }
        });
      }
    },
    {
      id: 'clean', icon: '🧹', name: '청소', secs: 20, label: '150,000',
      desc: '가만히 기다리면 끝나. 대신 보수가 적어. 끝까지 해야 받아.',
      pay: function (s, finished) { return finished ? 150000 : 0; },
      build: function (s, body) {
        body.innerHTML = '<div class="parcel">🧹<b>바닥을 닦는 중…</b></div>';
      }
    }
  ];

  root.innerHTML =
    '<div class="panel work-panel" data-list>' +
    '<h2>노동</h2>' +
    '<p class="rule">돈이 바닥나도 괜찮아. 일하면 게임머니가 들어와.</p>' +
    '<div class="jobs">' + JOBS.map(function (j) {
      return '<button type="button" class="job" data-job="' + j.id + '">' +
        '<span class="ji">' + j.icon + '</span>' +
        '<span><b>' + j.name + '</b><small>' + j.desc + '</small></span>' +
        '<span class="jp">' + j.label + '<small>' + j.secs + '초</small></span></button>';
    }).join('') + '</div>' +
    '<div class="msg" data-result></div>' +
    '<div class="work-total">이번에 번 돈 <b data-earned>0</b></div></div>' +
    '<div class="felt work-felt" data-stage hidden>' +
    '<div class="work-head"><b data-jname></b><span class="timer" data-left></span></div>' +
    '<div class="work-bar"><i data-bar></i></div>' +
    '<div class="work-body" data-body></div>' +
    '<div class="actions"><button type="button" class="ghost" data-quit>그만두기</button></div></div>';

  var q = function (s) { return root.querySelector(s); };
  var listEl = q('[data-list]'), stageEl = q('[data-stage]'), bodyEl = q('[data-body]');
  var barEl = q('[data-bar]'), leftEl = q('[data-left]'), resultEl = q('[data-result]'), earnedEl = q('[data-earned]');
  var cur = null, earned = 0;

  function begin(job) {
    if (cur) return;
    var now = Date.now();
    cur = { job: job, end: now + job.secs * 1000, n: 0, want: 0, done: false, timer: null };
    resultEl.textContent = '';
    listEl.hidden = true; stageEl.hidden = false;
    q('[data-jname]').textContent = job.icon + ' ' + job.name;
    barEl.style.width = '0%';
    job.build(cur, bodyEl);
    cur.timer = setInterval(tick, 100);
    tick();
  }

  function tick() {
    if (!cur) return;
    var total = cur.job.secs * 1000, left = cur.end - Date.now();
    if (left <= 0) return finish(true);
    barEl.style.width = Math.min(100, (1 - left / total) * 100) + '%';
    leftEl.textContent = Math.ceil(left / 1000) + '초';
  }

  function finish(finished) {
    if (!cur) return;
    var job = cur.job, pay = job.pay(cur, finished);
    cur.done = true; clearInterval(cur.timer); cur = null;
    stageEl.hidden = true; listEl.hidden = false; bodyEl.innerHTML = '';
    if (pay > 0) {
      C.add(pay); earned += pay; earnedEl.textContent = C.fmt(earned);
      resultEl.textContent = (finished ? '수고했어! ' : '중간에 그만뒀어. ') + C.fmt(pay) + '원을 받았어';
      resultEl.classList.add('win');
      C.toast('+' + C.fmt(pay) + ' 벌었어');
    } else {
      resultEl.textContent = finished ? '이번엔 한 푼도 못 벌었어' : '중간에 그만둬서 못 받았어';
      resultEl.classList.remove('win');
    }
  }

  root.querySelector('.jobs').addEventListener('click', function (e) {
    var b = e.target.closest('[data-job]'); if (!b) return;
    JOBS.forEach(function (j) { if (j.id === b.dataset.job) begin(j); });
  });
  q('[data-quit]').addEventListener('click', function () { finish(false); });
})();
