const AUTH_HTTP_BASES = [
    "http://localhost:22211",
    "http://localhost:3000",
    "https://enterprise.swiftsoft.com.br",
    "https://api.enterprise.swiftsoft.com.br",
    "http://localhost:5173",
    "http://localhost:5174"
];
const SESSION_TTL_MS = 10 * 60 * 1000;
const CONSENT_VERSION = "meet-caption-consent-v1";
const AUTH_ME_PATHS = ["/auth/me", "/api/auth/me"];
const MAX_PENDING_EVENTS = 2000;
const MAX_INFLIGHT_EVENTS = 1000;
const DEFAULT_AUTO_SAVE = true;

const sessionsByTabId = new Map();
const pageContextByTabId = new Map();
const ccReminderAtByTabId = new Map();

// Auth cache: avoid re-verifying on every popup open / reconnect
let cachedAuth = null;
let cachedAuthAt = 0;
const AUTH_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// User profile cache: avoid re-fetching on every session
let cachedUserProfile = null;
let cachedUserProfileAt = 0;
const PROFILE_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const AUTO_START_ENABLED = false;

function normalizeHttpBaseForStorage(httpBase) {
    const normalized = String(httpBase || "").trim();
    if (!normalized) {
        return AUTH_HTTP_BASES[0];
    }

    try {
        const parsed = new URL(normalized);
        const host = parsed.host.toLowerCase();

        if (host.includes("localhost")) {
            return "http://localhost:22211";
        }

        if (host === "enterprise.swiftsoft.com.br") {
            return "https://api.enterprise.swiftsoft.com.br";
        }

        return parsed.origin;
    } catch {
        return AUTH_HTTP_BASES[0];
    }
}

async function migrateLegacyAuthBaseStorage() {
    try {
        const current = await getStoredAuthHttpBase();
        if (!current) {
            return;
        }
        const normalized = normalizeHttpBaseForStorage(current);
        if (normalized !== current) {
            await saveStoredAuthHttpBase(normalized);
            console.info("[meet-extension] migrated meetAuthHttpBase", {
                from: current,
                to: normalized
            });
        }
    } catch {
        // noop
    }
}

