'use strict';

// ─── Estado global ───────────────────────────────────────────────────────────

let recording = false;
const NOTIFICATIONS_ENABLED = false;
const MAX_LOG_ENTRIES = 30;

// ─── Storage helpers ─────────────────────────────────────────────────────────

async function appendLog(entry) {
    try {
        const { ghostLog = [] } = await chrome.storage.local.get('ghostLog');
        ghostLog.push({ ...entry, ts: Date.now() });
        await chrome.storage.local.set({ ghostLog: ghostLog.slice(-MAX_LOG_ENTRIES) });
    } catch (_) { /* ignore */ }
}

async function setRecordingState(active, sessionId = null) {
    recording = !!active;
    try {
        await chrome.storage.local.set({
            ghostRecording: recording,
            ghostSessionId: sessionId,
        });
    } catch (_) { /* ignore */ }
}

// ─── Offscreen helpers ───────────────────────────────────────────────────────

async function ensureOffscreen() {
    try {
        await chrome.offscreen.createDocument({
            url: 'offscreen.html',
            reasons: ['USER_MEDIA'],
            justification: 'Ghost Engine v3 — captura de aba + WebSocket',
        });
    } catch (e) {
        const m = String(e && e.message ? e.message : e);
        if (!/single|already|exist/i.test(m)) throw e;
    }
}

async function closeOffscreen() {
    try {
        if (chrome.offscreen.closeDocument) await chrome.offscreen.closeDocument();
    } catch (_) { /* ignore */ }
}

// ─── Message listener ────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'POPUP_START') {
        startGhostAudio(msg)
            .then((r) => sendResponse({ ok: true, ...r }))
            .catch((e) => sendResponse({ ok: false, error: String(e.message || e) }));
        return true;
    }
    if (msg.type === 'POPUP_STOP') {
        stopGhostAudio()
            .then(() => sendResponse({ ok: true }))
            .catch((e) => sendResponse({ ok: false, error: String(e.message || e) }));
        return true;
    }
    if (msg.type === 'MEET_CAPTION_PARTIAL') {
        // Content script do Meet → offscreen (via background proxy)
        if (recording && msg.text) {
            chrome.runtime.sendMessage({ type: 'OFFSCREEN_CAPTION', text: msg.text })
                .catch(() => { /* offscreen ainda não ativo */ });
        }
        return false;
    }
    if (msg.type === 'GHOST_SERVER_EVENT' && msg.payload) {
        const p = msg.payload;
        const prefix = p.track ? `[${p.track}] ` : '';
        if (p.type === 'transcript-partial') {
            appendLog({ kind: 'partial', text: `${prefix}${p.text}` });
        } else if (p.type === 'transcript-ready') {
            appendLog({ kind: 'ready', text: `${prefix}${p.text || '(transcrição vazia)'}` });
            setRecordingState(false, null);
        } else if (p.type === 'recording_saved') {
            const sizeKB = typeof p.audioBytes === 'number' ? ` (${(p.audioBytes / 1024).toFixed(1)}KB)` : '';
            appendLog({ kind: 'saved', text: `${prefix}Áudio salvo${sizeKB}: ${p.recordingId}` });
            if (p.warning) appendLog({ kind: 'error', text: p.warning });
        } else if (p.type === 'transcript-status') {
            appendLog({ kind: 'status', text: `${prefix}Status: ${p.status}` });
        } else if (p.type === 'error') {
            appendLog({ kind: 'error', text: `${prefix}${p.message || JSON.stringify(p)}` });
        }
        return false;
    }
    return false;
});

// ─── Start ───────────────────────────────────────────────────────────────────

async function startGhostAudio(cfg) {
    await stopGhostAudio();
    const { wsUrl, token, consentVersion, timesliceMs, devMode, includeMic } = cfg;
    if (consentVersion == null) throw new Error('Consentimento obrigatório');
    if (!devMode && !token) throw new Error('Ative o modo teste ou informe JWT');

    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab?.id) throw new Error('Nenhuma aba ativa encontrada.');
    const host = safeHostname(tab.url);
    if (host !== 'meet.google.com') {
        throw new Error('Esta versão funciona apenas com Google Meet (meet.google.com).');
    }

    const sessionId = crypto.randomUUID();
    const sourceMeta = {
        sourceType: 'meet',
        tabUrl: tab.url || null,
        hostname: host,
        tabTitle: tab.title || null,
        mimeType: 'audio/webm;codecs=opus',
    };

    const streamId = await getTabStreamId(tab.id);

    await ensureOffscreen();

    const startRes = await chrome.runtime.sendMessage({
        type: 'OFFSCREEN_START',
        sessionId,
        streamId,
        wsUrl,
        token: devMode ? '' : token,
        devMode: !!devMode,
        consentVersion,
        sourceMeta,
        mimeType: 'audio/webm;codecs=opus',
        timesliceMs: timesliceMs || 500,
        includeMic: includeMic !== false,
    });
    if (!startRes?.ok) {
        await closeOffscreen();
        throw new Error(startRes?.error || 'Offscreen não iniciou');
    }

    await setRecordingState(true, sessionId);
    await appendLog({ kind: 'status', text: `Sessão iniciada: ${sessionId}` });

    if (NOTIFICATIONS_ENABLED && chrome.notifications?.create) {
        try {
            await chrome.notifications.create({
                type: 'basic',
                iconUrl: 'icon-128.png',
                title: 'Ghost Audio',
                message: 'Google Meet: captura ativa + transcrição ao vivo.',
                priority: 2,
            });
        } catch (_) { /* ignore */ }
    }

    return { sessionId };
}

// ─── Stop ────────────────────────────────────────────────────────────────────

async function stopGhostAudio() {
    const wasRecording = recording;

    try {
        await chrome.runtime.sendMessage({ type: 'OFFSCREEN_STOP' });
    } catch (_) { /* offscreen pode já ter sido fechado */ }

    await closeOffscreen();
    await setRecordingState(false, null);

    if (wasRecording) {
        await appendLog({ kind: 'status', text: 'Gravação encerrada.' });

        if (NOTIFICATIONS_ENABLED && chrome.notifications?.create) {
            try {
                await chrome.notifications.create({
                    type: 'basic',
                    iconUrl: 'icon-128.png',
                    title: 'Ghost Audio',
                    message: 'Gravação encerrada.',
                    priority: 1,
                });
            } catch (_) { /* ignore */ }
        }
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function safeHostname(url) {
    try {
        if (!url) return null;
        return new URL(url).hostname;
    } catch (_) {
        return null;
    }
}

function getTabStreamId(tabId) {
    if (!tabId) {
        return Promise.reject(new Error('Aba alvo ausente para tabCapture.'));
    }
    return new Promise((resolve, reject) => {
        chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, (id) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            resolve(id);
        });
    });
}

// ─── Restaurar estado após reinício do service worker ────────────────────────

(async () => {
    try {
        const { ghostRecording } = await chrome.storage.local.get('ghostRecording');
        recording = !!ghostRecording;
    } catch (_) { /* ignore */ }
})();
