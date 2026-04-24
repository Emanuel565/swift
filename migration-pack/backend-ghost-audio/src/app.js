require('dotenv').config();
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const { getProfile, getSeasonSegments } = require('./valorantClient');
const { buildAccount, buildMMR, buildTrackerStats } = require('./dataBuilder');
const profileRouter = require('./routes/profile');
const searchRouter = require('./routes/search');
const overviewRouter = require('./routes/overview');
const seasonsRouter = require('./routes/seasons');
const matchesRouter = require('./routes/matches');
const authRouter = require('./routes/auth');
const transcriptsRouter = require('./routes/transcripts');
const recordingsRouter = require('./routes/recordings');
const { createAudioWebSocketServer, createLiveTranscriptServer } = require('./ghostAudioEngine');
const whisperAdapter = require('./whisperAdapter');

const app = express();
app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    message: 'Radiante API — Ghost-Engine v2',
    endpoints: {
      profile: 'GET /profile/:name/:tag',
      overview: 'GET /overview/:name/:tag?playlist=competitive&seasonId=...',
      search: 'GET /search?name=frost&tag=br1&autocomplete=true',
      stream: 'WS /ws → { type:"search", name, tag }',
      ghostAudio: 'WS /ws/audio → auth dev|JWT + session-start + binary chunks',
      ghostLive: 'WS /ws/live-transcripts → monitoramento de transcrição parcial',
      transcripts: 'CRUD /api/transcripts',
      recordings: 'CRUD /api/recordings + stream /api/recordings/:id/audio',
    },
  });
});

app.use('/auth', authRouter);
app.use('/profile', profileRouter);
app.use('/overview', overviewRouter);
app.use('/seasons', seasonsRouter);
app.use('/matches', matchesRouter);
app.use('/search', searchRouter);
app.use('/api/transcripts', transcriptsRouter);
app.use('/api/recordings', recordingsRouter);

// ─── WebSocket servers (noServer) — upgrade explícito para não passar pelo Express ─
// Express não deve responder ao GET do handshake WS (causa "Invalid frame header" no browser).

const wssAudio = createAudioWebSocketServer();
const wssLive = createLiveTranscriptServer();

// ─── WebSocket Ghost Streamer ─────────────────────────────────────────────────
// Streams player data in two progressive phases:
//   Phase 1 "profile"  → account + mmr   (available after getProfile  ~1-2s)
//   Phase 2 "enriched" → trackerStats    (available after getSeasonSegments ~2-4s)

const wss = new WebSocketServer({ noServer: true });

const send = (ws, obj) => {
  if (ws.readyState === 1 /* OPEN */) ws.send(JSON.stringify(obj));
};