function makeSessionId() {
    if (crypto?.randomUUID) {
        return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeTokenCandidate(value) {
    const raw = String(value || "").trim();
    if (!raw || raw === "undefined" || raw === "null") {
        return null;
    }

    const stripQuotes = (input) => {
        const text = String(input || "").trim();
        if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
            return text.slice(1, -1).trim();
        }
        return text;
    };

    let token = stripQuotes(raw);
    token = token.replace(/^bearer\s+/i, "").trim();

    if (token.startsWith("{") && token.endsWith("}")) {
        try {
            const parsed = JSON.parse(token);
            const nested =
                parsed?.access_token ||
                parsed?.accessToken ||
                parsed?.token ||
                parsed?.jwt ||
                null;
            if (nested) {
                return normalizeTokenCandidate(nested);
            }
        } catch {
            // noop
        }
    }

    return token || null;
}

function parseMeetingId(url) {
    try {
        const parsed = new URL(url);
        const [meetingId] = parsed.pathname.replace(/^\//, "").split("/");
        return meetingId || "unknown-meeting";
    } catch {
        return "unknown-meeting";
    }
}

function makeSocketUrl(wsBase, token) {
    const raw = `${wsBase}/ws/meet-captions`;
    if (!token) {
        return raw;
    }

    const url = new URL(raw);
    url.searchParams.set("token", token);
    return url.toString();
}

function nextBackoffMs(attempt) {
    const cappedAttempt = Math.min(attempt, 6);
    return 300 * Math.pow(2, cappedAttempt);
}

function toWsBase(httpBase) {
    try {
        const u = new URL(httpBase);
        u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
        return u.origin;
    } catch {
        return "ws://localhost:3000";
    }
}

function resolveWsBaseForIngestion(httpBase) {
    const normalized = String(httpBase || "").trim();

    if (!normalized) {
        return "ws://localhost:22211";
    }

    try {
        const parsed = new URL(normalized);
        const host = parsed.host.toLowerCase();

        // Local dev: always ingest through local API.
        if (host.includes("localhost")) {
            return "ws://localhost:22211";
        }

        // Production web app host is not the WS ingress host.
        if (host === "enterprise.swiftsoft.com.br") {
            return "wss://api.enterprise.swiftsoft.com.br";
        }

        if (host === "api.enterprise.swiftsoft.com.br") {
            return "wss://api.enterprise.swiftsoft.com.br";
        }

        return toWsBase(normalized);
    } catch {
        return "ws://localhost:22211";
    }
}

function resolveApiBaseForIngestion(httpBase) {
    const wsBase = resolveWsBaseForIngestion(httpBase);
    if (wsBase.startsWith("wss://")) {
        return wsBase.replace("wss://", "https://");
    }
    if (wsBase.startsWith("ws://")) {
        return wsBase.replace("ws://", "http://");
    }
    return httpBase || "http://localhost:22211";
}

function sanitizeWsBase(wsBase) {
    const normalized = String(wsBase || "").trim();
    if (!normalized) {
        return "ws://localhost:22211";
    }

    try {
        const parsed = new URL(normalized);
        const host = parsed.host.toLowerCase();

        if (host.includes("localhost")) {
            return "ws://localhost:22211";
        }

        if (host === "enterprise.swiftsoft.com.br") {
            return "wss://api.enterprise.swiftsoft.com.br";
        }

        return parsed.origin;
    } catch {
        return "ws://localhost:22211";
    }
}

async function getCandidateHttpBases() {
    const ordered = [...AUTH_HTTP_BASES];
    try {
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
            if (!tab?.url) {
                continue;
            }
            if (tab.url.startsWith("https://enterprise.swiftsoft.com.br/")) {
                ordered.unshift("https://enterprise.swiftsoft.com.br");
            }
            if (tab.url.startsWith("https://api.enterprise.swiftsoft.com.br/")) {
                ordered.unshift("https://api.enterprise.swiftsoft.com.br");
            }
            if (tab.url.startsWith("http://localhost:22211/")) {
                ordered.unshift("http://localhost:22211");
            }
            if (tab.url.startsWith("http://localhost:3000/")) {
                ordered.unshift("http://localhost:3000");
            }
            if (tab.url.startsWith("http://localhost:5173/")) {
                ordered.unshift("http://localhost:22211");
                ordered.unshift("http://localhost:3000");
            }

            if (tab.url.startsWith("http://localhost/")) {
                ordered.unshift("http://localhost");
                ordered.unshift("http://localhost:22211");
            }

            if (tab.url.startsWith("http://127.0.0.1/")) {
                ordered.unshift("http://127.0.0.1");
                ordered.unshift("http://localhost:22211");
            }

            if (tab.url.startsWith("http://localhost:") || tab.url.startsWith("http://127.0.0.1:")) {
                try {
                    const origin = new URL(tab.url).origin;
                    ordered.unshift(origin);
                    ordered.unshift("http://localhost:22211");
                } catch {
                    // noop
                }
            }
        }
    } catch {
        // fallback na lista padrão
    }

    return [...new Set(ordered)];
}

async function getWebSessionFromOpenTabs() {
    const urlPatterns = [
        "https://enterprise.swiftsoft.com.br/*",
        "https://api.enterprise.swiftsoft.com.br/*",
        "http://localhost/*",
        "http://127.0.0.1/*",
        "http://localhost:5173/*",
        "http://localhost:5174/*",
        "http://localhost:3000/*"
    ];

    for (const pattern of urlPatterns) {
        let tabs = [];
        try {
            tabs = await chrome.tabs.query({ url: pattern });
        } catch {
            tabs = [];
        }

        for (const tab of tabs) {
            if (!tab?.id) {
                continue;
            }

            try {
                const response = await chrome.tabs.sendMessage(tab.id, {
                    type: "EXTENSION_GET_WEB_SESSION"
                });

                const token = String(response?.token || "").trim();
                const pageOrigin = String(response?.pageOrigin || "").trim();
                if (!token) {
                    continue;
                }

                return {
                    token,
                    pageOrigin: pageOrigin || (tab.url ? new URL(tab.url).origin : null)
                };
            } catch {
                // Content script pode não estar pronto nesta aba.
            }
        }
    }

    return null;
}

function isMeetUrl(url) {
    return typeof url === "string" && url.startsWith("https://meet.google.com/");
}

function isActiveMeetCallUrl(url) {
    if (!isMeetUrl(url)) {
        return false;
    }

    try {
        const parsed = new URL(url);
        const [meetingId] = parsed.pathname.replace(/^\//, "").split("/");
        return /^[a-z0-9]{3}-[a-z0-9]{4}-[a-z0-9]{3}$/i.test(meetingId || "");
    } catch {
        return false;
    }
}

async function getActiveTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0] || null;
}

async function getSessionToken() {
    const { meetSessionToken } = await chrome.storage.session.get("meetSessionToken");
    if (meetSessionToken) {
        return meetSessionToken;
    }

    const { meetSessionTokenLocal } = await chrome.storage.local.get("meetSessionTokenLocal");
    return meetSessionTokenLocal || null;
}

async function clearSessionToken() {
    await chrome.storage.session.remove("meetSessionToken");
    await chrome.storage.local.remove("meetSessionTokenLocal");
    await chrome.storage.local.remove("meetAuthHttpBase");
    cachedAuth = null;
    cachedAuthAt = 0;
    cachedUserProfile = null;
    cachedUserProfileAt = 0;
}

async function saveSessionToken(token) {
    const normalized = normalizeTokenCandidate(token) || "";
    await chrome.storage.session.set({ meetSessionToken: normalized });
    await chrome.storage.local.set({ meetSessionTokenLocal: normalized });
}

async function getStoredAuthHttpBase() {
    const { meetAuthHttpBase } = await chrome.storage.local.get("meetAuthHttpBase");
    return typeof meetAuthHttpBase === "string" && meetAuthHttpBase.trim()
        ? meetAuthHttpBase.trim()
        : null;
}

