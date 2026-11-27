/* Supabase 공개 설정. anon 키는 브라우저에 노출되는 게 정상이고, 쓰기는 DB 정책과 함수가 막는다. */
window.CASINO_CONFIG = {
  url: 'https://xezyfxeuxpsaplxogbvg.supabase.co',
  key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhlenlmeGV1eHBzYXBseG9nYnZnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU3MTg3MzEsImV4cCI6MjExMTI5NDczMX0.9dfz16YHEvmB3pHJU6FVD6RNyL3NyUVxTAglGj2S_GE'
};
window.CasinoSB = (window.supabase && window.CASINO_CONFIG)
  ? window.supabase.createClient(window.CASINO_CONFIG.url, window.CASINO_CONFIG.key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      realtime: { params: { eventsPerSecond: 20 } }
    })
  : null;
