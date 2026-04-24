'use strict';

const { randomUUID } = require('crypto');
const whisperAdapter = require('./whisperAdapter');

/**
 * Adaptador plugável para STT.
 *
 * Cadeia de prioridades em onSessionEnd:
 *   1. GHOST_AUDIO_STT_URL (HTTP externo, ex.: Whisper.cpp server)
 *   2. Whisper local via @xenova/transformers (WHISPER_ENABLED=true)
 *   3. Legendas do Meet acumuladas em ctx.captions
 *   4. Placeholder informativo
 */

function getEnv(name, def) {
    const v = process.env[name];
    return v === undefined || v === '' ? def : v;
}

async function postSttUrl(url, audioBuffer) {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: audioBuffer,
    });
    if (!res.ok) throw new Error(`STT HTTP ${res.status}`);
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
        const j = await res.json();
        return j.text ?? j.transcript ?? j.result ?? '';
    }
    return (await res.text()).trim();
}

function createDefaultTranscriptionAdapter() {
    const sttUrl = getEnv('GHOST_AUDIO_STT_URL', '');
    const emitIngestionDebug = String(getEnv('GHOST_AUDIO_EMIT_INGEST_DEBUG', 'false')).toLowerCase() === 'true';

    return {
        async onSessionStart({ sessionId, userId, consentVersion }) {
            return {
                id: randomUUID(),
                sessionId,
                userId,
                consentVersion,
                totalBytes: 0,
                chunks: 0,
                lastSeq: -1,
                buffers: [],
            };
        },

        async pushAudioChunk(ctx, { seq, payload }) {
            if (seq <= ctx.lastSeq) return [];
            ctx.lastSeq = seq;
            ctx.chunks++;
            ctx.totalBytes += payload.length;
            ctx.buffers.push(payload);

            const out = [];
            if (emitIngestionDebug && ctx.chunks % 12 === 0) {
                out.push({
                    type: 'transcript',
                    text: `[ghost-audio] ingestão: ${ctx.chunks} chunks, ${ctx.totalBytes} bytes`,
                    partial: true,
                });
            }
            return out;
        },

        async onSessionEnd(ctx) {
            const lines = [];
            const blob = Buffer.concat(ctx.buffers);

            // 1. STT externo via HTTP (prioridade máxima, se configurado)
            if (sttUrl && blob.length > 0) {
                try {
                    const text = await postSttUrl(sttUrl, blob);
                    lines.push({
                        type: 'transcript',
                        text: text || `[ghost-audio] STT vazio — ${ctx.chunks} chunks`,
                        partial: false,
                    });
                    return lines;
                } catch (e) {
                    console.warn(`[transcriptionAdapter] STT externo falhou: ${e.message} — tentando fallbacks`);
                }
            }

            // 2. Whisper local via @xenova/transformers
            if (whisperAdapter.isEnabled() && blob.length > 0) {
                try {
                    const text = await whisperAdapter.transcribeWebm(blob);
                    if (text && text.trim()) {
                        lines.push({
                            type: 'transcript',
                            text: text.trim(),
                            partial: false,
                        });
                        return lines;
                    }
                    console.warn('[transcriptionAdapter] Whisper retornou vazio — tentando fallback de legendas');
                } catch (e) {
                    console.warn(`[transcriptionAdapter] Whisper local falhou: ${e.message}`);
                }
            }

            // 3. Fallback: legendas do Meet acumuladas durante a sessão
            const captions = Array.isArray(ctx.captions) ? ctx.captions : [];
            if (captions.length > 0) {
                const deduped = captions.filter((c, i) => i === 0 || c !== captions[i - 1]);
                lines.push({
                    type: 'transcript',
                    text: deduped.join(' '),
                    partial: false,
                });
                return lines;
            }

            // 4. Placeholder quando nada funcionou
            lines.push({
                type: 'transcript',
                text: `[sem transcrição — ${ctx.chunks} chunks de áudio capturados. Ative WHISPER_ENABLED, configure GHOST_AUDIO_STT_URL ou ative as legendas do Meet.]`,
                partial: false,
            });
            return lines;
        },
    };
}

module.exports = { createDefaultTranscriptionAdapter };