async function getAutoSavePreference() {
    const { meetAutoSaveEnabled } = await chrome.storage.local.get("meetAutoSaveEnabled");
    if (typeof meetAutoSaveEnabled === "boolean") {
        return meetAutoSaveEnabled;
    }
    return DEFAULT_AUTO_SAVE;
}

async function setAutoSavePreference(enabled) {
    const normalized = Boolean(enabled);
    await chrome.storage.local.set({ meetAutoSaveEnabled: normalized });
    return normalized;
}

async function saveStoredAuthHttpBase(httpBase) {
    const normalized = normalizeHttpBaseForStorage(httpBase);
    await chrome.storage.local.set({ meetAuthHttpBase: normalized });
}

function decodeJwtPayload(token) {
    try {
        const normalized = normalizeTokenCandidate(token);
        if (!normalized) {
            return null;
        }
        const parts = normalized.split(".");
        if (parts.length < 2) {
            return null;
        }
        const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
        const json = atob(padded);
        return JSON.parse(json);
    } catch {
        return null;
    }
}

function isJwtExpired(payload) {
    if (!payload?.exp) {
        return false;
    }
    const nowSec = Math.floor(Date.now() / 1000);
    return Number(payload.exp) <= nowSec;
}

function tokenSessionKey(token) {
    const payload = decodeJwtPayload(token);
    const sub = String(payload?.sub || payload?.userId || "").trim();
    if (!sub) {
        return "sessao-desconhecida";
    }
    return `user-${sub.slice(0, 8)}`;
}

async function readTokenFromWebCookie(httpBase) {
    if (!chrome.cookies?.get) {
        return null;
    }

    try {
        const cookie = await chrome.cookies.get({
            url: httpBase,
            name: "access_token"
        });
        return cookie?.value ? normalizeTokenCandidate(decodeURIComponent(cookie.value)) : null;
    } catch {
        return null;
    }
}

async function verifySessionOnBackend(httpBase, token) {
    const normalizedToken = normalizeTokenCandidate(token);
    if (!normalizedToken) {
        return false;
    }

    for (const path of AUTH_ME_PATHS) {
        try {
            const response = await fetch(`${httpBase}${path}`, {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${normalizedToken}`
                },
                credentials: "include"
            });

            if (response.ok) {
                return true;
            }

            if (response.status === 401 || response.status === 403) {
                return false;
            }
        } catch {
            // tenta o próximo path/base
        }
    }

    return null;
}

function unwrapEnvelopeData(payload) {
    if (payload && typeof payload === "object" && payload.data && typeof payload.data === "object") {
        return payload.data;
    }
    return payload;
}

async function fetchCurrentUserProfile(httpBase, token) {
    // Return cached profile if still valid
    if (cachedUserProfile && (Date.now() - cachedUserProfileAt) < PROFILE_CACHE_TTL_MS) {
        return cachedUserProfile;
    }

    const profile = await _fetchCurrentUserProfileInner(httpBase, token);
    if (profile && (profile.userId || profile.name || profile.email)) {
        cachedUserProfile = profile;
        cachedUserProfileAt = Date.now();
    }
    return profile;
}

async function _fetchCurrentUserProfileInner(httpBase, token) {
    const targetBase = resolveApiBaseForIngestion(httpBase);
    const paths = ["/auth/me", "/api/auth/me"];
    for (const path of paths) {
        try {
            const response = await fetch(`${targetBase}${path}`, {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${token}`
                },
                credentials: "include"
            });
            if (!response.ok) {
                continue;
            }

            const raw = await response.json();
            const data = unwrapEnvelopeData(raw);
            const name = String(data?.name || "").trim();
            const email = String(data?.email || "").trim();
            const userId = String(data?.id || "").trim();
            return {
                userId: userId || null,
                name: name || null,
                email: email || null
            };
        } catch {
            // tenta próximo path
        }
    }

    const jwtPayload = decodeJwtPayload(token);
    return {
        userId: String(jwtPayload?.sub || jwtPayload?.userId || "").trim() || null,
        name: null,
        email: String(jwtPayload?.email || "").trim() || null
    };
}

async function verifyTokenAcrossBases(token, preferredBase) {
    const baseCandidates = [preferredBase, ...(await getCandidateHttpBases())].filter(Boolean);
    const uniqueBases = [...new Set(baseCandidates)];

    let firstReachableBase = null;
    for (const base of uniqueBases) {
        const result = await verifySessionOnBackend(base, token);
        if (result === true) {
            return {
                verified: true,
                base,
                reachableBase: base
            };
        }

        if (result === null && !firstReachableBase) {
            firstReachableBase = base;
        }
    }

    return {
        verified: false,
        base: firstReachableBase,
        reachableBase: firstReachableBase
    };
}

async function ensureAuthenticatedToken(forceRefresh = false) {
    // Return cached auth if still valid and not forced
    if (!forceRefresh && cachedAuth && cachedAuth.authenticated && cachedAuth.token) {
        const age = Date.now() - cachedAuthAt;
        if (age < AUTH_CACHE_TTL_MS) {
            // Quick check: is the token still not expired?
            const payload = decodeJwtPayload(cachedAuth.token);
            if (payload && !isJwtExpired(payload)) {
                return cachedAuth;
            }
        }
    }

    const result = await _ensureAuthenticatedTokenInner();
    if (result.authenticated && result.token) {
        cachedAuth = result;
        cachedAuthAt = Date.now();
    } else {
        cachedAuth = null;
        cachedAuthAt = 0;
    }
    return result;
}

