'use strict';

const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { randomUUID } = require('crypto');
const WebSocket = require('ws');
const { encodeAudioChunk } = require('../src/audioProtocol');

const root = path.join(__dirname, '..');
const runtimeEntry = path.join(root, 'src', 'app.ghost-audio.js');
const port = Number(process.env.SMOKE_PORT || 3210);
const dbPath = path.join(os.tmpdir(), `ghost-audio-smoke-${process.pid}-${Date.now()}.db`);
const sessionId = randomUUID();

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(baseUrl, timeoutMs = 15000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        try {
            const res = await fetch(`${baseUrl}/health`);
            if (res.ok) return;
        } catch {
            // retry
        }
        await delay(250);
    }
    throw new Error('timeout aguardando /health');
}

function waitForEvent(events, type, timeoutMs = 10000) {
    const startedAt = Date.now();
    return new Promise((resolve, reject) => {
        const timer = setInterval(() => {
            const found = events.find((event) => event?.type === type);
            if (found) {
                clearInterval(timer);
                resolve(found);
                return;
            }
            if (Date.now() - startedAt >= timeoutMs) {
                clearInterval(timer);
                reject(new Error(`timeout aguardando evento ${type}`));
            }
        }, 50);
    });
}

async function main() {
    const baseUrl = `http://127.0.0.1:${port}`;
    const liveUrl = `ws://127.0.0.1:${port}/ws/live-transcripts`;
    const audioUrl = `ws://127.0.0.1:${port}/ws/audio`;

    const child = spawn(process.execPath, [runtimeEntry], {
        cwd: root,
        env: {
            ...process.env,
            PORT: String(port),
            WHISPER_ENABLED: 'false',
            SQLITE_DB_PATH: dbPath,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    const cleanup = async () => {
        if (!child.killed) {
            child.kill();
            await new Promise((resolve) => child.once('exit', () => resolve()));
        }
        for (const suffix of ['', '-shm', '-wal']) {
            try {
                fs.unlinkSync(`${dbPath}${suffix}`);
            } catch {
                // ignore
            }
        }
    };

    try {
        await waitForServer(baseUrl);

        const healthRes = await fetch(`${baseUrl}/health`);
        if (!healthRes.ok) throw new Error(`/health retornou ${healthRes.status}`);
        const health = await healthRes.json();
        if (!health.ok) throw new Error('/health não retornou ok=true');

        const recordingsRes = await fetch(`${baseUrl}/api/recordings`);
        if (!recordingsRes.ok) throw new Error(`/api/recordings retornou ${recordingsRes.status}`);
        const initialRecordings = await recordingsRes.json();
        if (!Array.isArray(initialRecordings.items) || typeof initialRecordings.total !== 'number') {
            throw new Error('/api/recordings retornou shape inválido');
        }

        const liveEvents = [];
        const liveWs = new WebSocket(liveUrl);
        liveWs.on('message', (raw) => {
            try { liveEvents.push(JSON.parse(raw.toString())); } catch { /* ignore */ }
        });
        await new Promise((resolve, reject) => {
            liveWs.once('open', resolve);
            liveWs.once('error', reject);
        });
        await waitForEvent(liveEvents, 'live-connected');

        const audioEvents = [];
        const audioWs = new WebSocket(audioUrl);
        audioWs.on('message', (raw) => {
            try { audioEvents.push(JSON.parse(raw.toString())); } catch { /* ignore */ }
        });
        await new Promise((resolve, reject) => {
            audioWs.once('open', resolve);
            audioWs.once('error', reject);
        });

        audioWs.send(JSON.stringify({ type: 'auth', dev: true }));
        await waitForEvent(audioEvents, 'auth-ok');

        audioWs.send(JSON.stringify({
            type: 'session-start',
            sessionId,
            consentVersion: 1,
            sourceType: 'meet',
            tabUrl: 'https://meet.google.com/test-smoke',
            hostname: 'meet.google.com',
            tabTitle: 'Meet: Smoke Test',
            mimeType: 'audio/webm;codecs=opus',
            track: 'mix',
        }));
        await waitForEvent(audioEvents, 'session-ok');

        audioWs.send(JSON.stringify({ type: 'caption-partial', text: 'teste de migracao ghost audio' }));

        const payload = Buffer.from('smoke-audio-chunk');
        audioWs.send(encodeAudioChunk({ seq: 1, sessionId, payload }));

        audioWs.send(JSON.stringify({ type: 'session-stop', durationMs: 1200 }));
        const recordingSaved = await waitForEvent(audioEvents, 'recording_saved');
        await waitForEvent(audioEvents, 'session-stopped');
        await waitForEvent(audioEvents, 'transcript-ready');
        await waitForEvent(liveEvents, 'session-started');
        await waitForEvent(liveEvents, 'transcript-status');
        await waitForEvent(liveEvents, 'transcript-ready');

        const afterRecordingsRes = await fetch(`${baseUrl}/api/recordings`);
        const afterRecordings = await afterRecordingsRes.json();
        if (!afterRecordings.items.some((item) => item.id === recordingSaved.groupId)) {
            throw new Error('gravação salva não apareceu em /api/recordings');
        }

        const detailRes = await fetch(`${baseUrl}/api/recordings/${recordingSaved.groupId}`);
        if (!detailRes.ok) throw new Error(`/api/recordings/:id retornou ${detailRes.status}`);
        const detail = await detailRes.json();
        if (!detail.transcript || !String(detail.transcript.text || '').includes('teste de migracao')) {
            throw new Error('transcrição final não refletiu o fallback por legenda');
        }

        const audioRes = await fetch(`${baseUrl}/api/recordings/${recordingSaved.groupId}/audio`);
        if (!audioRes.ok) throw new Error(`/api/recordings/:id/audio retornou ${audioRes.status}`);

        liveWs.close();
        audioWs.close();

        console.log('[smoke-ghost-audio-runtime] OK');
        console.log(JSON.stringify({
            baseUrl,
            groupId: recordingSaved.groupId,
            recordingId: recordingSaved.recordingId,
            totalBefore: initialRecordings.total,
            totalAfter: afterRecordings.total,
        }, null, 2));
    } finally {
        await cleanup();
        if (stderr.trim()) {
            console.error(stderr.trim());
        }
    }
}

main().catch((err) => {
    console.error('[smoke-ghost-audio-runtime] FAIL:', err.message);
    process.exit(1);
});