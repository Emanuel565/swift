function normalizeTokenCandidate(value) {
    const raw = String(value || '').trim();
    if (!raw || raw === 'undefined' || raw === 'null') {
        return null;
    }

    const stripQuotes = (input) => {
        const text = String(input || '').trim();
        if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
            return text.slice(1, -1).trim();
        }
        return text;
    };

    let token = stripQuotes(raw);
    token = token.replace(/^bearer\s+/i, '').trim();

    // Some apps store auth payload JSON in localStorage keys.
    if (token.startsWith('{') && token.endsWith('}')) {
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
            // Keep raw candidate path.
        }
    }

    return token || null;
}

function readTokenFromPage() {
    const candidates = ["serviceToken", "accessToken", "token", "access_token", "jwt", "authToken"];

    for (const key of candidates) {
        try {
            const value = localStorage.getItem(key);
            const normalized = normalizeTokenCandidate(value);
            if (normalized) {
                return normalized;
            }
        } catch {
            // Ignore storage errors.
        }
    }

    try {
        const match = document.cookie.match(/(?:^|;\s*)access_token=([^;]+)/);
        if (match && match[1]) {
            const token = normalizeTokenCandidate(decodeURIComponent(match[1]));
            if (token) {
                return token;
            }
        }
    } catch {
        // Ignore cookie parsing errors.
    }

    return null;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "EXTENSION_GET_WEB_SESSION") {
        return;
    }

    const token = readTokenFromPage();
    sendResponse({
        ok: true,
        token,
        pageOrigin: window.location.origin,
        pageUrl: window.location.href
    });
});