async function _ensureAuthenticatedTokenInner() {
    const tabSession = await getWebSessionFromOpenTabs();
    const tabToken = normalizeTokenCandidate(tabSession?.token);
    if (tabToken) {
        const payload = decodeJwtPayload(tabToken);
        if (payload && !isJwtExpired(payload)) {
            const verification = await verifyTokenAcrossBases(tabToken, tabSession.pageOrigin);
            const chosenBase =
                verification.base ||
                (await getStoredAuthHttpBase()) ||
                AUTH_HTTP_BASES[0];

            await saveSessionToken(tabToken);
            await saveStoredAuthHttpBase(chosenBase);

            return {
                token: tabToken,
                source: verification.verified ? "web_tab_verified" : "web_tab_detected",
                authenticated: true,
                verified: verification.verified,
                key: tokenSessionKey(tabToken),
                httpBase: chosenBase,
                wsBase: resolveWsBaseForIngestion(chosenBase)
            };
        }
    }

    const bases = await getCandidateHttpBases();
    let firstDetectable = null;

    for (const httpBase of bases) {
        const cookieToken = normalizeTokenCandidate(await readTokenFromWebCookie(httpBase));
        if (!cookieToken) {
            continue;
        }

        const payload = decodeJwtPayload(cookieToken);
        if (!payload || isJwtExpired(payload)) {
            continue;
        }

        const verification = await verifySessionOnBackend(httpBase, cookieToken);
        if (verification === true) {
            await saveSessionToken(cookieToken);
            await saveStoredAuthHttpBase(httpBase);
            return {
                token: cookieToken,
                source: "web_session_verified",
                authenticated: true,
                verified: true,
                key: tokenSessionKey(cookieToken),
                httpBase,
                wsBase: resolveWsBaseForIngestion(httpBase)
            };
        }

        if (verification === null && !firstDetectable) {
            firstDetectable = { token: cookieToken, httpBase };
        }
    }

    if (firstDetectable) {
        await saveSessionToken(firstDetectable.token);
        await saveStoredAuthHttpBase(firstDetectable.httpBase);
        return {
            token: firstDetectable.token,
            source: "web_session_detected",
            authenticated: true,
            verified: false,
            key: tokenSessionKey(firstDetectable.token),
            httpBase: firstDetectable.httpBase,
            wsBase: resolveWsBaseForIngestion(firstDetectable.httpBase)
        };
    }

    const storedToken = normalizeTokenCandidate(await getSessionToken());
    if (storedToken) {
        const payload = decodeJwtPayload(storedToken);
        if (payload && !isJwtExpired(payload)) {
            const storedBase = (await getStoredAuthHttpBase()) || AUTH_HTTP_BASES[0];
            const verification = await verifyTokenAcrossBases(storedToken, storedBase);
            if (!verification.verified && !verification.base) {
                await clearSessionToken();
            } else {
                const chosenBase = verification.base || storedBase;
                return {
                    token: storedToken,
                    source: verification.verified ? "extension_storage_verified" : "extension_storage",
                    authenticated: true,
                    verified: Boolean(verification.verified),
                    key: tokenSessionKey(storedToken),
                    httpBase: chosenBase,
                    wsBase: resolveWsBaseForIngestion(chosenBase)
                };
            }
        }
        if (!payload || isJwtExpired(payload)) {
            await clearSessionToken();
        }
    }

    return {
        token: null,
        source: "none",
        authenticated: false,
        verified: false,
        key: null,
        httpBase: null,
        wsBase: null
    };
}

async function getConsentState() {
    const { meetConsentAccepted, meetConsentVersion, meetConsentAcceptedAt } = await chrome.storage.local.get([
        "meetConsentAccepted",
        "meetConsentVersion",
        "meetConsentAcceptedAt"
    ]);

    const accepted =
        Boolean(meetConsentAccepted) &&
        meetConsentVersion === CONSENT_VERSION &&
        typeof meetConsentAcceptedAt === "number";

    return {
        accepted,
        acceptedAt: accepted ? meetConsentAcceptedAt : null,
        version: meetConsentVersion || null
    };
}

async function setConsentState(accepted) {
    if (!accepted) {
        await chrome.storage.local.remove([
            "meetConsentAccepted",
            "meetConsentVersion",
            "meetConsentAcceptedAt"
        ]);
        return;
    }

    await chrome.storage.local.set({
        meetConsentAccepted: true,
        meetConsentVersion: CONSENT_VERSION,
        meetConsentAcceptedAt: Date.now()
    });
}

async function queueAndSend(session, message) {
    const putInFront = Boolean(message?.__front);
    if (putInFront) {
        delete message.__front;
        session.pending.unshift(message);
    } else {
        session.pending.push(message);
    }

    if (session.pending.length > MAX_PENDING_EVENTS) {
        const overflow = session.pending.length - MAX_PENDING_EVENTS;
        session.pending.splice(0, overflow);
        session.metrics.dropped += overflow;
    }

    flushQueue(session);
}

