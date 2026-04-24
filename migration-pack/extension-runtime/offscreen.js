'use strict';

// ─── Encoder do frame binário (GA v1) ────────────────────────────────────────

function padSessionId(id) {
    const s = String(id);
    return s.length > 36 ? s.slice(0, 36) : s.padEnd(36, ' ');
}

function encodeAudioChunk(seq, sessionId, payload) {
    const p = payload instanceof Uint8Array ? payload : new Uint8Array(payload);
    const buf = new Uint8Array(48 + p.length);
    buf[0] = 0x47;
    buf[1] = 0x41;
    buf[2] = 0x01;
    buf[3] = 0x01;
    new DataView(buf.buffer).setUint32(4, seq >>> 0, false);
    const sid = padSessionId(sessionId);
    for (let i = 0; i < 36; i++) buf[8 + i] = sid.charCodeAt(i) & 255;
    new DataView(buf.buffer).setUint32(44, p.length, false);
    buf.set(p, 48);
    return buf.buffer;
}

// ─── Estado interno ──────────────────────────────────────────────────────────

let recorder = null;
let captureStream = null;          // stream do tabCapture (áudio que a aba toca)
let micStream = null;              // stream do microfone do usuário
let mixedStream = null;            // stream mixado para o MediaRecorder
let ws = null;
let sessionId = '';
let seq = 0;
let pendingSendQueue = [];
let handshakeDone = false;
let stopping = false;
let startedAt = 0;

// Monitoramento de nível de áudio (para UX + diagnóstico de aba silenciosa)
let audioContext = null;
let analyser = null;
let levelMonitorTimer = null;
let silenceMs = 0; // milissegundos consecutivos sem áudio significativo

// Fila FIFO para preservar ordem temporal dos chunks do MediaRecorder.
// Necessário porque `ev.data.arrayBuffer()` é async: sem serialização,
// chunks "atrasados" podem chegar ao servidor com seq maior que os mais antigos,
// o que faria o backend descartá-los silenciosamente (seq <= lastSeq).
const chunkQueue = [];
let chunkQueueProcessing = false;

async function processChunkQueue() {
    if (chunkQueueProcessing) return;
    chunkQueueProcessing = true;
    try {
        while (chunkQueue.length > 0) {
            const { seq: chunkSeq, blob } = chunkQueue.shift();
            try {
                const buf = await blob.arrayBuffer();
                const binary = encodeAudioChunk(chunkSeq, sessionId, new Uint8Array(buf));
                sendChunk(binary);
            } catch (e) {
                console.error('[offscreen] processChunkQueue', e);
            }
        }
    } finally {
        chunkQueueProcessing = false;
    }
}

async function drainChunkQueue() {
    // Aguarda fila esvaziar totalmente (usado em stopCapture)
    while (chunkQueue.length > 0 || chunkQueueProcessing) {
        await new Promise((r) => setTimeout(r, 50));
    }
}

// ─── WebSocket helpers ───────────────────────────────────────────────────────

function waitJson(socket, predicate, timeoutMs) {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => {
            cleanup();
            reject(new Error('Timeout no handshake'));
        }, timeoutMs);

        function cleanup() {
            clearTimeout(t);
            socket.removeEventListener('message', onMsg);
        }

        function onMsg(ev) {
            if (typeof ev.data !== 'string') return;
            try {
                const j = JSON.parse(ev.data);
                if (predicate(j)) {
                    cleanup();
                    resolve(j);
                }
            } catch (_) { /* ignore */ }
        }

        socket.addEventListener('message', onMsg);
    });
}

function onServerMessage(ev) {
    if (typeof ev.data !== 'string') return;
    try {
        const j = JSON.parse(ev.data);
        chrome.runtime.sendMessage({ type: 'GHOST_SERVER_EVENT', payload: j })
            .catch(() => { /* popup fechado é ok */ });
    } catch (_) { /* ignore */ }
}

async function openSocketAndHandshake(wsUrl, devMode, token, sourceMeta, consentVersion) {
    const socket = new WebSocket(wsUrl);

    await new Promise((resolve, reject) => {
        const onOpen = () => { cleanup(); resolve(); };
        const onErr = () => { cleanup(); reject(new Error('WebSocket falhou ao abrir')); };
        const onClose = () => { cleanup(); reject(new Error('WebSocket fechou antes do open')); };
        function cleanup() {
            socket.removeEventListener('open', onOpen);
            socket.removeEventListener('error', onErr);
            socket.removeEventListener('close', onClose);
        }
        socket.addEventListener('open', onOpen);
        socket.addEventListener('error', onErr);
        socket.addEventListener('close', onClose);
    });

    // Auth
    socket.send(JSON.stringify(devMode ? { type: 'auth', dev: true } : { type: 'auth', token }));
    const authRes = await waitJson(socket, (j) => j.type === 'auth-ok' || j.type === 'error', 12_000);
    if (authRes.type === 'error') {
        try { socket.close(); } catch (_) {}
        throw new Error(authRes.message || 'Auth falhou');
    }

    // Session-start
    socket.send(JSON.stringify({
        type: 'session-start',
        sessionId,
        consentVersion,
        ...sourceMeta,
    }));
    const sessRes = await waitJson(socket, (j) => j.type === 'session-ok' || j.type === 'error', 12_000);
    if (sessRes.type === 'error') {
        try { socket.close(); } catch (_) {}
        throw new Error(sessRes.message || 'Sessão rejeitada');
    }

    socket.addEventListener('message', onServerMessage);
    return socket;
}

