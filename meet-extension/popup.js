const sessionStateEl = document.getElementById("sessionState");
const sessionNoticeEl = document.getElementById("sessionNotice");
const meetingTitleEl = document.getElementById("meetingTitle");
const ccStatusEl = document.getElementById("ccStatus");
const ccReminderEl = document.getElementById("ccReminder");
const autoSaveCheckboxEl = document.getElementById("autoSaveCheckbox");
const autoSaveFeedbackEl = document.getElementById("autoSaveFeedback");
const authStatusEl = document.getElementById("authStatus");
const authFeedbackEl = document.getElementById("authFeedback");
const syncSessionBtn = document.getElementById("syncSessionBtn");
const openWebPanelBtn = document.getElementById("openWebPanelBtn");
const openWebPanelSecondaryBtn = document.getElementById("openWebPanelSecondaryBtn");
const consentCheckboxEl = document.getElementById("consentCheckbox");
const consentAcceptedAtEl = document.getElementById("consentAcceptedAt");
const consentFeedbackEl = document.getElementById("consentFeedback");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const optionsToggleBtn = document.getElementById("optionsToggleBtn");
const themeToggleBtn = document.getElementById("themeToggleBtn");
const optionsMenuEl = document.getElementById("optionsMenu");

let currentTheme = "dark";

function resolveWebAppBase(authBase) {
    const raw = String(authBase || "").trim();

    if (!raw) {
        return "https://enterprise.swiftsoft.com.br";
    }

    try {
        const parsed = new URL(raw);
        const host = parsed.host.toLowerCase();

        if (host.includes("localhost") || host.startsWith("127.0.0.1")) {
            // Dev: try common Vite dev ports (5173 default, 5174 fallback)
            return "http://localhost:5173";
        }

        if (host === "api.enterprise.swiftsoft.com.br") {
            return "https://enterprise.swiftsoft.com.br";
        }

        return parsed.origin;
    } catch {
        return "https://enterprise.swiftsoft.com.br";
    }
}

function setStatus(label, stateClass) {
    sessionStateEl.textContent = label;
    sessionStateEl.classList.remove("idle", "active", "error");
    sessionStateEl.classList.add(stateClass);
}

function setAuthStatus(label, stateClass) {
    authStatusEl.textContent = label;
    authStatusEl.classList.remove("idle", "active", "error");
    authStatusEl.classList.add(stateClass);
}

function formatPending(value) {
    const n = Number(value || 0);
    return Number.isFinite(n) ? String(n) : "0";
}

function formatConsentDate(ts) {
    if (!ts) {
        return "Não aprovado";
    }

    try {
        return new Intl.DateTimeFormat("pt-BR", {
            dateStyle: "short",
            timeStyle: "short",
        }).format(new Date(ts));
    } catch {
        return "Não aprovado";
    }
}

function formatCaptureHealth(state) {
    const raw = String(state || "").trim();
    if (!raw) {
        return "Captura: -";
    }

    const labels = {
        stopped: "Captura: parada",
        captions_detected: "Captura: detectada",
        searching_caption_container: "Captura: procurando",
        captions_enabled_waiting_text: "Captura: aguardando texto",
        captions_enabled_no_recent_lines: "Captura: sem falas recentes",
    };

    return labels[raw] || `Captura: ${raw}`;
}

function setCcStatus(captionsEnabledLikely) {
    const isOn = Boolean(captionsEnabledLikely);
    ccStatusEl.classList.remove("cc-on", "cc-off");
    ccStatusEl.classList.add(isOn ? "cc-on" : "cc-off");
    ccStatusEl.textContent = isOn
        ? "CC do Meet: ligado"
        : "CC do Meet: desligado";

    ccReminderEl.hidden = isOn;
}

async function updateAutoSavePreference() {
    const enabled = Boolean(autoSaveCheckboxEl.checked);

    const result = await chrome.runtime.sendMessage({
        type: "POPUP_SET_AUTOSAVE",
        payload: { enabled },
    });

    autoSaveFeedbackEl.textContent = result?.ok
        ? enabled
            ? "Auto-save ativado"
            : "Auto-save desativado"
        : "Falha ao atualizar preferência";

    setTimeout(() => {
        autoSaveFeedbackEl.textContent = "";
    }, 2200);

    await refreshUi();
}