function flushQueue(session) {
    if (!session.socket || session.socket.readyState !== WebSocket.OPEN) {
        return;
    }

    while (session.pending.length) {
        const next = session.pending[0];
        try {
            session.socket.send(JSON.stringify(next));
            session.sentAtByEventId.set(next.eventId, Date.now());
            session.inflightByEventId.set(next.eventId, next);
            if (session.inflightByEventId.size > MAX_INFLIGHT_EVENTS) {
                const first = session.inflightByEventId.keys().next().value;
                if (first) {
                    session.inflightByEventId.delete(first);
                    session.sentAtByEventId.delete(first);
                    session.metrics.dropped += 1;
                }
            }
            session.metrics.sent += 1;
            session.pending.shift();
        } catch {
            return;
        }
    }
}

function replayInflightMessages(session) {
    if (!session.inflightByEventId.size) {
        return;
    }

    const replay = Array.from(session.inflightByEventId.values());
    session.inflightByEventId.clear();
    session.sentAtByEventId.clear();

    for (let i = replay.length - 1; i >= 0; i -= 1) {
        const message = replay[i];
        if (!message) {
            continue;
        }
        session.pending.unshift(message);
        session.metrics.retried += 1;
    }

    if (session.pending.length > MAX_PENDING_EVENTS) {
        const overflow = session.pending.length - MAX_PENDING_EVENTS;
        session.pending.splice(MAX_PENDING_EVENTS, overflow);
        session.metrics.dropped += overflow;
    }
}

function markSessionAlive(session) {
    session.lastSeenAt = Date.now();
}

function waitForAck(session, eventId, timeoutMs = 1200) {
    if (!eventId) {
        return Promise.resolve(false);
    }

    const startedAt = Date.now();
    return new Promise((resolve) => {
        const timer = setInterval(() => {
            const acked = !session.inflightByEventId.has(eventId);
            if (acked) {
                clearInterval(timer);
                resolve(true);
                return;
            }

            if (Date.now() - startedAt >= timeoutMs) {
                clearInterval(timer);
                resolve(false);
            }
        }, 40);
    });
}

async function sendToContentScript(tabId, type) {
    try {
        await chrome.tabs.sendMessage(tabId, { type });
    } catch {
        // Se o content script ainda não estiver pronto, o próximo evento do usuário reativa o fluxo.
    }
}

async function requestCcStatusFromContentScript(tabId) {
    try {
        const response = await chrome.tabs.sendMessage(tabId, {
            type: "MEET_GET_CC_STATUS"
        });

        if (typeof response?.captionsEnabledLikely === "boolean") {
            return response.captionsEnabledLikely;
        }
    } catch {
        // Content script may not be ready yet.
    }

    return null;
}

async function remindCcRequired(tabId, force = false) {
    const now = Date.now();
    const lastAt = ccReminderAtByTabId.get(tabId) || 0;
    if (!force && now - lastAt < 30000) {
        return;
    }

    ccReminderAtByTabId.set(tabId, now);
    await sendToContentScript(tabId, "MEET_SHOW_CC_REQUIRED_REMINDER");
}

async function checkCcAndRemindIfNeeded(tab) {
    if (!tab?.id || !isActiveMeetCallUrl(tab.url)) {
        return;
    }

    const ccLikelyEnabled = await requestCcStatusFromContentScript(tab.id);
    if (ccLikelyEnabled === false) {
        await remindCcRequired(tab.id);
    }
}

async function createSession(tab) {
    if (!tab?.id) {
        throw new Error("missing_tab_id");
    }

    const existing = sessionsByTabId.get(tab.id);
    if (existing) {
        return existing;
    }

    const liveCcStatus = await requestCcStatusFromContentScript(tab.id);
    const tabContext = pageContextByTabId.get(tab.id) || null;
    const captionsLikelyEnabled =
        typeof liveCcStatus === "boolean"
            ? liveCcStatus
            : tabContext?.captionsEnabledLikely;

    if (captionsLikelyEnabled === false) {
        await remindCcRequired(tab.id, true);
    }

    const consent = await getConsentState();
    if (!consent.accepted) {
        throw new Error("consent_required");
    }

    const auth = await ensureAuthenticatedToken();
    if (!auth.authenticated || !auth.token) {
        throw new Error("auth_required");
    }

    const token = auth.token;
    const autoSaveEnabled = await getAutoSavePreference();
    const ownerProfile = await fetchCurrentUserProfile(auth.httpBase, token);
    const session = {
        sessionId: makeSessionId(),
        meetingId: parseMeetingId(tab.url || ""),
        tabId: tab.id,
        location: tab.url || "",
        startedAt: Date.now(),
        lastSeenAt: Date.now(),
        reconnectAttempt: 0,
        reconnectTimer: null,
        stopRequested: false,
        lastError: null,
        pending: [],
        sentAtByEventId: new Map(),
        inflightByEventId: new Map(),
        metrics: {
            sent: 0,
            acked: 0,
            retried: 0,
            dropped: 0,
            reconnects: 0,
            avgAckMs: 0,
            lastAckAt: null
        },
        socket: null,
        token,
        wsBase: auth.wsBase || toWsBase(AUTH_HTTP_BASES[0]),
        authBase: auth.httpBase || AUTH_HTTP_BASES[0],
        meetContext: pageContextByTabId.get(tab.id) || null,
        ownerProfile,
        autoSaveEnabled
    };

    sessionsByTabId.set(tab.id, session);
    connectSocket(session);
    await sendToContentScript(tab.id, "START_CAPTION_CAPTURE");
}

