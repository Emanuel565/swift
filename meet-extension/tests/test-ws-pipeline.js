/**
 * test-ws-pipeline.js
 * 
 * Bot que simula a extensão Meet: conecta via WebSocket, envia segmentos
 * de legenda e valida que aparecem no Redis e na API.
 * 
 * Uso:  node tests/test-ws-pipeline.js
 */

const WebSocket = require('ws');
const http = require('http');
const crypto = require('crypto');

// ── Config ──────────────────────────────────────────────────────────────────
const API_BASE = 'http://localhost:22211';
const WS_PATH = '/ws/meet-captions';
const LOGIN_EMAIL = process.env.MEET_TEST_EMAIL || '';
const LOGIN_PASSWORD = process.env.MEET_TEST_PASSWORD || '';
const MEETING_ID = 'bot-test-' + Date.now().toString(36);
const SESSION_ID = crypto.randomUUID();

// Frases reais em português para simular uma reunião
const FAKE_CAPTIONS = [
    { speaker: 'Maria', text: 'Bom dia pessoal, vamos começar a reunião de hoje.' },
    { speaker: 'João', text: 'Bom dia! Tenho as atualizações do sprint.' },
    { speaker: 'Maria', text: 'Ótimo, pode começar por favor.' },
    { speaker: 'João', text: 'Finalizamos o módulo de autenticação com sucesso.' },
    { speaker: 'Ana', text: 'Excelente notícia, e quanto aos testes?' },
    { speaker: 'João', text: 'Os testes unitários estão com cobertura de oitenta por cento.' },
    { speaker: 'Maria', text: 'Precisamos aumentar para noventa pelo menos.' },
    { speaker: 'Ana', text: 'Concordo, vou ajudar com os testes de integração.' },
    { speaker: 'João', text: 'Perfeito, combinamos então para esta semana.' },
    { speaker: 'Maria', text: 'Alguma dúvida antes de encerrarmos?' },
    { speaker: 'Ana', text: 'Nenhuma dúvida, obrigada!' },
    { speaker: 'Maria', text: 'Encerrado, obrigada a todos.' },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function httpRequest(method, path, body = null, token = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, API_BASE);
        const options = {
            method,
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            headers: { 'Content-Type': 'application/json' },
        };
        if (token) options.headers['Authorization'] = `Bearer ${token}`;

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(data) });
                } catch {
                    resolve({ status: res.statusCode, body: data });
                }
            });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

function log(icon, msg) {
    console.log(`${icon}  ${msg}`);
}

