(() => {
  const seen = new Set();
  const MAX_SEEN = 300;
  let extensionAlive = true;
  let scanTimer = null;
  let observer = null;

  function cleanup() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (scanTimer) {
      clearInterval(scanTimer);
      scanTimer = null;
    }
  }

  function markExtensionInvalidated() {
    extensionAlive = false;
    cleanup();
  }

  function safeSendMessage(payload) {
    if (!extensionAlive || !chrome?.runtime?.id) return false;
    try {
      chrome.runtime.sendMessage(payload, () => {
        const err = chrome.runtime?.lastError;
        if (!err) return;
        if (/Extension context invalidated|message port closed|receiving end does not exist/i.test(err.message || '')) {
          markExtensionInvalidated();
        }
      });
      return true;
    } catch (e) {
      const msg = String(e?.message || e || '');
      if (/Extension context invalidated|message port closed|receiving end does not exist/i.test(msg)) {
        markExtensionInvalidated();
      }
      return false;
    }
  }

  function pushCaption(text) {
    if (!extensionAlive) return;
    const clean = String(text || '').trim();
    if (!clean || clean.length < 2) return;
    const key = clean.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    if (seen.size > MAX_SEEN) {
      const first = seen.values().next().value;
      if (first) seen.delete(first);
    }
    safeSendMessage({
      type: 'MEET_CAPTION_PARTIAL',
      text: clean,
      ts: Date.now(),
    });
  }

  function scanCaptions() {
    // Meet muda classes com frequência; usamos seletor amplo por aria-live.
    const nodes = document.querySelectorAll('[aria-live="polite"], [aria-live="assertive"]');
    nodes.forEach((n) => {
      const txt = n.textContent;
      if (txt && txt.trim().length > 0) pushCaption(txt);
    });
  }

  observer = new MutationObserver(() => scanCaptions());
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  scanTimer = setInterval(scanCaptions, 1000);
  window.addEventListener('pagehide', cleanup, { once: true });
  window.addEventListener('beforeunload', cleanup, { once: true });
})();