async function updateConsentPreference() {
    const accepted = Boolean(consentCheckboxEl.checked);
    const result = await chrome.runtime.sendMessage({
        type: "POPUP_SET_CONSENT",
        payload: { accepted },
    });

    consentFeedbackEl.textContent = result?.ok
        ? accepted
            ? "Consentimento aprovado"
            : "Consentimento revogado"
        : "Falha ao atualizar consentimento";

    setTimeout(() => {
        consentFeedbackEl.textContent = "";
    }, 2200);

    await refreshUi();
}

function setContext(state) {
    const context = state?.meetContext || null;
    const captureHealth = context?.captureHealth || null;
    const title = String(context?.meetingTitle || "").trim();

    const ccIsOn =
        typeof context?.captionsEnabledLikely === "boolean"
            ? context.captionsEnabledLikely
            : captureHealth?.status === "captions_detected";

    setCcStatus(ccIsOn);
    meetingTitleEl.textContent = title || "Reunião sem título";
}

async function getPopupState() {
    return chrome.runtime.sendMessage({ type: "POPUP_GET_STATE" });
}

async function syncWebSession() {
    return chrome.runtime.sendMessage({ type: "POPUP_SYNC_SESSION" });
}

function setOptionsMenuVisible(visible) {
    if (visible) {
        optionsMenuEl.hidden = false;
        requestAnimationFrame(() => {
            optionsMenuEl.classList.add("is-open");
        });
        return;
    }

    optionsMenuEl.classList.remove("is-open");
    window.setTimeout(() => {
        if (!optionsMenuEl.classList.contains("is-open")) {
            optionsMenuEl.hidden = true;
        }
    }, 170);
}

function setTheme(theme) {
    const resolvedTheme = theme === "light" ? "light" : "dark";
    currentTheme = resolvedTheme;

    document.body.classList.remove("theme-light", "theme-dark");
    document.body.classList.add(`theme-${resolvedTheme}`);

    themeToggleBtn.textContent = resolvedTheme === "dark" ? "Escuro" : "Claro";
}

async function toggleTheme() {
    const nextTheme = currentTheme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    await chrome.storage.local.set({ meetUiTheme: nextTheme });
}

async function refreshUi() {
    const state = await getPopupState();

    if (!state?.ok) {
        setStatus("Sem sessão", "idle");
        setAuthStatus("Não logado", "error");
        sessionNoticeEl.hidden = true;
        setContext(null);
        setCcStatus(false);
        consentCheckboxEl.checked = false;
        autoSaveCheckboxEl.checked = true;
        openWebPanelBtn.disabled = true;
        startBtn.disabled = true;
        stopBtn.disabled = true;
        return;
    }

    setAuthStatus(state.isAuthenticated ? "Logado" : "Não autenticado", state.isAuthenticated ? "active" : "error");
    consentCheckboxEl.checked = Boolean(state.consentAccepted);
    autoSaveCheckboxEl.checked = state.autoSaveEnabled !== false;
    consentAcceptedAtEl.textContent = formatConsentDate(state.consentAcceptedAt);
    openWebPanelBtn.disabled = false;
    if (openWebPanelSecondaryBtn) {
        openWebPanelSecondaryBtn.disabled = false;
    }

    setContext(state);

    if (!state.isMeetTab) {
        setStatus("Abra o Meet", "idle");
        sessionNoticeEl.hidden = true;
        startBtn.disabled = true;
        stopBtn.disabled = true;
        return;
    }

    if (state.sessionActive) {
        setStatus("Transcrevendo", "active");
        sessionNoticeEl.hidden = false;
        startBtn.disabled = true;
        stopBtn.disabled = false;
        return;
    }

    setStatus(state.hasError ? "Erro de conexão" : "Pronto", state.hasError ? "error" : "idle");
    sessionNoticeEl.hidden = true;
    startBtn.disabled = !state.consentAccepted || !state.isAuthenticated;
    stopBtn.disabled = true;
}

