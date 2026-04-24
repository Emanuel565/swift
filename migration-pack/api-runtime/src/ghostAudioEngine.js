'use strict';

const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const { parseAudioChunk } = require('./audioProtocol');
const { createDefaultTranscriptionAdapter } = require('./transcriptionAdapter');
const { createRecordingTrack, upsertTranscriptByRecording } = require('./transcriptStore');

const VALID_TRACKS = new Set(['mic', 'tab', 'mix']);
function normalizeTrack(t) {
    const v = String(t || 'mix').toLowerCase();
    return VALID_TRACKS.has(v) ? v : 'mix';
}

const JWT_SECRET = process.env.JWT_SECRET;

const MAX_CONCURRENT_AUDIO_SESSIONS = Number(process.env.GHOST_AUDIO_MAX_SESSIONS || 4);
let activeAudioSessions = 0;
const liveClients = new Set();

const queue = [];
let active = 0;
const MAX_CONCURRENT_CONNECTIONS = Number(process.env.GHOST_AUDIO_MAX_WS || 8);

function sendJson(ws, obj) {
    if (ws.readyState === 1) ws.send(JSON.stringify(obj));
}

function emitLive(event) {
    for (const client of liveClients) sendJson(client, event);
}

function sanitizeCaptionPartial(text) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim();
    if (!clean) return '';

    const lower = clean.toLowerCase();
    const noisePatterns = [
        '[ghost-audio] ingestão:',
        'clique em nova reunião',
        'criar um link para compartilhar',
        'planejar com antecedência',
        'google agenda',
        'sua reunião está segura',
        'as pessoas só podem participar',
        'voltando à tela inicial',
        'segundos restantes',
    ];

    if (noisePatterns.some((p) => lower.includes(p))) return '';
    if (clean.length < 3) return '';
    return clean;
}

/**
 * WebSocket sem `server` no construtor: o upgrade é roteado manualmente em app.js
 * para o Express não responder ao GET de handshake (evita "Invalid frame header" no cliente).
 */
function createAudioWebSocketServer() {
    const adapter = createDefaultTranscriptionAdapter();
    const wss = new WebSocketServer({ noServer: true });

    wss.on('connection', (ws) => {
        const run = () => {
            active++;
            handleAudioConnection(ws, adapter)
                .catch((e) => console.error('[Ghost-Audio] connection', e))
                .finally(() => {
                    active--;
                    const next = queue.shift();
                    if (next) next();
                });
        };
        if (active < MAX_CONCURRENT_CONNECTIONS) run();
        else queue.push(run);
    });

    console.log('[Ghost-Audio] WebSocket /ws/audio (noServer — upgrade roteado no app.js)');
    return wss;
}

function createLiveTranscriptServer() {
    const liveWss = new WebSocketServer({ noServer: true });
    liveWss.on('connection', (ws) => {
        liveClients.add(ws);
        sendJson(ws, { type: 'live-connected', connectedAt: Date.now() });
        ws.on('close', () => liveClients.delete(ws));
    });
    return liveWss;
}