// ─── Envio de chunks binários ────────────────────────────────────────────────

function flushPendingChunks() {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    while (pendingSendQueue.length > 0) {
        const chunk = pendingSendQueue.shift();
        try {
            ws.send(chunk);
        } catch (e) {
            console.error('[offscreen] falha ao enviar chunk', e);
            break;
        }
    }
}

function sendChunk(binary) {
    if (ws && ws.readyState === WebSocket.OPEN && handshakeDone) {
        try {
            ws.send(binary);
            return;
        } catch (e) {
            console.error('[offscreen] send erro, enfileirando', e);
        }
    }
    pendingSendQueue.push(binary);
}

// ─── Controle por mensagens do background ───────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
    if (msg.type === 'OFFSCREEN_START') {
        startCapture(msg)
            .then(() => sendResponse({ ok: true }))
            .catch((e) => {
                console.error('[offscreen] OFFSCREEN_START erro', e);
                sendResponse({ ok: false, error: String(e.message || e) });
            });
        return true;
    }
    if (msg.type === 'OFFSCREEN_STOP') {
        stopCapture()
            .then(() => sendResponse({ ok: true }))
            .catch((e) => sendResponse({ ok: false, error: String(e.message || e) }));
        return true;
    }
    if (msg.type === 'OFFSCREEN_CAPTION') {
        if (ws && ws.readyState === WebSocket.OPEN && handshakeDone && msg.text) {
            try {
                ws.send(JSON.stringify({ type: 'caption-partial', text: String(msg.text) }));
            } catch (_) { /* ignore */ }
        }
        return false;
    }
    return false;
});

async function startCapture(cfg) {
    await stopCapture();

    sessionId = cfg.sessionId;
    seq = 0;
    pendingSendQueue = [];
    handshakeDone = false;
    stopping = false;
    startedAt = Date.now();

    const sourceMeta = cfg.sourceMeta || {};
    const mimeType = cfg.mimeType || 'audio/webm;codecs=opus';

    // 1. Captura de áudio da aba
    captureStream = await navigator.mediaDevices.getUserMedia({
        audio: {
            mandatory: {
                chromeMediaSource: 'tab',
                chromeMediaSourceId: cfg.streamId,
            },
        },
        video: false,
    });

    // 1.0. Validação imediata do stream de captura
    const audioTracks = captureStream.getAudioTracks();
    if (audioTracks.length === 0) {
        throw new Error('tabCapture retornou stream sem tracks de áudio. Verifique permissões da extensão.');
    }
    const firstTrack = audioTracks[0];
    console.log('[offscreen] tabCapture ativo:', {
        label: firstTrack.label,
        readyState: firstTrack.readyState,
        muted: firstTrack.muted,
        enabled: firstTrack.enabled,
        settings: firstTrack.getSettings?.(),
    });
    if (firstTrack.muted) {
        chrome.runtime.sendMessage({
            type: 'GHOST_SERVER_EVENT',
            payload: {
                type: 'error',
                message: 'Aba em modo muted — clique no ícone de som da aba do Meet para desmutar antes de gravar.',
            },
        }).catch(() => {});
    }

    // 1.1. Captura do MICROFONE (para pegar a fala do próprio usuário, que o tabCapture não pega)
    const wantMic = cfg.includeMic !== false; // default: true
    if (wantMic) {
        try {
            micStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                },
                video: false,
            });
            const micTracks = micStream.getAudioTracks();
            console.log('[offscreen] microfone ativo:', {
                label: micTracks[0]?.label,
                muted: micTracks[0]?.muted,
                enabled: micTracks[0]?.enabled,
            });
        } catch (e) {
            console.warn('[offscreen] microfone indisponível (seguindo só com tabCapture):', e.message);
            micStream = null;
            chrome.runtime.sendMessage({
                type: 'GHOST_SERVER_EVENT',
                payload: {
                    type: 'error',
                    message: 'Microfone não disponível: ' + e.message + '. Gravação continua só com áudio da aba.',
                },
            }).catch(() => {});
        }
    }

    // 1.2. Setup AudioContext: mixa tabCapture + microfone, roteia para speaker e MediaRecorder
    try {
        audioContext = new AudioContext();

        const tabSource = audioContext.createMediaStreamSource(captureStream);

        // Routing de volta ao speaker (usuário continua ouvindo a reunião durante a gravação).
        // Só aba → speaker; microfone NÃO volta ao speaker (evita echo).
        tabSource.connect(audioContext.destination);

        // Mix node para gravação: aba + mic somados
        const mixDestination = audioContext.createMediaStreamDestination();

        const tabGain = audioContext.createGain();
        tabGain.gain.value = 1.0;
        tabSource.connect(tabGain).connect(mixDestination);

        if (micStream) {
            const micSource = audioContext.createMediaStreamSource(micStream);
            const micGain = audioContext.createGain();
            micGain.gain.value = 1.0;
            micSource.connect(micGain).connect(mixDestination);
        }

        mixedStream = mixDestination.stream;

        // Analyser para monitorar nível (do mix, então inclui mic + aba)
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        const analyserSource = audioContext.createMediaStreamSource(mixedStream);
        analyserSource.connect(analyser);

        const dataArray = new Uint8Array(analyser.fftSize);
        silenceMs = 0;

        levelMonitorTimer = setInterval(() => {
            if (!analyser) return;
            analyser.getByteTimeDomainData(dataArray);
            let sumSquares = 0;
            for (let i = 0; i < dataArray.length; i++) {
                const v = (dataArray[i] - 128) / 128;
                sumSquares += v * v;
            }
            const rms = Math.sqrt(sumSquares / dataArray.length);
            const level = Math.min(1, rms * 4);

            if (rms < 0.01) silenceMs += 300;
            else silenceMs = 0;

            chrome.runtime.sendMessage({
                type: 'GHOST_AUDIO_LEVEL',
                level,
                silenceMs,
            }).catch(() => {});
        }, 300);
    } catch (e) {
        console.warn('[offscreen] AudioContext mix falhou, fallback para tabCapture puro:', e.message);
        mixedStream = captureStream;
    }

    // 2. WebSocket + handshake completo
    ws = await openSocketAndHandshake(
        cfg.wsUrl,
        !!cfg.devMode,
        cfg.token || '',
        sourceMeta,
        cfg.consentVersion,
    );
    handshakeDone = true;
    flushPendingChunks();

    // 3. MediaRecorder — grava do stream mixado (aba + mic) se disponível,
    // senão cai no tabCapture puro como fallback
    const options = {};
    if (MediaRecorder.isTypeSupported(mimeType)) {
        options.mimeType = mimeType;
    }
    const recordStream = mixedStream || captureStream;
    recorder = new MediaRecorder(recordStream, options);

    recorder.ondataavailable = (ev) => {
        if (!ev.data || ev.data.size === 0) return;
        // seq é atribuído SINCRONAMENTE na ordem dos eventos do MediaRecorder,
        // antes de qualquer await — garante sequência temporal correta.
        seq++;
        chunkQueue.push({ seq, blob: ev.data });
        processChunkQueue();
    };
    recorder.onerror = (e) => console.error('[offscreen] recorder error', e);

    const slice = Math.min(Math.max(cfg.timesliceMs || 500, 100), 4000);
    recorder.start(slice);
}