wss.on('connection', (ws) => {
  console.log('[Ghost-Stream] ▶ Cliente conectado');

  ws.on('message', async (raw) => {
    let parsed;
    try { parsed = JSON.parse(raw.toString()); } catch { return; }

    const { type, name, tag } = parsed ?? {};
    if (type !== 'search' || !name || !tag) return;

    try {
      // ── Phase 1 ── profile (rank + avatar + name)
      console.log(`[Ghost-Stream] ⚡ Phase 1 → ${name}#${tag}`);
      const profileRes = await getProfile(name, tag);
      const rawData = profileRes.data;
      const segments = rawData?.segments ?? [];
      const seasonSeg = segments.find(s => s.type === 'season');

      const account = buildAccount(rawData?.platformInfo, rawData?.userInfo, rawData?.metadata, name, tag);
      const mmr = buildMMR(seasonSeg);

      send(ws, { type: 'chunk', phase: 'profile', data: { account, mmr } });

      // ── Phase 2 ── enriched (season stats + agents + maps + weapons)
      console.log(`[Ghost-Stream] ⚡ Phase 2 → enriched data`);

      const resolvedSeasonId = segments.find(s => s.type === 'season')?.attributes?.seasonId;
      let agentRoleSeg = segments.filter(s => s.type === 'agent-role');
      let agentSegments = segments
        .filter(s => s.type === 'agent')
        .sort((a, b) => (b.stats?.matchesPlayed?.value ?? 0) - (a.stats?.matchesPlayed?.value ?? 0))
        .slice(0, 6);
      let mapSegments = segments
        .filter(s => s.type === 'map')
        .sort((a, b) => (b.stats?.matchesPlayed?.value ?? 0) - (a.stats?.matchesPlayed?.value ?? 0));
      let weaponSeg = [];
      let enrichedSeasonSeg = seasonSeg;

      if (resolvedSeasonId) {
        try {
          const seasonsRes = await getSeasonSegments(name, tag, 'competitive', resolvedSeasonId);
          const sd = seasonsRes.data ?? [];

          enrichedSeasonSeg = sd.find(s => s.type === 'season') ?? seasonSeg;

          const roleData = sd.filter(s => s.type === 'agent-role');
          if (roleData.length > 0) agentRoleSeg = roleData;

          weaponSeg = sd
            .filter(s => s.type === 'weapon')
            .sort((a, b) => (b.stats?.kills?.value ?? 0) - (a.stats?.kills?.value ?? 0))
            .slice(0, 5);

          const sa = sd
            .filter(s => s.type === 'agent')
            .sort((a, b) => (b.stats?.matchesPlayed?.value ?? 0) - (a.stats?.matchesPlayed?.value ?? 0))
            .slice(0, 6);
          if (sa.length > 0) agentSegments = sa;

          const sm = sd
            .filter(s => s.type === 'map')
            .sort((a, b) => (b.stats?.matchesPlayed?.value ?? 0) - (a.stats?.matchesPlayed?.value ?? 0));
          if (sm.length > 0) mapSegments = sm;

        } catch {
          console.warn('[Ghost-Stream] Season detail falhou — usando perfil base.');
        }
      }

      const trackerStats = buildTrackerStats(enrichedSeasonSeg, agentRoleSeg, weaponSeg, agentSegments, mapSegments);

      send(ws, { type: 'chunk', phase: 'enriched', data: { trackerStats } });
      send(ws, { type: 'done' });

      console.log(`[Ghost-Stream] ✅ Stream completo → ${name}#${tag}`);

    } catch (err) {
      console.error('[Ghost-Stream] Erro:', err.message);
      send(ws, { type: 'error', message: err.message || 'Erro ao buscar dados.' });
    }
  });

  ws.on('close', () => console.log('[Ghost-Stream] ◼ Cliente desconectado'));
});

const server = http.createServer((req, res) => {
  // Handshake WebSocket: não enviar ao Express (resposta HTTP quebra o upgrade).
  if (String(req.headers.upgrade || '').toLowerCase() === 'websocket') {
    return;
  }
  app(req, res);
});

server.on('upgrade', (request, socket, head) => {
  try {
    const host = request.headers.host || '127.0.0.1';
    const pathname = new URL(request.url || '/', `http://${host}`).pathname;
    if (pathname === '/ws/audio') {
      wssAudio.handleUpgrade(request, socket, head, (ws) => {
        wssAudio.emit('connection', ws, request);
      });
    } else if (pathname === '/ws/live-transcripts') {
      wssLive.handleUpgrade(request, socket, head, (ws) => {
        wssLive.emit('connection', ws, request);
      });
    } else if (pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  } catch {
    socket.destroy();
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Servidor em http://localhost:${PORT} · WS /ws · Ghost-Audio /ws/audio`);

  if (whisperAdapter.isEnabled()) {
    const model = process.env.WHISPER_MODEL || 'Xenova/whisper-small';
    const lang = process.env.WHISPER_LANG || 'portuguese';
    console.log(`[Whisper] ATIVO — modelo=${model}, idioma=${lang}`);
    whisperAdapter.warmup().catch((e) => {
      console.warn('[Whisper] warmup em background falhou:', e.message);
    });
  } else {
    console.log('[Whisper] DESATIVADO — defina WHISPER_ENABLED=true no .env para ativar transcrição local');
  }
});