function handleAudioConnection(ws, adapter) {
    let state = 'AWAIT_AUTH';
    let userId = null;
    let userEmail = null;
    let transcriptionCtx = null;
    let currentSessionId = null;
    let consentVersion = null;
    let sourceMeta = null;

    const emit = (line) => sendJson(ws, line);

    const cleanup = async () => {
        if (!transcriptionCtx || !currentSessionId) return;
        const ctx = transcriptionCtx;
        transcriptionCtx = null;
        currentSessionId = null;
        const meta = sourceMeta;
        sourceMeta = null;
        consentVersion = null;
        activeAudioSessions = Math.max(0, activeAudioSessions - 1);

        let recordingId = null;
        let groupId = null;
        const track = normalizeTrack(meta?.track);
        const blob = Buffer.concat(ctx.buffers ?? []);
        const totalKB = (blob.length / 1024).toFixed(1);
        const durationMs = meta?.durationMs || 0;

        console.log(
            `[ghostAudioEngine] sessão encerrada: track=${track}, ${ctx.chunks} chunks, ${totalKB}KB, ` +
            `duração=${durationMs}ms, sessionId=${ctx.sessionId}`,
        );

        const audioWarning = blob.length < 5000 && durationMs > 3000
            ? `Áudio muito pequeno (${totalKB}KB para ${durationMs}ms, track=${track}). Verifique: (1) alguém estava falando? (2) a extensão foi recarregada? (3) a aba não está muted?`
            : null;

        // ─── Fase síncrona: grava recording e retorna rápido para o cliente ──
        try {
            const created = createRecordingTrack({
                sessionId: ctx.sessionId || randomSafeId(),
                userId,
                track,
                sourceType: meta?.sourceType || 'tab',
                sourceUrl: meta?.tabUrl ?? null,
                sourceHost: meta?.hostname ?? null,
                tabTitle: meta?.tabTitle ?? null,
                mimeType: meta?.mimeType || 'audio/webm;codecs=opus',
                durationMs: meta?.durationMs ?? null,
                audioBlob: blob,
            });
            recordingId = created.recordingId;
            groupId = created.groupId;

            upsertTranscriptByRecording({
                recordingId,
                text: '',
                status: 'processing',
            });

            emit({ type: 'recording_saved', recordingId, groupId, track, audioBytes: blob.length, warning: audioWarning });
            emit({ type: 'transcript-status', status: 'processing', recordingId, groupId, track });
            emitLive({ type: 'transcript-status', sessionId: ctx.sessionId, recordingId, groupId, track, status: 'processing' });

            if (audioWarning) {
                console.warn(`[ghostAudioEngine] ${audioWarning}`);
            }
        } catch (e) {
            console.error('[ghostAudioEngine] erro ao salvar recording:', e);
            sendJson(ws, { type: 'error', message: e.message || 'falha ao salvar gravação' });
            emitLive({
                type: 'transcript-status',
                sessionId: ctx.sessionId,
                status: 'error',
                error: e.message,
            });
            return;
        }

        // ─── Fase assíncrona em background: transcrição ─────────────────────
        // Não bloqueia o WebSocket nem o close() do cliente.
        (async () => {
            try {
                const lines = await adapter.onSessionEnd(ctx);
                const finalLine = [...lines].reverse().find((l) => l?.type === 'transcript' && !l.partial)
                    || [...lines].reverse().find((l) => l?.type === 'transcript');
                const finalText = String(finalLine?.text || '').trim() || '[transcrição vazia]';

                const status = finalText.toLowerCase().includes('falhou') ? 'error' : 'done';
                upsertTranscriptByRecording({
                    recordingId,
                    text: finalText,
                    status,
                });

                // O WebSocket do cliente pode já ter fechado; usar try no emit
                try {
                    emit({ type: 'transcript-ready', recordingId, groupId, track, status, text: finalText });
                } catch (_) { /* cliente desconectado, OK */ }

                emitLive({
                    type: 'transcript-ready',
                    recordingId,
                    groupId,
                    track,
                    sessionId: ctx.sessionId,
                    status,
                    text: finalText,
                    sourceType: meta?.sourceType || 'tab',
                    sourceHost: meta?.hostname || null,
                    tabTitle: meta?.tabTitle || null,
                });

                console.log(`[ghostAudioEngine] transcrição concluída para ${recordingId} (${status})`);
            } catch (e) {
                console.error('[ghostAudioEngine] erro na transcrição em background:', e);
                try {
                    upsertTranscriptByRecording({
                        recordingId,
                        text: `[erro na transcrição: ${e.message}]`,
                        status: 'error',
                    });
                } catch (_) { /* ignore */ }
                emitLive({
                    type: 'transcript-status',
                    sessionId: ctx.sessionId,
                    recordingId,
                    status: 'error',
                    error: e.message,
                });
            }
        })();
    };

    return new Promise((resolve) => {
        ws.on('message', async (raw, isBinary) => {
            try {
                if (state === 'AWAIT_AUTH') {
                    if (isBinary) {
                        sendJson(ws, { type: 'error', message: 'Envie JSON de autenticação primeiro.' });
                        ws.close();
                        return;
                    }
                    let msg;
                    try {
                        msg = JSON.parse(raw.toString());
                    } catch {
                        sendJson(ws, { type: 'error', message: 'JSON inválido.' });
                        return;
                    }
                    if (msg.type !== 'auth') {
                        sendJson(ws, {
                            type: 'error',
                            message: 'Envie { type:"auth", dev:true } ou { type:"auth", token }.',
                        });
                        return;
                    }

                    if (msg.dev === true) {
                        userId = null;
                        userEmail = null;
                        state = 'READY';
                        sendJson(ws, { type: 'auth-ok', dev: true, userId: null });
                        return;
                    }

                    if (msg.token && JWT_SECRET) {
                        try {
                            const payload = jwt.verify(msg.token, JWT_SECRET);
                            userId = payload.sub;
                            userEmail = payload.email;
                            state = 'READY';
                            sendJson(ws, { type: 'auth-ok', userId, email: userEmail });
                        } catch {
                            sendJson(ws, { type: 'error', message: 'Token inválido ou expirado.' });
                            ws.close();
                        }
                        return;
                    }

                    sendJson(ws, {
                        type: 'error',
                        message: 'Use dev:true para testes sem JWT ou configure JWT_SECRET e envie token.',
                    });
                    ws.close();
                    return;
                }

                if (state === 'READY' && !isBinary) {
                    let msg;
                    try {
                        msg = JSON.parse(raw.toString());
                    } catch {
                        sendJson(ws, { type: 'error', message: 'JSON inválido.' });
                        return;
                    }

                    if (msg.type === 'session-start') {
                        if (!msg.sessionId || typeof msg.consentVersion !== 'number') {
                            sendJson(ws, {
                                type: 'error',
                                message: 'session-start requer sessionId e consentVersion (número).',
                            });
                            return;
                        }
                        if (activeAudioSessions >= MAX_CONCURRENT_AUDIO_SESSIONS) {
                            sendJson(ws, { type: 'error', message: 'Limite de sessões de áudio atingido.' });
                            return;
                        }
                        consentVersion = msg.consentVersion;
                        sourceMeta = {
                            sourceType: msg.sourceType || 'tab',
                            tabUrl: msg.tabUrl || null,
                            hostname: msg.hostname || null,
                            tabTitle: msg.tabTitle || null,
                            mimeType: msg.mimeType || 'audio/webm;codecs=opus',
                            durationMs: typeof msg.durationMs === 'number' ? msg.durationMs : null,
                            track: normalizeTrack(msg.track),
                        };
                        transcriptionCtx = await adapter.onSessionStart({
                            sessionId: msg.sessionId,
                            userId,
                            consentVersion: msg.consentVersion,
                        });
                        currentSessionId = msg.sessionId;
                        activeAudioSessions++;
                        state = 'STREAMING';
                        sendJson(ws, { type: 'session-ok', sessionId: currentSessionId });
                        emitLive({
                            type: 'session-started',
                            sessionId: currentSessionId,
                            sourceType: sourceMeta.sourceType,
                            sourceHost: sourceMeta.hostname,
                            tabTitle: sourceMeta.tabTitle,
                        });
                        return;
                    }

                    if (msg.type === 'session-stop') {
                        if (sourceMeta && typeof msg.durationMs === 'number' && msg.durationMs > 0) {
                            sourceMeta.durationMs = msg.durationMs;
                        }
                        await cleanup();
                        state = 'READY';
                        sendJson(ws, { type: 'session-stopped' });
                        return;
                    }

                    sendJson(ws, { type: 'error', message: 'Comando desconhecido ou aguarde session-start.' });
                    return;
                }

                if (state === 'STREAMING' && isBinary) {
                    const parsed = parseAudioChunk(raw);
                    if (!parsed.ok) {
                        sendJson(ws, { type: 'error', message: parsed.error });
                        return;
                    }
                    if (parsed.sessionId !== currentSessionId) {
                        sendJson(ws, { type: 'error', message: 'sessionId do chunk não confere.' });
                        return;
                    }
                    const lines = await adapter.pushAudioChunk(transcriptionCtx, {
                        seq: parsed.seq,
                        payload: parsed.payload,
                    });
                    for (const line of lines) {
                        if (line?.type === 'transcript' && line.partial) {
                            const partial = {
                                type: 'transcript-partial',
                                sessionId: currentSessionId,
                                text: line.text,
                            };
                            emit(partial);
                            emitLive(partial);
                        } else {
                            emit(line);
                        }
                    }
                    return;
                }

                if (state === 'STREAMING' && !isBinary) {
                    let msg;
                    try {
                        msg = JSON.parse(raw.toString());
                    } catch {
                        sendJson(ws, { type: 'error', message: 'Durante streaming use frames binários ou session-stop.' });
                        return;
                    }
                    if (msg.type === 'caption-partial' && typeof msg.text === 'string') {
                        const sanitized = sanitizeCaptionPartial(msg.text);
                        if (!sanitized) return;
                        // Acumula legenda no contexto para usar como fallback de transcrição final
                        if (transcriptionCtx) {
                            if (!transcriptionCtx.captions) transcriptionCtx.captions = [];
                            transcriptionCtx.captions.push(sanitized);
                        }
                        const partial = {
                            type: 'transcript-partial',
                            sessionId: currentSessionId,
                            text: sanitized,
                            source: 'meet-captions',
                        };
                        emit(partial);
                        emitLive(partial);
                        return;
                    }
                    if (msg.type === 'session-stop') {
                        if (sourceMeta && typeof msg.durationMs === 'number' && msg.durationMs > 0) {
                            sourceMeta.durationMs = msg.durationMs;
                        }
                        await cleanup();
                        state = 'READY';
                        sendJson(ws, { type: 'session-stopped' });
                        return;
                    }
                    sendJson(ws, { type: 'error', message: 'Em streaming só chunks binários ou session-stop.' });
                }
            } catch (e) {
                console.error('[Ghost-Audio]', e);
                sendJson(ws, { type: 'error', message: e.message || 'Erro interno' });
            }
        });

        ws.on('close', async () => {
            await cleanup();
            resolve();
        });
    });
}

function randomSafeId() {
    return `session-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
}

module.exports = { createAudioWebSocketServer, createLiveTranscriptServer };