async function stopCapture() {
    if (stopping) return;
    if (!recorder && !ws && !captureStream) return;
    stopping = true;

    const durationMs = startedAt ? Date.now() - startedAt : 0;
    startedAt = 0;

    // 1. Parar recorder — o stop() garante o último ondataavailable automaticamente.
    //    NÃO chamar requestData() antes: duplicaria blocos e não é necessário.
    if (recorder && recorder.state !== 'inactive') {
        await new Promise((resolve) => {
            const timer = setTimeout(resolve, 3000);
            const onStop = () => {
                clearTimeout(timer);
                recorder?.removeEventListener('stop', onStop);
                resolve();
            };
            recorder.addEventListener('stop', onStop);
            try { recorder.stop(); } catch (_) { /* ignore */ }
        });
    }

    // 2. Drena fila de chunks pendentes (converte + envia tudo que ainda está na queue)
    await drainChunkQueue();
    flushPendingChunks();

    // 3. Parar monitor de nível e AudioContext
    if (levelMonitorTimer) {
        clearInterval(levelMonitorTimer);
        levelMonitorTimer = null;
    }
    if (audioContext) {
        try { await audioContext.close(); } catch (_) { /* ignore */ }
        audioContext = null;
    }
    analyser = null;

    // 4. Parar tracks (tab + mic + mixed)
    for (const track of captureStream?.getTracks?.() || []) track.stop();
    for (const track of micStream?.getTracks?.() || []) track.stop();
    for (const track of mixedStream?.getTracks?.() || []) track.stop();
    captureStream = null;
    micStream = null;
    mixedStream = null;
    recorder = null;

    // 4. Mandar session-stop e aguardar backend gravar recording
    if (ws) {
        try {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'session-stop', durationMs }));
            }
        } catch (_) { /* ignore */ }
        // Aguarda backend processar cleanup + insert no banco
        await new Promise((r) => setTimeout(r, 800));
        try { ws.removeEventListener('message', onServerMessage); } catch (_) {}
        try { ws.close(); } catch (_) {}
        ws = null;
    }

    handshakeDone = false;
    pendingSendQueue = [];
    chunkQueue.length = 0;
    stopping = false;
}