async function tryAutoStartForTab(tab, reason = "auto") {
    if (!AUTO_START_ENABLED) {
        return;
    }

    if (!tab?.id || !isActiveMeetCallUrl(tab.url)) {
        return;
    }

    if (sessionsByTabId.has(tab.id)) {
        return;
    }

    try {
        await createSession(tab);
        console.info(`Auto capture started (${reason}) for tab`, tab.id);
    } catch (error) {
        const expected = ["consent_required", "auth_required"];
        if (expected.includes(error?.message)) {
            return;
        }
        console.warn("Auto capture start failed", error?.message || error);
    }
}

async function stopSession(tabId, reason = "manual_stop") {
    const session = sessionsByTabId.get(tabId);
    if (!session) {
        return;
    }

    session.stopRequested = true;
    clearTimeout(session.reconnectTimer);
    await sendToContentScript(tabId, "STOP_CAPTION_CAPTURE");

    const endMessage = {
        type: "SESSION_END",
        eventId: crypto.randomUUID(),
        payload: {
            sessionId: session.sessionId,
            meetingId: session.meetingId,
            endedAt: Date.now(),
            reason,
            persistOnEnd: Boolean(session.autoSaveEnabled)
        }
    };

    console.info("[meet-extension] stopping session", {
        tabId,
        reason,
        sessionId: session.sessionId,
        meetingId: session.meetingId,
        pendingBeforeEnd: session.pending.length,
        inflightBeforeEnd: session.inflightByEventId.size,
        persistOnEnd: endMessage.payload.persistOnEnd
    });

    await queueAndSend(session, endMessage);
    // Give the gateway a brief window to ACK SESSION_END before socket close.
    const endAcked = await waitForAck(session, endMessage.eventId);
    console.info("[meet-extension] SESSION_END dispatch result", {
        sessionId: session.sessionId,
        eventId: endMessage.eventId,
        acked: endAcked,
        pendingAfterWait: session.pending.length,
        inflightAfterWait: session.inflightByEventId.size
    });

    if (session.socket && session.socket.readyState === WebSocket.OPEN) {
        session.socket.close(1000, "session_ended");
    }

    sessionsByTabId.delete(tabId);
}

function connectSocket(session) {
    session.wsBase = sanitizeWsBase(session.wsBase);
    const socketUrl = makeSocketUrl(session.wsBase, session.token);
    console.info("[meet-extension] connecting websocket", {
        wsBase: session.wsBase,
        sessionId: session.sessionId,
        meetingId: session.meetingId
    });
    const socket = new WebSocket(socketUrl);
    session.socket = socket;

    socket.onopen = async () => {
        session.reconnectAttempt = 0;
        session.lastError = null;
        replayInflightMessages(session);
        await queueAndSend(session, {
            type: "SESSION_START",
            eventId: crypto.randomUUID(),
            __front: true,
            payload: {
                sessionId: session.sessionId,
                meetingId: session.meetingId,
                tabId: session.tabId,
                location: session.location,
                startedAt: session.startedAt,
                meetingTitle: session.meetContext?.meetingTitle || null,
                participants: Array.isArray(session.meetContext?.participants)
                    ? session.meetContext.participants
                    : [],
                participantCount: Number(session.meetContext?.participantCount || 0),
                ownerName: session.ownerProfile?.name || null,
                ownerEmail: session.ownerProfile?.email || null,
                ownerUserId: session.ownerProfile?.userId || null,
                persistOnEnd: Boolean(session.autoSaveEnabled)
            }
        });
        flushQueue(session);
    };

    socket.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            if (message?.type === "ACK" && message.eventId) {
                const sentAt = session.sentAtByEventId.get(message.eventId);
                const inflightEvent = session.inflightByEventId.get(message.eventId);
                session.sentAtByEventId.delete(message.eventId);
                session.inflightByEventId.delete(message.eventId);
                session.metrics.acked += 1;
                session.metrics.lastAckAt = Date.now();
                if (typeof sentAt === "number" && sentAt > 0) {
                    const ackMs = Math.max(0, Date.now() - sentAt);
                    const current = Number(session.metrics.avgAckMs || 0);
                    session.metrics.avgAckMs = current > 0 ? Math.round(current * 0.85 + ackMs * 0.15) : ackMs;
                }
                if (inflightEvent?.type === "SESSION_END") {
                    console.info("[meet-extension] SESSION_END ACK received", {
                        sessionId: session.sessionId,
                        eventId: message.eventId
                    });
                }
            }
        } catch {
            // Ignora mensagens inválidas.
        }
    };

    socket.onclose = async () => {
        if (session.stopRequested) {
            return;
        }

        session.lastError = "socket_closed";
        replayInflightMessages(session);
        session.metrics.reconnects += 1;

        // Re-resolve auth/ws base using cache (only force-refresh after 3 failed reconnects)
        try {
            const forceRefresh = session.reconnectAttempt >= 3;
            const auth = await ensureAuthenticatedToken(forceRefresh);
            if (auth?.token) {
                session.token = auth.token;
            }
            if (auth?.wsBase) {
                session.wsBase = sanitizeWsBase(auth.wsBase);
            } else {
                session.wsBase = sanitizeWsBase(session.wsBase);
            }
        } catch {
            session.wsBase = sanitizeWsBase(session.wsBase);
        }

        session.reconnectAttempt += 1;
        const backoffMs = nextBackoffMs(session.reconnectAttempt);
        session.reconnectTimer = setTimeout(() => connectSocket(session), backoffMs);
    };

    socket.onerror = () => {
        session.lastError = "socket_error";
        // O onclose cuidará do backoff.
    };
}

