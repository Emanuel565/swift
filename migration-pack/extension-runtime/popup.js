'use strict';

const DEFAULT_WS = 'ws://127.0.0.1:3000/ws/audio';

// ─── UI helpers ───────────────────────────────────────────────────────────────

function log(line, cls) {
    const el = document.getElementById('log');
    const d = document.createElement('div');
    d.textContent = line;
    if (cls) d.className = cls;
    el.appendChild(d);
    el.scrollTop = el.scrollHeight;
}

function setRecordingUI(active) {
    const bar = document.getElementById('statusBar');
    const text = document.getElementById('statusText');
    const startBtn = document.getElementById('start');
    const stopBtn = document.getElementById('stop');
    const meter = document.getElementById('audioMeter');

    if (active) {
        bar.className = 'recording';
        text.textContent = 'Gravando…';
        startBtn.disabled = true;
        stopBtn.disabled = false;
        if (meter) meter.style.display = '';
    } else {
        bar.className = 'idle';
        text.textContent = 'Aguardando';
        startBtn.disabled = false;
        stopBtn.disabled = true;
        if (meter) meter.style.display = 'none';
        const bar2 = document.getElementById('meterBar');
        if (bar2) bar2.style.width = '0%';
        const hint = document.getElementById('meterHint');
        if (hint) hint.textContent = '';
    }
}

// ─── Token field sync ────────────────────────────────────────────────────────

const devEl = document.getElementById('devMode');
const tokenEl = document.getElementById('token');

function syncTokenField() {
    const dev = devEl.checked;
    tokenEl.disabled = dev;
    tokenEl.placeholder = dev ? 'Desabilitado no modo teste' : 'Token de /auth/login';
}

devEl.addEventListener('change', syncTokenField);

// ─── Load: restaura config, estado de sessão e log persistido ────────────────

async function load() {
    const data = await chrome.storage.local.get([
        'ghostWsUrl',
        'ghostToken',
        'ghostDevMode',
        'ghostRecording',
        'ghostLog',
    ]);

    document.getElementById('wsUrl').value = data.ghostWsUrl || DEFAULT_WS;
    document.getElementById('token').value = data.ghostToken || '';
    if (typeof data.ghostDevMode === 'boolean') devEl.checked = data.ghostDevMode;
    else devEl.checked = true;
    syncTokenField();

    // Restaura estado de gravação ativo/inativo
    setRecordingUI(!!data.ghostRecording);

    // Restaura log do storage (entradas anteriores ao popup estar aberto)
    if (Array.isArray(data.ghostLog) && data.ghostLog.length > 0) {
        log('— histórico —', 'dim');
        for (const entry of data.ghostLog) {
            const cls = entry.kind === 'error' ? 'err'
                : (entry.kind === 'ready' || entry.kind === 'saved') ? 'ok'
                : undefined;
            log(entry.text || '', cls);
        }
        log('— ao vivo —', 'dim');
    }
}

// ─── Iniciar ─────────────────────────────────────────────────────────────────

document.getElementById('start').addEventListener('click', async () => {
    const wsUrl = document.getElementById('wsUrl').value.trim() || DEFAULT_WS;
    const token = document.getElementById('token').value.trim();
    const timesliceMs = parseInt(document.getElementById('timeslice').value, 10) || 500;
    const consent = document.getElementById('consent').checked;
    const devMode = devEl.checked;
    const includeMic = document.getElementById('includeMic').checked;

    if (!consent) {
        log('Marque o consentimento para continuar.', 'err');
        return;
    }
    if (!devMode && !token) {
        log('Informe o JWT ou ative o modo teste.', 'err');
        return;
    }

    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    const host = safeHostname(tab?.url);
    if (host !== 'meet.google.com') {
        log('Abra uma reunião no Google Meet antes de iniciar.', 'err');
        return;
    }

    await chrome.storage.local.set({
        ghostWsUrl: wsUrl,
        ghostToken: token,
        ghostDevMode: devMode,
    });

    log('Conectando…', 'ok');
    setRecordingUI(true);

    const res = await chrome.runtime.sendMessage({
        type: 'POPUP_START',
        wsUrl,
        token: devMode ? '' : token,
        devMode,
        consentVersion: 1,
        timesliceMs,
        includeMic,
    });

    if (res?.ok) {
        log(`Sessão ${res.sessionId} — Meet conectado.`, 'ok');
    } else {
        log(res?.error || 'Falha', 'err');
        setRecordingUI(false);
    }
});

// ─── Parar ───────────────────────────────────────────────────────────────────

document.getElementById('stop').addEventListener('click', async () => {
    log('Parando gravação…');
    setRecordingUI(false);
    const res = await chrome.runtime.sendMessage({ type: 'POPUP_STOP' });
    if (res?.ok) log('Parado. Aguardando processamento…', 'ok');
    else log(res?.error || 'Erro ao parar', 'err');
});

// ─── Eventos do servidor ao vivo (popup aberto) ──────────────────────────────

chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'GHOST_AUDIO_LEVEL') {
        const bar = document.getElementById('meterBar');
        const hint = document.getElementById('meterHint');
        if (bar) bar.style.width = Math.round((msg.level || 0) * 100) + '%';
        if (hint) {
            if ((msg.silenceMs || 0) >= 3000) {
                hint.textContent = 'Silencio detectado ' + Math.floor(msg.silenceMs / 1000) + 's';
                hint.style.color = '#fca5a5';
            } else if ((msg.level || 0) > 0.05) {
                hint.textContent = 'OK';
                hint.style.color = '#6ee7b7';
            } else {
                hint.textContent = '';
            }
        }
        return;
    }
    if (msg.type === 'GHOST_SERVER_EVENT' && msg.payload) {
        const p = msg.payload;
        const trackLabel = p.track ? `[${p.track}] ` : '';
        if (p.type === 'transcript-partial') {
            log(`${trackLabel}… ${p.text}`);
        } else if (p.type === 'transcript-ready') {
            log(`${trackLabel}✓ Transcrição: ${p.text || '(vazia)'}`, 'ok');
            setRecordingUI(false);
        } else if (p.type === 'recording_saved') {
            const sizeKB = typeof p.audioBytes === 'number' ? ` (${(p.audioBytes / 1024).toFixed(1)}KB)` : '';
            log(`${trackLabel}Áudio salvo${sizeKB}: ${p.recordingId}`, 'ok');
            if (p.warning) log(p.warning, 'err');
        } else if (p.type === 'transcript-status') {
            log(`${trackLabel}Status: ${p.status}`);
        } else if (p.type === 'error') {
            log(`${trackLabel}${p.message || JSON.stringify(p)}`, 'err');
        }
    }
});

// ─── Init ─────────────────────────────────────────────────────────────────────

load();

function safeHostname(url) {
    try {
        if (!url) return '';
        return new URL(url).hostname;
    } catch {
        return '';
    }
}
