 const CAPTION_ROOT_SELECTOR_TIERS = [
    {
        tier: 'meet-caption-container',
        selectors: [
            'div[jsname="dsyhDe"]',
            'div[jsname="YPqjbf"]',
            'div[jsname="j5Wqab"]',
            'div[jsname="tgaKEf"]',
            // Additional jsname values seen in recent Meet versions
            'div[jsname="Ng1t5c"]',
            'div[jsname="r4nke"]',
            'div[jsname="KyGXpe"]',
            'div[jsname="GSSoPd"]',
            'div[jsname="biJjHb"]',
        ]
    },
    {
        // Google Web Components: jscontroller parent wrapping live regions
        tier: 'jscontroller-live',
        selectors: [
            '[jscontroller] > [aria-live="polite"]',
            '[jscontroller][aria-live="polite"]',
        ]
    },
    {
        tier: 'aria-live-caption',
        selectors: ['[aria-live="polite"][role="region"]', '[aria-live="polite"][class*="caption" i]']
    },
    {
        tier: 'aria-live-validated',
        selectors: ['[aria-live="polite"]', '[aria-live="assertive"]'],
        requireValidation: true
    }
];

const CAPTIONS_BUTTON_SELECTORS = [
    'button[aria-label*="caption" i]',
    'button[aria-label*="legenda" i]',
    'button[aria-label*="subtitle" i]',
    'button[aria-label*="transcri" i]',
    'button[data-tooltip-id*="capt" i]',
    'button[jsname][aria-pressed][aria-label]'
];

const CAPTIONS_SETTINGS_BUTTON_SELECTORS = [
    'button[aria-label*="caption settings" i]',
    'button[aria-label*="subtitle settings" i]',
    'button[aria-label*="configuracoes da legenda" i]',
    'button[aria-label*="configuracoes de legenda" i]'
];

const PORTUGUESE_LANGUAGE_PATTERNS = [
    /portugu[eê]s/i,
    /portuguese/i,
    /pt[-\s]?br/i,
    /portugu[eê]s\s*\(\s*brasil\s*\)/i,
    /portugu[eê]s\s*do\s*brasil/i,
    /brasil/i
];

const MORE_OPTIONS_PATTERNS = [
    /more options/i,
    /mais op[cç][oõ]es/i,
    /menu principal/i
];

const SETTINGS_PATTERNS = [
    /^settings$/i,
    /configura[cç][oõ]es/i
];

const CAPTIONS_SECTION_PATTERNS = [
    /^captions?$/i,
    /^subtitles?$/i,
    /legendas?/i,
    /transcri[cç][aã]o/i
];