function sessionEnvelope(session, type, payload) {
    return {
        type,
        eventId: crypto.randomUUID(),
        payload: {
            ...payload,
            sessionId: session.sessionId,
            meetingId: session.meetingId
        }
    };
}

async function getPopupState() {
    const tab = await getActiveTab();
    const auth = await ensureAuthenticatedToken(); // uses cache
    const consent = await getConsentState();
    if (!tab?.id) {
        return {
            ok: true,
            isMeetTab: false,
            sessionActive: false,
            meetingId: null,
            pendingCount: 0,
            token: auth.token,
            authSource: auth.source,
            isAuthenticated: auth.authenticated,
            authVerified: auth.verified,
            authBase: auth.httpBase,
            sessionKey: auth.key,
            hasError: false,
            inflightCount: 0,
            diagnostics: null,
            autoSaveEnabled: await getAutoSavePreference(),
            consentAccepted: consent.accepted,
            consentAcceptedAt: consent.acceptedAt,
            consentVersion: consent.version
        };
    }

    const session = sessionsByTabId.get(tab.id);
    const meetContext = session?.meetContext || pageContextByTabId.get(tab.id) || null;
    return {
        ok: true,
        isMeetTab: isMeetUrl(tab.url),
        sessionActive: Boolean(session),
        meetingId: session?.meetingId || parseMeetingId(tab.url || ""),
        pendingCount: session?.pending?.length || 0,
        inflightCount: session?.inflightByEventId?.size || 0,
        token: auth.token,
        authSource: auth.source,
        isAuthenticated: auth.authenticated,
        authVerified: auth.verified,
        authBase: auth.httpBase,
        sessionKey: auth.key,
        hasError: Boolean(session?.lastError),
        diagnostics: session
            ? {
                sent: session.metrics.sent,
                acked: session.metrics.acked,
                retried: session.metrics.retried,
                dropped: session.metrics.dropped,
                reconnects: session.metrics.reconnects,
                avgAckMs: session.metrics.avgAckMs,
                lastAckAt: session.metrics.lastAckAt
            }
            : null,
        meetContext,
        autoSaveEnabled: session ? Boolean(session.autoSaveEnabled) : await getAutoSavePreference(),
        consentAccepted: consent.accepted,
        consentAcceptedAt: consent.acceptedAt,
        consentVersion: consent.version
    };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
        if (message?.type === "POPUP_GET_STATE") {
            sendResponse?.(await getPopupState());
            return;
        }

        if (message?.type === "POPUP_SYNC_SESSION") {
            const auth = await ensureAuthenticatedToken();
            sendResponse?.({
                ok: auth.authenticated,
                reason: auth.authenticated ? undefined : "web_login_required",
                authSource: auth.source,
                sessionKey: auth.key
            });
            return;
        }

        if (message?.type === "POPUP_SET_CONSENT") {
            await setConsentState(Boolean(message?.payload?.accepted));
            sendResponse?.({ ok: true });
            return;
        }

        if (message?.type === "POPUP_START_CAPTURE") {
            const tab = await getActiveTab();
            if (!tab?.id || !isMeetUrl(tab.url)) {
                sendResponse?.({ ok: false, reason: "meet_tab_required" });
                return;
            }

            try {
                await createSession(tab);
                sendResponse?.({ ok: true });
            } catch (error) {
                const reason =
                    error?.message === "consent_required"
                        ? "consent_required"
                        : error?.message === "auth_required"
                            ? "auth_required"
                            : "start_failed";
                sendResponse?.({ ok: false, reason });
            }
            return;
        }

        if (message?.type === "POPUP_SET_AUTOSAVE") {
            const enabled = await setAutoSavePreference(Boolean(message?.payload?.enabled));
            const tab = await getActiveTab();
            if (tab?.id && sessionsByTabId.has(tab.id)) {
                const active = sessionsByTabId.get(tab.id);
                if (active) {
                    active.autoSaveEnabled = enabled;
                }
            }
            sendResponse?.({ ok: true, enabled });
            return;
        }

        if (message?.type === "POPUP_STOP_CAPTURE") {
            const tab = await getActiveTab();
            if (!tab?.id) {
                sendResponse?.({ ok: false, reason: "missing_tab_id" });
                return;
            }

            await stopSession(tab.id, "popup_stop");
            sendResponse?.({ ok: true });
            return;
        }

        const tabId = sender?.tab?.id;
        if (!tabId) {
            sendResponse?.({ ok: false, reason: "missing_tab_id" });
            return;
        }

        if (message?.type === "MEET_PAGE_CONTEXT") {
            const nextContext = {
                meetingTitle: String(message?.payload?.meetingTitle || "").trim() || null,
                participants: Array.isArray(message?.payload?.participants)
                    ? message.payload.participants
                        .map((name) => String(name || "").trim())
                        .filter(Boolean)
                        .slice(0, 20)
                    : [],
                participantCount: Number(message?.payload?.participantCount || 0),
                captionsEnabledLikely: Boolean(message?.payload?.captionsEnabledLikely),
                extractedAt: Number(message?.payload?.extractedAt || Date.now()),
                location: String(message?.payload?.location || sender?.tab?.url || "").trim() || null
            };

            pageContextByTabId.set(tabId, nextContext);
            const activeSession = sessionsByTabId.get(tabId);
            if (activeSession) {
                activeSession.meetContext = nextContext;
            }

            sendResponse?.({ ok: true });
            return;
        }

        const session = sessionsByTabId.get(tabId);
        if (!session) {
            sendResponse?.({ ok: false, reason: "session_not_started" });
            return;
        }

        markSessionAlive(session);

        if (message?.type === "MEET_CAPTION_SEGMENT") {
            queueAndSend(session, sessionEnvelope(session, "CAPTION_SEGMENT", message.payload));
            sendResponse?.({ ok: true });
            return;
        }

        if (message?.type === "MEET_CAPTION_HEARTBEAT") {
            queueAndSend(
                session,
                sessionEnvelope(session, "HEARTBEAT", {
                    timestampMs: message.payload?.timestampMs || Date.now(),
                    location: message.payload?.location || session.location
                })
            );
            sendResponse?.({ ok: true });
            return;
        }

        sendResponse?.({ ok: false, reason: "unsupported_message_type" });
    })().catch((error) => {
        sendResponse?.({
            ok: false,
            reason: "runtime_error",
            message: error?.message || "unknown"
        });
    });

    return true;
});

