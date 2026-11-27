// 테스트용 가짜 supabase-js: 같은 브라우저 컨텍스트의 페이지끼리 BroadcastChannel로 방 메시지를 주고받는다.
(function () {
  function createClient() {
    return {
      channel: function (name, opts) {
        var bc = new BroadcastChannel('fake-' + name), key = opts.config.presence.key, self = opts.config.broadcast.self;
        var handlers = [], presence = {}, myMeta = null, alive = true;
        function fire(type, ev, data) { handlers.forEach(function (h) { if (h.type === type && (!h.ev || h.ev === ev)) h.cb(data); }); }
        bc.onmessage = function (e) {
          var m = e.data; if (!alive) return;
          if (m.kind === 'bc') fire('broadcast', m.event, { payload: m.payload });
          else if (m.kind === 'pj') { presence[m.key] = [m.meta]; fire('presence', 'sync'); }
          else if (m.kind === 'pq' && myMeta) bc.postMessage({ kind: 'pj', key: key, meta: myMeta });
          else if (m.kind === 'pl') { delete presence[m.key]; fire('presence', 'leave', { key: m.key }); fire('presence', 'sync'); }
        };
        var ch = {
          on: function (type, filter, cb) { handlers.push({ type: type, ev: filter && (filter.event === 'sync' || filter.event === 'leave' ? filter.event : filter.event), cb: cb }); return ch; },
          subscribe: function (cb) { setTimeout(function () { bc.postMessage({ kind: 'pq' }); cb('SUBSCRIBED'); }, 20); return ch; },
          track: function (meta) { myMeta = meta; presence[key] = [meta]; bc.postMessage({ kind: 'pj', key: key, meta: meta }); fire('presence', 'sync'); return Promise.resolve(); },
          presenceState: function () { return presence; },
          send: function (m) { bc.postMessage({ kind: 'bc', event: m.event, payload: JSON.parse(JSON.stringify(m.payload)) }); return Promise.resolve('ok'); },
          _close: function () { if (myMeta) bc.postMessage({ kind: 'pl', key: key }); alive = false; bc.close(); }
        };
        return ch;
      },
      removeChannel: function (ch) { ch._close(); return Promise.resolve('ok'); },
      rpc: function () { return Promise.resolve({ error: null }); },
      from: function () { var q = { select: function () { return q; }, order: function () { return q; }, limit: function () { return Promise.resolve({ data: [], error: null }); } }; return q; }
    };
  }
  window.supabase = { createClient: createClient };
})();