const SYSTEM_TEXT_PATTERNS = [
    /microfone/i,
    /alto.?falante/i,
    /arrow_drop_down/i,
    /arrow_drop_up/i,
    /help_outline/i,
    /padr[aã]o do sistema/i,
    /ac[uú]stica/i,
    /filtra os sons/i,
    /pressione para falar/i,
    /barra de espa[cç]o/i,
    /dispositivo USB/i,
    /controle de chamadas/i,
    /conecte.o para/i,
    /conectar dispositivo/i,
    /high definition audio/i,
    /realtek digital/i,
    /nvidia high/i,
    /ATK Mercury/i,
    /\(\d+[-–]\s/,
    /mic_none/i,
    /videocam/i,
    /volume_up/i,
    /headset/i,
    /speaker_phone/i,
    /settings_voice/i,
    /keyboard_arrow/i,
    /mais op[cç][oõ]es/i,
    /configurar tudo/i,
    /\d+\s*segundos?\s*restantes/i,
    /voltando [àa] tela inicial/i,
    /algo na guia/i,
    /precisa da sua aten/i,
    /you ended the call/i,
    /the meeting has ended/i,
    /returning to home screen/i,
    /voc[eê] encerrou a reuni[aã]o/i
];

const UI_LABEL_EXACT = new Set([
    'check', 'help', 'add', 'testar', 'cancel', 'ok', 'fechar', 'close',
    'settings', 'mic', 'audio', 'video', 'mute', 'unmute', 'send',
    'more_vert', 'more_horiz', 'arrow_back', 'arrow_forward',
    'call_end', 'screen_share', 'present_to_all', 'pan_tool',
    'people', 'chat', 'info', 'security', 'tune', 'brush',
    'emoji_people', 'record_voice_over', 'subtitles', 'closed_caption',
    'legendas', 'captions', 'you', 'voce', 'participante'
]);

function isSystemOrUiText(text) {
    if (!text || text.length < 2) return true;
    if (text.length > 500) return true;
    if (SYSTEM_TEXT_PATTERNS.some((rx) => rx.test(text))) return true;
    // Reject single-word UI labels / Material Icon ligatures
    const lower = text.toLowerCase().replace(/[^a-záàâãéêíóôõúüç_]/gi, '');
    if (UI_LABEL_EXACT.has(lower)) return true;
    // Reject icon-font ligatures: only lowercase letters and underscores, SHORT text
    // Material icons render as ligatures like "more_vert", "call_end", "mic_none"
    // They always contain underscores or are very short single tokens
    if (/^[a-z_]+$/.test(text) && text.length <= 20 && (text.includes('_') || text.length <= 3)) return true;
    const alphaRatio = (text.replace(/[^a-zA-ZÀ-ÿ]/g, '').length) / text.length;
    if (text.length > 10 && alphaRatio < 0.4) return true;
    return false;
}

function looksLikeDeviceName(text) {
    if (!text) return false;
    return /\(ATK|Mercury|Realtek|NVIDIA|High Definition|USB Audio|Headset|Speakers?\)/i.test(text)
        || /arrow_drop|mic_none|videocam|volume_up|headset_mic|speaker_phone|settings_voice/i.test(text);
}


const SENT_CACHE_LIMIT = 300;
const sentKeys = new Set();
const knownSpeakers = new Set();
const KNOWN_SPEAKERS_LIMIT = 50;
let sequence = 0;
let observer;
let heartbeatTimer;
let captionsEnsureTimer;
let contextSyncTimer;
let periodicScanTimer;
let passiveCcTimer;
let periodicScanStartedAt = 0;
let totalSegmentsEmitted = 0;
let captureSessionOk = true; // tracks if background session exists
let captureEnabled = false;
let captionLanguageConfigured = false;
let captionsToggleAttempts = 0;
let languageConfigAttempts = 0;
let lastContextHash = '';
let lastRootSeenAt = 0;
let lastSegmentEmittedAt = 0;

function normalizeText(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function parseMeetingIdFromLocation() {
    try {
        const [meetingId] = window.location.pathname.replace(/^\//, '').split('/');
        return meetingId || 'unknown-meeting';
    } catch {
        return 'unknown-meeting';
    }
}

function rememberKey(key) {
    sentKeys.add(key);
    if (sentKeys.size <= SENT_CACHE_LIMIT) {
        return;
    }

    const first = sentKeys.values().next().value;
    if (first) {
        sentKeys.delete(first);
    }
}

function rememberSpeaker(name) {
    const value = normalizeText(name);
    if (!value) return;
    knownSpeakers.add(value);
    if (knownSpeakers.size <= KNOWN_SPEAKERS_LIMIT) {
        return;
    }
    const first = knownSpeakers.values().next().value;
    if (first) {
        knownSpeakers.delete(first);
    }
}

function findCaptionRootsWithTier() {
    for (const group of CAPTION_ROOT_SELECTOR_TIERS) {
        const roots = [];
        const seen = new Set();

        for (const selector of group.selectors) {
            for (const node of document.querySelectorAll(selector)) {
                if (!node || seen.has(node)) {
                    continue;
                }
                // For the validated tier, only accept nodes that pass isLikelyCaptionRoot
                if (group.requireValidation && !isLikelyCaptionRoot(node)) {
                    continue;
                }
                seen.add(node);
                roots.push(node);
            }
        }

        if (roots.length) {
            return {
                tier: group.tier,
                roots
            };
        }
    }

    return {
        tier: 'none',
        roots: []
    };
}

/**
 * Validates whether an [aria-live="polite"] element is likely the actual
 * Google Meet caption container (as opposed to a notification, settings
 * panel, device list, or toolbar).
 */
function isLikelyCaptionRoot(el) {
    if (!el) return false;

    // Must be visible
    if (!isVisibleElement(el)) return false;

    // Must NOT be inside a dialog, menu, toolbar, navigation, or settings panel
    if (el.closest('[role="dialog"], [role="menu"], [role="toolbar"], [role="menubar"], [role="listbox"], [role="navigation"], [role="alertdialog"]')) {
        return false;
    }

    // Allow up to 5 interactive children (Meet may add UI controls near caption area)
    const interactiveCount = el.querySelectorAll('button, input, select, textarea, [role="menuitem"], [role="slider"], [role="checkbox"], [role="switch"]').length;
    if (interactiveCount > 5) {
        return false;
    }

    // Must be in the bottom 75% of the viewport (captions appear at bottom)
    const rect = el.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    if (rect.top < viewportHeight * 0.25) return false;

    // Must have text content of reasonable length
    const text = (el.textContent || '').trim();
    if (text.length < 2) return false;

    // Must not be a role that wouldn't contain captions
    const role = (el.getAttribute('role') || '').toLowerCase();
    if (['toolbar', 'navigation', 'menubar', 'tablist', 'banner', 'complementary'].includes(role)) {
        return false;
    }

    return true;
}

function normalizeLabel(value) {
    return normalizeText(String(value || '')).toLowerCase();
}

function findCaptionsToggleButton() {
    for (const selector of CAPTIONS_BUTTON_SELECTORS) {
        const nodes = document.querySelectorAll(selector);
        for (const node of nodes) {
            const label = normalizeLabel(node.getAttribute?.('aria-label'));
            const title = normalizeLabel(node.getAttribute?.('title'));
            const text = normalizeLabel(node.textContent);
            const full = `${label} ${title} ${text}`.trim();
            if (!full) continue;

            const hasCaptionHint = /(caption|legenda|subtitle|transcri)/i.test(full);
            if (!hasCaptionHint) continue;

            return node;
        }
    }

    return null;
}

function isVisibleElement(node) {
    if (!node) return false;
    const rect = node.getBoundingClientRect?.();
    if (!rect) return false;
    if (rect.width <= 0 || rect.height <= 0) return false;

    const style = window.getComputedStyle?.(node);
    if (!style) return true;
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
}

function collectClickableNodes() {
    return Array.from(document.querySelectorAll(
        [
            '[role="menuitem"]',
            '[role="option"]',
            '[role="button"]',
            'button'
        ].join(',')
    ));
}

function clickFirstVisibleByText(patterns) {
    const node = findNodeByText(patterns);
    if (!node) return false;
    return clickNode(node);
}

function canDispatchShortcuts() {
    const active = document.activeElement;
    if (!active) return true;
    const tag = String(active.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return false;
    if (active.getAttribute?.('contenteditable') === 'true') return false;
    return true;
}

function dispatchCaptionShortcutFallback() {
    if (!canDispatchShortcuts()) {
        return false;
    }

    const events = [
        { key: 'c', code: 'KeyC', ctrlKey: false, shiftKey: false },
        { key: 'c', code: 'KeyC', ctrlKey: true, shiftKey: true }
    ];

    for (const ev of events) {
        try {
            const down = new KeyboardEvent('keydown', {
                key: ev.key,
                code: ev.code,
                bubbles: true,
                cancelable: true,
                ctrlKey: ev.ctrlKey,
                shiftKey: ev.shiftKey
            });
            const up = new KeyboardEvent('keyup', {
                key: ev.key,
                code: ev.code,
                bubbles: true,
                cancelable: true,
                ctrlKey: ev.ctrlKey,
                shiftKey: ev.shiftKey
            });
            document.dispatchEvent(down);
            document.dispatchEvent(up);
        } catch {
            // noop
        }
    }

    return true;
}

function tryOpenSettingsPathToCaptionsLanguage() {
    if (clickFirstVisibleByText(MORE_OPTIONS_PATTERNS)) {
        window.setTimeout(() => {
            if (clickFirstVisibleByText(SETTINGS_PATTERNS)) {
                window.setTimeout(() => {
                    clickFirstVisibleByText(CAPTIONS_SECTION_PATTERNS);
                }, 220);
            }
        }, 220);
        return true;
    }

    return false;
}

function findNodeByText(patterns) {
    const nodes = collectClickableNodes();
    for (const node of nodes) {
        if (!isVisibleElement(node)) continue;
        const text = normalizeLabel(node.textContent || node.getAttribute?.('aria-label') || node.getAttribute?.('title'));
        if (!text) continue;
        if (patterns.some((rx) => rx.test(text))) {
            return node;
        }
    }
    return null;
}

function clickNode(node) {
    if (!node) return false;
    try {
        node.click();
        return true;
    } catch {
        return false;
    }
}

function findCaptionsSettingsButton() {
    for (const selector of CAPTIONS_SETTINGS_BUTTON_SELECTORS) {
        const node = document.querySelector(selector);
        if (node && isVisibleElement(node)) {
            return node;
        }
    }
    return null;
}

function trySelectPortugueseLanguage() {
    if (!captureEnabled || captionLanguageConfigured) {
        return;
    }

    // If language options are already visible, select Portuguese directly.
    const directLanguageNode = findNodeByText(PORTUGUESE_LANGUAGE_PATTERNS);
    if (directLanguageNode && clickNode(directLanguageNode)) {
        captionLanguageConfigured = true;
        languageConfigAttempts = 0;
        return;
    }

    // Open captions settings first.
    const settingsButton = findCaptionsSettingsButton();
    if (settingsButton) {
        if (!clickNode(settingsButton)) {
            return;
        }

        window.setTimeout(() => {
            const languageMenu = findNodeByText([
                /caption language/i,
                /subtitle language/i,
                /idioma da legenda/i,
                /lingua da legenda/i,
                /idioma/i
            ]);

            if (languageMenu && clickNode(languageMenu)) {
                window.setTimeout(() => {
                    const ptNode = findNodeByText(PORTUGUESE_LANGUAGE_PATTERNS);
                    if (ptNode && clickNode(ptNode)) {
                        captionLanguageConfigured = true;
                        languageConfigAttempts = 0;
                    }
                }, 150);
                return;
            }

            const ptNode = findNodeByText(PORTUGUESE_LANGUAGE_PATTERNS);
            if (ptNode && clickNode(ptNode)) {
                captionLanguageConfigured = true;
                languageConfigAttempts = 0;
            }
        }, 150);
        languageConfigAttempts += 1;
        return;
    }

    if (languageConfigAttempts < 4) {
        languageConfigAttempts += 1;
        tryOpenSettingsPathToCaptionsLanguage();
    }
}

function isCaptionsLikelyEnabled(button) {
    if (!button) return false;

    const pressed = String(button.getAttribute?.('aria-pressed') || '').toLowerCase();
    if (pressed === 'true') return true;

    const label = normalizeLabel(button.getAttribute?.('aria-label'));
    const title = normalizeLabel(button.getAttribute?.('title'));
    const text = normalizeLabel(button.textContent);
    const full = `${label} ${title} ${text}`;

    // In Meet, labels often switch from "turn on" to "turn off" captions.
    if (/(turn off|desativar|ocultar|hide captions|stop captions)/i.test(full)) {
        return true;
    }

    return false;
}

function ensureCaptionsEnabled() {
    if (!captureEnabled) {
        return;
    }

    const button = findCaptionsToggleButton();
    if (!button) {
        if (captionsToggleAttempts < 3) {
            captionsToggleAttempts += 1;
            dispatchCaptionShortcutFallback();
        }
        return;
    }

    if (isCaptionsLikelyEnabled(button)) {
        captionsToggleAttempts = 0;
        return;
    }

    try {
        button.click();
        captionsToggleAttempts += 1;
    } catch {
        // noop
    }
}

function isLikelyMeetCallPage() {
    const path = String(window.location?.pathname || '').replace(/^\//, '');
    const meetingCode = path.split('/')[0] || '';
    return /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/i.test(meetingCode);
}

function ensureCaptionsEnabledPassive() {
    if (!isLikelyMeetCallPage()) {
        return;
    }

    const button = findCaptionsToggleButton();
    if (!button) {
        if (captionsToggleAttempts < 2) {
            captionsToggleAttempts += 1;
            dispatchCaptionShortcutFallback();
        }
        return;
    }

    if (isCaptionsLikelyEnabled(button)) {
        captionsToggleAttempts = 0;
        return;
    }

    try {
        button.click();
        captionsToggleAttempts += 1;
    } catch {
        // noop
    }
}

function trySelectPortugueseLanguagePassive() {
    if (!isLikelyMeetCallPage() || captionLanguageConfigured) {
        return;
    }

    const directLanguageNode = findNodeByText(PORTUGUESE_LANGUAGE_PATTERNS);
    if (directLanguageNode && clickNode(directLanguageNode)) {
        captionLanguageConfigured = true;
        languageConfigAttempts = 0;
        return;
    }

    const settingsButton = findCaptionsSettingsButton();
    if (settingsButton && clickNode(settingsButton)) {
        languageConfigAttempts += 1;
        return;
    }

    if (languageConfigAttempts < 3) {
        languageConfigAttempts += 1;
        tryOpenSettingsPathToCaptionsLanguage();
    }
}

function extractSegmentsFromNode(node) {
    const segments = [];

    // --- Speaker detection: only use Meet's participant data attributes ---
    const speakerNode = node.querySelector?.('[data-self-name], [data-participant-name]');
    let speaker = normalizeText(
        speakerNode?.getAttribute?.('data-self-name') ||
        speakerNode?.getAttribute?.('data-participant-name') ||
        ''
    );

    // Fallback: look for a bold/image-name element that Meet uses for speaker labels
    if (!speaker) {
        const nameNode = node.querySelector?.('[class*="speaker" i], [class*="name" i]');
        if (nameNode) {
            const candidate = normalizeText(nameNode.textContent);
            if (candidate && candidate.length >= 2 && candidate.length <= 60 && !looksLikeDeviceName(candidate)) {
                speaker = candidate;
            }
        }
    }

    // If speaker still looks like a device name, clear it
    if (speaker && looksLikeDeviceName(speaker)) {
        speaker = '';
    }

    // Strategy 1: Use innerText split by newlines (most robust — matches visible text)
    try {
        const visibleText = (node.innerText || '').trim();
        if (visibleText && visibleText.length >= 2) {
            const lines = visibleText.split(/\n+/)
                .map(l => normalizeText(l))
                .filter(l => l && l.length >= 2);

            for (const line of lines) {
                if (isSystemOrUiText(line)) continue;
                if (looksLikeDeviceName(line)) continue;
                segments.push({ speaker, text: line });
            }
        }
    } catch { /* innerText can throw in edge cases */ }

    // Strategy 2: Leaf / shallow node scan (fallback if innerText gave nothing)
    if (segments.length === 0) {
        const leafs = node.querySelectorAll?.('span, div') || [];
        for (const leaf of leafs) {
            // Skip nodes that have interactive children
            if (leaf.querySelector?.('button, select, input, [role="button"], [role="menuitem"], [role="listbox"]')) {
                continue;
            }

            const text = normalizeText(leaf.textContent);
            if (!text || text.length < 2) continue;
            if (isSystemOrUiText(text)) continue;

            // Skip if this text is a superset of something we already have (avoid duplication)
            if (segments.some(s => s.text === text || text.includes(s.text))) continue;
            segments.push({ speaker, text });
        }
    }

    // Strategy 3: Root textContent (last resort)
    if (segments.length === 0) {
        const rootText = normalizeText(node.textContent);
        if (rootText && rootText.length >= 2 && !isSystemOrUiText(rootText)) {
            console.debug('[meet-ext] fallback: using root textContent:', rootText.substring(0, 60));
            segments.push({ speaker, text: rootText });
        }
    }

    // Deduplicate: keep only the most specific (non-substring) segments
    const unique = [];
    const texts = new Set();
    for (let i = segments.length - 1; i >= 0; i--) {
        const t = segments[i].text;
        let isSubstring = false;
        for (const existing of texts) {
            if (existing !== t && existing.includes(t)) {
                isSubstring = true;
                break;
            }
        }
        if (!isSubstring) {
            texts.add(t);
            unique.unshift(segments[i]);
        }
    }

    return unique;
}

function emitSegment(segment) {
    if (!captureEnabled) {
        return;
    }

    const text = normalizeText(segment.text);
    if (!text) {
        return;
    }

    // Final safety check: reject system/device text that slipped through
    if (isSystemOrUiText(text)) {
        console.debug('[meet-ext] emitSegment REJECTED (system/ui):', text.substring(0, 50));
        return;
    }

    // Reject speaker if it looks like a device name
    const speaker = (segment.speaker && !looksLikeDeviceName(segment.speaker))
        ? segment.speaker
        : null;

    const key = `${speaker || ''}|${text}`;
    if (sentKeys.has(key)) {
        return;
    }

    rememberKey(key);
    if (speaker) {
        rememberSpeaker(speaker);
    }
    sequence += 1;
    totalSegmentsEmitted += 1;
    lastSegmentEmittedAt = Date.now();

    console.debug('[meet-ext] EMIT #%d speaker=%s text=%s', sequence, speaker || '(none)', text.substring(0, 60));

    chrome.runtime
        .sendMessage({
            type: 'MEET_CAPTION_SEGMENT',
            payload: {
                speaker: segment.speaker || null,
                text,
                sequence,
                timestampMs: Date.now(),
                location: window.location.href
            }
        })
        .then(response => {
            if (response?.ok === false && response.reason === 'session_not_started') {
                captureSessionOk = false;
                console.warn('[meet-ext] ⚠ segment rejected: background has NO active session. Start capture from popup.');
                updateCaptureBadge('no-session', 'Sem sessão — inicie pelo popup');
            } else {
                captureSessionOk = true;
            }
        })
        .catch(() => {
            // Ignora falhas quando o service worker está reiniciando.
        });
}

function computeCaptureHealth(rootsInfo) {
    const now = Date.now();
    const rootsCount = rootsInfo?.roots?.length || 0;
    const captionsLikelyEnabled = Boolean(
        isCaptionsLikelyEnabled(findCaptionsToggleButton()) || rootsCount
    );

    if (!captureEnabled) {
        return {
            status: 'stopped',
            selectorTier: rootsInfo?.tier || 'none',
            rootsCount,
            captionsLikelyEnabled,
            lastRootSeenAt,
            lastSegmentEmittedAt
        };
    }

    let status = 'searching_caption_container';
    if (rootsCount > 0) {
        status = 'captions_detected';
    } else if (captionsLikelyEnabled) {
        status = 'captions_enabled_waiting_text';
    }

    if (lastSegmentEmittedAt && now - lastSegmentEmittedAt > 60000 && captionsLikelyEnabled) {
        status = 'captions_enabled_no_recent_lines';
    }

    return {
        status,
        selectorTier: rootsInfo?.tier || 'none',
        rootsCount,
        captionsLikelyEnabled,
        lastRootSeenAt,
        lastSegmentEmittedAt
    };
}

function extractMeetingTitle() {
    // 1. Try the specific Meet data attribute
    const dataTitle = document.querySelector('[data-meeting-title]');
    if (dataTitle) {
        const val = normalizeText(dataTitle.getAttribute('data-meeting-title') || dataTitle.textContent);
        if (val && val.length >= 2) return val;
    }

    // 2. Try the info bar / call title area used in current Meet UI
    const infoSelectors = [
        '[data-call-title]',
        '[data-unresolved-meeting-id]',
        'div[jsname="NfFZ0d"]',
        'div[data-meeting-code]'
    ];
    for (const sel of infoSelectors) {
        const el = document.querySelector(sel);
        if (el) {
            const val = normalizeText(
                el.getAttribute('data-call-title') ||
                el.getAttribute('data-meeting-code') ||
                el.textContent
            );
            if (val && val.length >= 2 && val.length <= 200) return val;
        }
    }

    // 3. Try document title minus "Google Meet" suffix
    const fromTitle = normalizeText(document.title || '')
        .replace(/\s*[-–—|]\s*Google Meet$/i, '')
        .replace(/^Google Meet\s*[-–—|]\s*/i, '');
    if (fromTitle && fromTitle.length >= 2 && fromTitle !== 'Google Meet') {
        return fromTitle;
    }

    return null;
}

function collectParticipantsFromDom() {
    const selectors = [
        '[data-participant-name]',
        '[data-self-name]',
        '[data-participant-id] [role="listitem"]',
        '[aria-label*="participants" i] [role="listitem"]',
        '[aria-label*="participantes" i] [role="listitem"]'
    ];

    const names = new Set();
    for (const selector of selectors) {
        const nodes = document.querySelectorAll(selector);
        for (const node of nodes) {
            const raw = normalizeText(
                node.getAttribute?.('data-participant-name') ||
                node.getAttribute?.('data-self-name') ||
                node.textContent ||
                ''
            );

            if (!raw || raw.length < 2) continue;
            if (/^(captions?|legendas?|settings|configura[cç][oõ]es|testar|microfone|alto.?falante)$/i.test(raw)) continue;
            if (looksLikeDeviceName(raw)) continue;
            names.add(raw);
            if (names.size >= 20) {
                return Array.from(names);
            }
        }
    }

    return Array.from(names);
}

function extractMeetPageContext() {
    const rootsInfo = findCaptionRootsWithTier();
    if (rootsInfo.roots.length) {
        lastRootSeenAt = Date.now();
    }

    const participants = new Set();
    for (const name of collectParticipantsFromDom()) {
        participants.add(name);
    }
    for (const speaker of knownSpeakers) {
        participants.add(speaker);
    }

    const participantsList = Array.from(participants)
        .map((name) => normalizeText(name))
        .filter(Boolean)
        .slice(0, 20);

    return {
        meetingId: parseMeetingIdFromLocation(),
        meetingTitle: extractMeetingTitle(),
        participants: participantsList,
        participantCount: participantsList.length,
        captionsEnabledLikely: Boolean(isCaptionsLikelyEnabled(findCaptionsToggleButton()) || rootsInfo.roots.length),
        captureHealth: computeCaptureHealth(rootsInfo),
        extractedAt: Date.now(),
        location: window.location.href
    };
}

function contextHash(ctx) {
    return [
        ctx.meetingId || '',
        ctx.meetingTitle || '',
        String(ctx.captionsEnabledLikely),
        String(ctx.participantCount),
        ctx.participants.join('|')
    ].join('::');
}

function emitPageContext(force = false) {
    const ctx = extractMeetPageContext();
    const hash = contextHash(ctx);
    if (!force && hash === lastContextHash) {
        return;
    }
    lastContextHash = hash;

    chrome.runtime
        .sendMessage({
            type: 'MEET_PAGE_CONTEXT',
            payload: ctx
        })
        .catch(() => {
            // Ignora falhas durante restart do service worker.
        });
}

function startContextSync() {
    emitPageContext(true);
    clearInterval(contextSyncTimer);
    contextSyncTimer = setInterval(() => {
        emitPageContext(false);
    }, 12000);
}

function stopContextSync() {
    clearInterval(contextSyncTimer);
    contextSyncTimer = null;
}

function scanAndEmit() {
    const rootsInfo = findCaptionRootsWithTier();
    const roots = rootsInfo.roots;
    if (roots.length) {
        lastRootSeenAt = Date.now();
    }

    if (roots.length) {
        console.debug('[meet-ext] scanAndEmit: tier=%s roots=%d', rootsInfo.tier, roots.length);
    } else if (captureEnabled && Date.now() % 10000 < 2500) {
        // Log "no roots" only occasionally to avoid console spam
        const ariaPoliteCount = document.querySelectorAll('[aria-live="polite"]').length;
        const ariaAnyCount = document.querySelectorAll('[aria-live]').length;
        console.debug('[meet-ext] scanAndEmit: NO roots found. aria-live=polite:%d aria-live(any):%d', ariaPoliteCount, ariaAnyCount);
        // Log all aria-live elements for debugging
        if (ariaAnyCount > 0 && ariaAnyCount <= 15) {
            document.querySelectorAll('[aria-live]').forEach(el => {
                const rect = el.getBoundingClientRect();
                const text = (el.textContent || '').trim().substring(0, 50);
                console.debug('[meet-ext]   → aria-live="%s" role="%s" top=%d visible=%s text="%s"',
                    el.getAttribute('aria-live'), el.getAttribute('role') || '', Math.round(rect.top),
                    isVisibleElement(el), text);
            });
        }
    }

    let segmentsThisScan = 0;
    for (const root of roots) {
        // Skip roots that are inside settings dialogs / menus
        if (root.closest?.('[role="dialog"]') || root.closest?.('[role="menu"]') || root.closest?.('[role="listbox"]')) {
            console.debug('[meet-ext] skipping root inside dialog/menu/listbox');
            continue;
        }
        const segments = extractSegmentsFromNode(root);
        if (segments.length) {
            console.debug('[meet-ext] extracted %d segments from root', segments.length, segments.map(s => s.text.substring(0, 40)));
        }
        for (const segment of segments) {
            emitSegment(segment);
        }
        segmentsThisScan += segments.length;
    }

    // Update visible badge
    if (captureEnabled) {
        if (!captureSessionOk) {
            updateCaptureBadge('no-session', 'Sem sessão ativa');
        } else if (totalSegmentsEmitted > 0) {
            updateCaptureBadge('capturing', `Capturando — ${totalSegmentsEmitted} segmentos`);
        } else if (roots.length > 0) {
            updateCaptureBadge('searching', `Tier: ${rootsInfo.tier} — aguardando fala`);
        } else {
            updateCaptureBadge('searching', 'Buscando legendas...');
        }
    }
}

function isExtensionUiNode(node) {
    if (!(node instanceof Element)) {
        return false;
    }
    if (node.id?.startsWith('__meet_')) {
        return true;
    }
    return Boolean(node.closest?.('[id^="__meet_"]'));
}

function isExtensionUiMutation(mutation) {
    if (isExtensionUiNode(mutation.target)) {
        return true;
    }

    if (mutation.addedNodes?.length) {
        for (const node of mutation.addedNodes) {
            if (isExtensionUiNode(node)) {
                return true;
            }
        }
    }

    return false;
}

function startObserver() {
    if (observer) {
        observer.disconnect();
    }

    observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (isExtensionUiMutation(mutation)) {
                continue;
            }
            if (!mutation.addedNodes?.length && mutation.type !== 'characterData') {
                continue;
            }
            scanAndEmit();
            break;
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true
    });
}

function stopObserver() {
    observer?.disconnect();
    observer = null;
}

function startPeriodicScan() {
    clearInterval(periodicScanTimer);
    periodicScanStartedAt = Date.now();
    // Start with fast scans (500ms) for the first 30 seconds, then slow down to 2s
    periodicScanTimer = setInterval(() => {
        if (!captureEnabled) return;
        scanAndEmit();
        // Switch to slower interval after 30 seconds
        const elapsed = Date.now() - periodicScanStartedAt;
        if (elapsed > 30000 && periodicScanTimer) {
            clearInterval(periodicScanTimer);
            periodicScanTimer = setInterval(() => {
                if (captureEnabled) scanAndEmit();
            }, 2000);
        }
    }, 500);
}

function stopPeriodicScan() {
    clearInterval(periodicScanTimer);
    periodicScanTimer = null;
}

function startHeartbeat() {
    if (!captureEnabled) {
        return;
    }

    clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
        chrome.runtime
            .sendMessage({
                type: 'MEET_CAPTION_HEARTBEAT',
                payload: {
                    timestampMs: Date.now(),
                    location: window.location.href
                }
            })
            .catch(() => {
                // Ignora durante reinício do worker.
            });
    }, 15000);
}

function stopHeartbeat() {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
}

function startEnsureCaptions() {
    captionsToggleAttempts = 0;
    languageConfigAttempts = 0;
    clearInterval(captionsEnsureTimer);
    captionsEnsureTimer = setInterval(() => {
        emitPageContext(false);
    }, 8000);
}

function stopEnsureCaptions() {
    clearInterval(captionsEnsureTimer);
    captionsEnsureTimer = null;
    captionsToggleAttempts = 0;
    languageConfigAttempts = 0;
}

function startPassiveCcAutoEnable() {
    clearInterval(passiveCcTimer);
    passiveCcTimer = setInterval(() => {
        ensureCaptionsEnabledPassive();
        trySelectPortugueseLanguagePassive();
    }, 10000);

    // First attempt shortly after page settles.
    setTimeout(() => {
        ensureCaptionsEnabledPassive();
        trySelectPortugueseLanguagePassive();
    }, 1200);
}

// ── Capture status badge (visible indicator on Meet page) ──────────────
function updateCaptureBadge(status, detail) {
    const BADGE_ID = '__meet_capture_badge';
    let badge = document.getElementById(BADGE_ID);

    if (!captureEnabled) {
        if (badge) badge.remove();
        return;
    }

    if (!badge) {
        badge = document.createElement('div');
        badge.id = BADGE_ID;
        badge.style.cssText = [
            'position:fixed', 'top:10px', 'right:10px', 'z-index:2147483647',
            'padding:6px 12px', 'border-radius:8px', 'font-size:12px',
            'font-family:Inter,sans-serif', 'color:#fff', 'pointer-events:none',
            'transition:background 0.3s', 'box-shadow:0 2px 8px rgba(0,0,0,0.3)',
            'display:flex', 'align-items:center', 'gap:6px',
        ].join(';');
        document.body.appendChild(badge);
    }

    const colors = {
        capturing: 'rgba(34,139,34,0.9)',
        searching: 'rgba(200,150,0,0.85)',
        'no-session': 'rgba(180,40,40,0.9)',
        error: 'rgba(180,40,40,0.9)',
    };
    badge.style.background = colors[status] || colors.searching;
    const icons = { capturing: '🟢', searching: '🟡', 'no-session': '🔴', error: '🔴' };
    badge.textContent = `${icons[status] || '⚪'} ${detail || status}`;
}

function removeCaptureBadge() {
    const badge = document.getElementById('__meet_capture_badge');
    if (badge) badge.remove();
}

function isCcLikelyEnabledNow() {
    const rootsInfo = findCaptionRootsWithTier();
    const rootsCount = rootsInfo?.roots?.length || 0;
    const captionsLikelyEnabled = Boolean(
        isCaptionsLikelyEnabled(findCaptionsToggleButton()) || rootsCount
    );

    return captionsLikelyEnabled;
}

function showCcRequiredReminder() {
    const rootId = '__meet_cc_required_toast';
    const existing = document.getElementById(rootId);
    if (existing) {
        existing.hidden = false;
        // Auto-dismiss after 6 seconds
        clearTimeout(existing.__autoDismiss);
        existing.__autoDismiss = setTimeout(() => { existing.hidden = true; }, 6000);
        return;
    }

    const toast = document.createElement('div');
    toast.id = rootId;
    toast.style.position = 'fixed';
    toast.style.bottom = '90px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%)';
    toast.style.zIndex = '2147483647';
    toast.style.width = 'min(420px, calc(100vw - 28px))';
    toast.style.borderRadius = '12px';
    toast.style.border = '1px solid rgba(255,255,255,0.15)';
    toast.style.background = 'rgba(31, 30, 29, 0.95)';
    toast.style.color = '#f3f2ef';
    toast.style.boxShadow = '0 8px 24px rgba(0,0,0,0.3)';
    toast.style.padding = '12px 16px';
    toast.style.fontFamily = 'Inter, sans-serif';
    toast.style.display = 'flex';
    toast.style.alignItems = 'center';
    toast.style.gap = '10px';
    toast.style.pointerEvents = 'auto';
    toast.style.transition = 'opacity 0.3s ease';

    const ccOn = isCcLikelyEnabledNow();
    const statusColor = ccOn ? '#82d5a2' : '#f28f8f';

    const dot = document.createElement('span');
    dot.style.width = '8px';
    dot.style.height = '8px';
    dot.style.borderRadius = '50%';
    dot.style.background = statusColor;
    dot.style.flexShrink = '0';

    const msg = document.createElement('span');
    msg.style.fontSize = '13px';
    msg.style.lineHeight = '1.4';
    msg.style.flex = '1';
    msg.textContent = ccOn
        ? 'Legendas (CC) detectadas — transcrição ativa.'
        : 'Ative as legendas (CC) no Meet para transcrever a reunião.';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = '✕';
    closeBtn.style.border = 'none';
    closeBtn.style.background = 'transparent';
    closeBtn.style.color = '#999';
    closeBtn.style.fontSize = '14px';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.padding = '2px 4px';
    closeBtn.style.flexShrink = '0';
    closeBtn.addEventListener('click', () => {
        toast.hidden = true;
    });

    toast.appendChild(dot);
    toast.appendChild(msg);
    toast.appendChild(closeBtn);
    document.body.appendChild(toast);

    // Auto-dismiss after 6 seconds
    toast.__autoDismiss = setTimeout(() => { toast.hidden = true; }, 6000);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'START_CAPTION_CAPTURE') {
        captureEnabled = true;
        captureSessionOk = true;
        captionLanguageConfigured = false;
        totalSegmentsEmitted = 0;
        console.info('[meet-ext] START_CAPTION_CAPTURE received — capture enabled');
        updateCaptureBadge('searching', 'Iniciando captura...');
        startEnsureCaptions();
        scanAndEmit();
        startContextSync();
        startObserver();
        startHeartbeat();
        startPeriodicScan();
    }

    if (message?.type === 'STOP_CAPTION_CAPTURE') {
        captureEnabled = false;
        captionLanguageConfigured = false;
        stopEnsureCaptions();
        stopContextSync();
        stopObserver();
        stopHeartbeat();
        stopPeriodicScan();
        removeCaptureBadge();
    }

    if (message?.type === 'MEET_GET_CC_STATUS') {
        sendResponse?.({
            ok: true,
            captionsEnabledLikely: isCcLikelyEnabledNow()
        });
        return true;
    }

    if (message?.type === 'MEET_SHOW_CC_REQUIRED_REMINDER') {
        showCcRequiredReminder();
        sendResponse?.({ ok: true });
        return;
    }
});

startPassiveCcAutoEnable();