chrome.action.onClicked.addListener(async (tab) => {
    if (!tab?.id) {
        return;
    }

    const isMeetTab = tab.url?.startsWith("https://meet.google.com/");
    if (!isMeetTab) {
        console.warn("Abra uma aba do Google Meet antes de iniciar a captura de legendas.");
        return;
    }

    if (sessionsByTabId.has(tab.id)) {
        await stopSession(tab.id, "toggle_stop");
        return;
    }

    try {
        await createSession(tab);
    } catch (error) {
        if (error?.message === "consent_required") {
            console.warn("Consentimento obrigatório antes de iniciar captura.");
            return;
        }
        console.error("Falha ao iniciar sessão de captura.", error);
    }
});

chrome.tabs.onRemoved.addListener((tabId) => {
    pageContextByTabId.delete(tabId);
    ccReminderAtByTabId.delete(tabId);
    if (!sessionsByTabId.has(tabId)) {
        return;
    }

    stopSession(tabId, "tab_closed").catch(() => {
        // Sem ação adicional.
    });
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
    try {
        const tab = await chrome.tabs.get(tabId);
        // Only auto-start, don't nag about CC on every tab switch
        await tryAutoStartForTab(tab, "tab_activated");
    } catch {
        // noop
    }
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    const changedUrl = typeof changeInfo.url === "string";
    const finished = changeInfo.status === "complete";
    if (!changedUrl && !finished) {
        return;
    }

    // Only auto-start, CC check happens once when session is created
    await tryAutoStartForTab(tab, changedUrl ? "url_changed" : "load_complete");
});

setInterval(() => {
    const now = Date.now();
    for (const [tabId, session] of sessionsByTabId.entries()) {
        if (now - session.lastSeenAt > SESSION_TTL_MS) {
            stopSession(tabId, "idle_timeout").catch(() => {
                // Sem ação adicional.
            });
        }
    }
}, 30000);

chrome.runtime.onInstalled.addListener(() => {
    const version = chrome.runtime.getManifest?.().version || "unknown";
    console.info(`[meet-extension] service worker installed v${version}`);
    migrateLegacyAuthBaseStorage().catch(() => {
        // noop
    });
});

chrome.runtime.onStartup.addListener(() => {
    const version = chrome.runtime.getManifest?.().version || "unknown";
    console.info(`[meet-extension] service worker startup v${version}`);
    migrateLegacyAuthBaseStorage().catch(() => {
        // noop
    });
});

(() => {
    const version = chrome.runtime.getManifest?.().version || "unknown";
    console.info(`[meet-extension] service worker loaded v${version}`);
    migrateLegacyAuthBaseStorage().catch(() => {
        // noop
    });
})();