async function openWebPanel() {
    const state = await getPopupState();
    const base = resolveWebAppBase(state?.authBase);
    const path = "/transcriptions?tab=meet-captions";

    // In dev, try multiple ports since Vite might use next available
    if (base.includes("localhost")) {
        const ports = [5173, 5174, 3000];
        for (const port of ports) {
            try {
                const testUrl = `http://localhost:${port}`;
                const resp = await fetch(testUrl, { method: "HEAD", mode: "no-cors" });
                // no-cors won't throw on connection — but if the server is down, it will
                window.open(`${testUrl}${path}`, "_blank", "noopener,noreferrer");
                return;
            } catch {
                // port not available, try next
            }
        }
    }

    window.open(`${base}${path}`, "_blank", "noopener,noreferrer");
}

async function syncAuth() {
    const result = await syncWebSession();

    authFeedbackEl.textContent = result?.ok
        ? "Sessão web sincronizada"
        : "Não foi possível validar login web";

    setTimeout(() => {
        authFeedbackEl.textContent = "";
    }, 2200);

    await refreshUi();
}

async function startCapture() {
    const state = await getPopupState();
    const ccIsOn = Boolean(state?.meetContext?.captionsEnabledLikely);

    if (!ccIsOn) {
        setStatus("CC desligado (aviso)", "error");
        ccReminderEl.hidden = false;
        window.alert("O CC do Meet está desligado. Você pode iniciar, mas a transcrição só terá conteúdo com CC ligado.");
    }

    const result = await chrome.runtime.sendMessage({ type: "POPUP_START_CAPTURE" });
    if (!result?.ok) {
        if (result?.reason === "consent_required") {
            setStatus("Consentimento obrigatório", "error");
        } else if (result?.reason === "auth_required") {
            setAuthStatus("Login web necessário", "error");
            setStatus("Autenticação necessária", "error");
        } else {
            setStatus("Não foi possível iniciar", "error");
        }
    }
    await refreshUi();
}

async function stopCapture() {
    const result = await chrome.runtime.sendMessage({ type: "POPUP_STOP_CAPTURE" });
    if (!result?.ok) {
        setStatus("Não foi possível encerrar", "error");
    }
    await refreshUi();
}

async function loadLocalUiPrefs() {
    const data = await chrome.storage.local.get([
        "meetUiTheme",
    ]);

    if (typeof data.meetUiTheme === "string") {
        setTheme(data.meetUiTheme);
    } else {
        setTheme("dark");
    }
}

syncSessionBtn.addEventListener("click", () => {
    syncAuth().catch(() => {
        authFeedbackEl.textContent = "Falha ao sincronizar sessão";
    });
});

openWebPanelBtn.addEventListener("click", () => {
    openWebPanel().catch(() => {
        authFeedbackEl.textContent = "Falha ao abrir painel web";
    });
});

if (openWebPanelSecondaryBtn) {
    openWebPanelSecondaryBtn.addEventListener("click", () => {
        openWebPanel().catch(() => {
            authFeedbackEl.textContent = "Falha ao abrir painel web";
        });
    });
}

startBtn.addEventListener("click", () => {
    startCapture().catch(() => {
        setStatus("Falha ao iniciar", "error");
    });
});

stopBtn.addEventListener("click", () => {
    stopCapture().catch(() => {
        setStatus("Falha ao encerrar", "error");
    });
});

consentCheckboxEl.addEventListener("change", () => {
    updateConsentPreference().catch(() => {
        consentFeedbackEl.textContent = "Falha ao atualizar consentimento";
    });
});

autoSaveCheckboxEl.addEventListener("change", () => {
    updateAutoSavePreference().catch(() => {
        autoSaveFeedbackEl.textContent = "Falha ao atualizar preferência";
    });
});

optionsToggleBtn.addEventListener("click", () => {
    setOptionsMenuVisible(optionsMenuEl.hidden);
});

themeToggleBtn.addEventListener("click", () => {
    toggleTheme().catch(() => {
        // noop
    });
});

document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
        return;
    }

    if (!optionsMenuEl.hidden && !optionsMenuEl.contains(target) && !optionsToggleBtn.contains(target)) {
        setOptionsMenuVisible(false);
    }
});

document.addEventListener("DOMContentLoaded", () => {
    requestAnimationFrame(() => {
        document.body.classList.add("app-ready");
    });

    loadLocalUiPrefs()
        .catch(() => {
            // noop
        })
        .finally(() => {
            refreshUi().catch(() => {
                setStatus("Falha ao carregar", "error");
            });
        });
});