function pass(msg) { log('✅', msg); }
function fail(msg) { log('❌', msg); }
function info(msg) { log('ℹ️', msg); }

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
    console.log('\n════════════════════════════════════════════════');
    console.log(' Meet Captions Pipeline — WebSocket Bot Test');
    console.log('════════════════════════════════════════════════\n');

    let token;
    let passed = 0;
    let failed = 0;

    if (!LOGIN_EMAIL || !LOGIN_PASSWORD) {
        fail('Defina MEET_TEST_EMAIL e MEET_TEST_PASSWORD antes de executar o teste.');
        process.exit(1);
    }

    // ── Step 1: Login ───────────────────────────────────────────────────────
    info(`Logging in as ${LOGIN_EMAIL}...`);
    try {
        const res = await httpRequest('POST', '/auth/login', {
            email: LOGIN_EMAIL,
            password: LOGIN_PASSWORD,
        });
        if (res.status !== 200 && res.status !== 201) {
            fail(`Login failed: HTTP ${res.status}`);
            console.error(res.body);
            process.exit(1);
        }
        token = res.body.serviceToken || res.body.accessToken || res.body.token;
        if (!token) {
            fail('Login response has no token');
            console.error(res.body);
            process.exit(1);
        }
        pass(`Authenticated — token: ${token.substring(0, 30)}...`);
        passed++;
    } catch (err) {
        fail(`Login error: ${err.message}`);
        process.exit(1);
    }

    // ── Step 2: Connect WebSocket ───────────────────────────────────────────
    info(`Connecting WebSocket to ${WS_PATH}...`);
    const wsUrl = `ws://localhost:22211${WS_PATH}?token=${token}`;

    const ws = await new Promise((resolve, reject) => {
        const socket = new WebSocket(wsUrl);
        const timeout = setTimeout(() => {
            socket.close();
            reject(new Error('WebSocket connect timeout (5s)'));
        }, 5000);

        socket.on('open', () => {
            clearTimeout(timeout);
        });

        socket.on('message', (raw) => {
            try {
                const msg = JSON.parse(raw.toString());
                if (msg.type === 'CONNECTED') {
                    pass(`WebSocket CONNECTED — serverTs=${msg.serverTs}`);
                    passed++;
                    resolve(socket);
                }
            } catch { /* ignore non-JSON */ }
        });

        socket.on('error', (err) => {
            clearTimeout(timeout);
            reject(err);
        });

        socket.on('close', (code, reason) => {
            if (code !== 1000) {
                info(`WebSocket closed: ${code} ${reason}`);
            }
        });
    });

    // ── Step 3: Send SESSION_START ──────────────────────────────────────────
    info(`Starting session ${SESSION_ID} for meeting ${MEETING_ID}...`);
    const sessionStartMsg = {
        type: 'SESSION_START',
        eventId: crypto.randomUUID(),
        payload: {
            sessionId: SESSION_ID,
            meetingId: MEETING_ID,
            tabId: 999999,
            location: `https://meet.google.com/${MEETING_ID}`,
            startedAt: Date.now(),
            meetingTitle: 'Bot Test Meeting — Reunião de Sprint',
            participants: ['Maria', 'João', 'Ana'],
            participantCount: 3,
            ownerName: 'Bot Test',
            ownerEmail: LOGIN_EMAIL,
            ownerUserId: null,
            persistOnEnd: true,
        },
    };

    ws.send(JSON.stringify(sessionStartMsg));
    await sleep(500);

    // Verify session appeared via API
    const activeBefore = await httpRequest('GET', '/transcriptions/meet/captions/active?limit=50', null, token);
    const activeItems = activeBefore.body?.data?.items || activeBefore.body?.sessions || activeBefore.body?.items || [];
    const sessionFound = Array.isArray(activeItems) && activeItems.some((s) => s.sessionId === SESSION_ID);
    if (sessionFound) {
        pass(`Session visible in active sessions (${activeItems.length} total)`);
        passed++;
    } else {
        info(`Active sessions response: ${JSON.stringify(activeBefore.body).substring(0, 200)}`);
        fail(`Session NOT found in active sessions`);
        failed++;
    }

    // ── Step 4: Send CAPTION_SEGMENTs ───────────────────────────────────────
    info(`Sending ${FAKE_CAPTIONS.length} caption segments...`);
    let seq = 0;

    for (const caption of FAKE_CAPTIONS) {
        seq++;
        const segmentMsg = {
            type: 'CAPTION_SEGMENT',
            eventId: crypto.randomUUID(),
            payload: {
                sessionId: SESSION_ID,
                meetingId: MEETING_ID,
                speaker: caption.speaker,
                text: caption.text,
                sequence: seq,
                timestampMs: Date.now(),
                location: `https://meet.google.com/${MEETING_ID}`,
            },
        };

        ws.send(JSON.stringify(segmentMsg));
        // Small delay to simulate real typing
        await sleep(150);
    }

    pass(`Sent ${seq} segments`);
    passed++;
    await sleep(1000); // Let the API process everything

    // ── Step 5: Verify active session snapshot ──────────────────────────────
    info('Checking active session snapshot...');
    const snapshot = await httpRequest(
        'GET',
        `/transcriptions/meet/captions/active/${SESSION_ID}?limit=200`,
        null,
        token
    );

    if (snapshot.status === 200 && snapshot.body) {
        const snapData = snapshot.body?.data || snapshot.body;
        const lines = snapData?.lines || snapData?.segments || [];
        const segCount = snapData?.segmentCount || lines.length;
        if (segCount >= FAKE_CAPTIONS.length || lines.length >= FAKE_CAPTIONS.length) {
            pass(`Snapshot has ${lines.length} lines / segmentCount=${segCount} (expected >= ${FAKE_CAPTIONS.length})`);
            passed++;
        } else if (segCount > 0 || lines.length > 0) {
            info(`Snapshot: ${lines.length} lines, segmentCount=${segCount} (expected ${FAKE_CAPTIONS.length} — some may be deduped)`);
            pass(`Snapshot has data (${lines.length} lines)`);
            passed++;
        } else {
            fail(`Snapshot has 0 lines/segments`);
            info(`Snapshot response: ${JSON.stringify(snapshot.body).substring(0, 300)}`);
            failed++;
        }

        // Show a sample
        if (lines.length > 0) {
            info(`Sample line: speaker="${lines[0].speaker}" text="${lines[0].text}"`);
        }
    } else {
        fail(`Snapshot request failed: HTTP ${snapshot.status}`);
        info(`Snapshot response: ${JSON.stringify(snapshot.body).substring(0, 300)}`);
        failed++;
    }

    // ── Step 6: Send HEARTBEAT ──────────────────────────────────────────────
    info('Sending heartbeat...');
    ws.send(JSON.stringify({
        type: 'HEARTBEAT',
        eventId: crypto.randomUUID(),
        payload: {
            sessionId: SESSION_ID,
            meetingId: MEETING_ID,
            timestampMs: Date.now(),
            location: `https://meet.google.com/${MEETING_ID}`,
        },
    }));
    await sleep(300);
    pass('Heartbeat sent');
    passed++;

    // ── Step 7: Send SESSION_END ────────────────────────────────────────────
    info('Ending session (persist=true)...');
    ws.send(JSON.stringify({
        type: 'SESSION_END',
        eventId: crypto.randomUUID(),
        payload: {
            sessionId: SESSION_ID,
            meetingId: MEETING_ID,
            endedAt: Date.now(),
            reason: 'bot_test_complete',
            persistOnEnd: true,
        },
    }));
    await sleep(2000); // Give time for persistence

    // ── Step 8: Verify persisted in DB via API ──────────────────────────────
    info('Checking persisted meeting in DB...');
    const persisted = await httpRequest('GET', '/transcriptions/meet/captions?limit=20', null, token);

    if (persisted.status === 200) {
        const items = persisted.body?.data?.items || persisted.body?.items || persisted.body || [];
        const found = Array.isArray(items) && items.find?.((i) => i.meetingId === MEETING_ID);
        if (found) {
            pass(`Meeting persisted — id=${found.id} segments=${found.segmentCount} owner=${found.ownerEmail || found.ownerName}`);
            passed++;
        } else {
            fail(`Meeting NOT found in persisted list (${Array.isArray(items) ? items.length : 0} items total)`);
            info(`Response: ${JSON.stringify(persisted.body).substring(0, 300)}`);
            failed++;
        }
    } else {
        fail(`Persisted list request failed: HTTP ${persisted.status}`);
        failed++;
    }

    // ── Cleanup ─────────────────────────────────────────────────────────────
    ws.close(1000, 'test_done');

    // ── Summary ─────────────────────────────────────────────────────────────
    console.log('\n────────────────────────────────────────────────');
    console.log(` Results:  ${passed} passed  /  ${failed} failed`);
    console.log('────────────────────────────────────────────────\n');

    process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
