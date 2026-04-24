require('dotenv').config();
const http = require('http');
const express = require('express');
const recordingsRouter = require('./routes/recordings');
const transcriptsRouter = require('./routes/transcripts');
const { createAudioWebSocketServer, createLiveTranscriptServer } = require('./ghostAudioEngine');
const whisperAdapter = require('./whisperAdapter');

const app = express();
app.use(express.json());

app.get('/', (req, res) => {
    res.json({
        message: 'Radiante Ghost Audio Runtime',
        endpoints: {
            ghostAudio: 'WS /ws/audio → auth dev|JWT + session-start + binary chunks',
            ghostLive: 'WS /ws/live-transcripts → monitoramento de transcrição parcial',
            transcripts: 'CRUD /api/transcripts',
            recordings: 'CRUD /api/recordings + stream /api/recordings/:id/audio',
            health: 'GET /health',
        },
    });
});

app.get('/health', (req, res) => {
    res.json({ ok: true, service: 'ghost-audio-runtime' });
});

app.use('/api/transcripts', transcriptsRouter);
app.use('/api/recordings', recordingsRouter);

const wssAudio = createAudioWebSocketServer();
const wssLive = createLiveTranscriptServer();

const server = http.createServer((req, res) => {
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
        } else {
            socket.destroy();
        }
    } catch {
        socket.destroy();
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Ghost Audio Runtime em http://localhost:${PORT} · WS /ws/audio · WS /ws/live-transcripts`);

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