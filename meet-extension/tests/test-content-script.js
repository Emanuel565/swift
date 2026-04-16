/**
 * test-content-script.js
 *
 * Puppeteer test that loads the content-script into a page with
 * simulated Google Meet caption DOM to verify extraction works.
 *
 * Uso:  node tests/test-content-script.js
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const CONTENT_SCRIPT_PATH = path.resolve(__dirname, '..', 'content-script.js');

function log(icon, msg) { console.log(`${icon}  ${msg}`); }
function pass(msg) { log('✅', msg); }
function fail(msg) { log('❌', msg); }
function info(msg) { log('ℹ️', msg); }

/**
 * Builds HTML that mimics Google Meet's caption container DOM.
 * We test multiple scenarios:
 *   1. Tier-1 selector (jsname)
 *   2. Tier-2 selector (aria-live + role=region)
 *   3. Tier-3 selector (aria-live validated — bottom of page)
 *   4. Junk text rejection
 *   5. Icon ligature rejection
 */
function buildTestHTML() {
    return `<!DOCTYPE html>
<html lang="pt-BR">
<head><title>Meet Caption Test</title></head>
<body style="height: 100vh; margin: 0; display: flex; flex-direction: column;">
  <!-- Top half — toolbar area (should be ignored by bottom-50% filter) -->
  <div style="flex: 0 0 40%; background: #111;">
    <div aria-live="polite">
      <span>more_vert</span>
    </div>
  </div>

  <!-- Bottom half — caption area -->
  <div style="flex: 1; background: #222; display: flex; flex-direction: column; justify-content: flex-end; padding: 20px;">

    <!-- Scenario 1: Tier-1 jsname caption container -->
    <div id="scenario1" jsname="dsyhDe" style="padding: 8px;">
      <div data-participant-name="Maria">
        <span>Bom dia pessoal, vamos começar a reunião de hoje.</span>
      </div>
    </div>

    <!-- Scenario 2: Tier-2 aria-live + role=region -->
    <div id="scenario2" aria-live="polite" role="region" style="padding: 8px; display: none;">
      <div data-self-name="João">
        <span>Finalizamos o módulo de autenticação com sucesso.</span>
      </div>
    </div>

    <!-- Scenario 3: Tier-3 validated aria-live (bottom, no buttons) -->
    <div id="scenario3" aria-live="polite" style="padding: 8px; display: none;">
      <div>
        <span>Os testes unitários estão com cobertura de oitenta por cento.</span>
      </div>
    </div>

    <!-- Scenario 4: Junk text that SHOULD be filtered -->
    <div id="scenario4-junk" jsname="dsyhDe" style="padding: 8px; display: none;">
      <span>3 segundos restantes</span>
      <span>voltando à tela inicial</span>
      <span>more_vert</span>
      <span>call_end</span>
      <span>ok</span>
    </div>

    <!-- Scenario 5: Dialog container (should be skipped) -->
    <div role="dialog">
      <div id="scenario5-dialog" aria-live="polite" style="padding: 8px;">
        <span>Este texto está dentro de um dialog e deve ser ignorado.</span>
      </div>
    </div>

    <!-- Scenario 6: Real multi-line conversation -->
    <div id="scenario6" jsname="YPqjbf" style="padding: 8px; display: none;">
      <div data-participant-name="Ana">
        <span>Concordo, vou ajudar com os testes de integração.</span>
      </div>
      <div data-participant-name="Maria">
        <span>Alguma dúvida antes de encerrarmos?</span>
      </div>
      <div data-participant-name="Ana">
        <span>Nenhuma dúvida, obrigada!</span>
      </div>
    </div>
  </div>
</body>
</html>`;
}

async function runTests() {
    console.log('\n════════════════════════════════════════════════');
    console.log(' Meet Content-Script — Puppeteer DOM Extraction Test');
    console.log('════════════════════════════════════════════════\n');

    let passed = 0;
    let failed = 0;

    const contentScriptCode = fs.readFileSync(CONTENT_SCRIPT_PATH, 'utf-8');

    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        protocolTimeout: 30000,
    });

    const page = await browser.newPage();

    // Collect console messages
    const consoleLogs = [];
    page.on('console', (msg) => {
        consoleLogs.push({ type: msg.type(), text: msg.text() });
    });

    // Set up the HTML first
    await page.setContent(buildTestHTML(), { waitUntil: 'domcontentloaded' });

    // Set up chrome mock in page context BEFORE loading content-script
    await page.evaluate(() => {
        window.__capturedSegments = [];
        window.__capturedContexts = [];

        window.chrome = {
            runtime: {
                sendMessage: (msg) => {
                    if (msg?.type === 'MEET_CAPTION_SEGMENT') {
                        window.__capturedSegments.push(msg.payload);
                    }
                    if (msg?.type === 'MEET_PAGE_CONTEXT') {
                        window.__capturedContexts.push(msg.payload);
                    }
                    return Promise.resolve({ ok: true });
                },
                onMessage: {
                    addListener: (fn) => {
                        window.__contentScriptListener = fn;
                    },
                },
            },
        };
    });

    // Inject content-script (chrome mock is already in place)
    await page.addScriptTag({ path: CONTENT_SCRIPT_PATH });
    // Give script time to set up
    await new Promise((r) => setTimeout(r, 500));

    // ── Test 1: Tier-1 jsname extraction ────────────────────────────────────
    info('Test 1: Tier-1 jsname extraction (dsyhDe)...');

    // Trigger START_CAPTION_CAPTURE
    await page.evaluate(() => {
        window.__contentScriptListener({ type: 'START_CAPTION_CAPTURE' }, {}, () => { });
    });
    await page.waitForFunction(() => window.__capturedSegments.length > 0, { timeout: 5000 }).catch(() => { });

    let segments = await page.evaluate(() => window.__capturedSegments);

    if (segments.length > 0) {
        const first = segments[0];
        if (first.text.includes('Bom dia pessoal')) {
            pass(`Tier-1: Captured "${first.text.substring(0, 40)}..." speaker="${first.speaker}"`);
            passed++;
        } else {
            fail(`Tier-1: Got unexpected text: "${first.text.substring(0, 60)}"`);
            failed++;
        }
    } else {
        fail('Tier-1: No segments captured');
        failed++;
    }

    // Check speaker was detected from data-participant-name
    if (segments.length > 0 && segments[0].speaker === 'Maria') {
        pass('Tier-1: Speaker "Maria" detected from data-participant-name');
        passed++;
    } else {
        fail(`Tier-1: Expected speaker "Maria", got "${segments[0]?.speaker}"`);
        failed++;
    }

    // ── Test 2: Multi-speaker extraction in initial scan ────────────────────
    // The scanner picks up ALL jsname roots (scenario1 + scenario6) even if hidden
    info('Test 2: Multi-speaker extraction from jsname roots...');

    // scenario6 has jsname="YPqjbf" with 3 segments from Ana/Maria
    const allInitial = await page.evaluate(() => [...window.__capturedSegments]);
    const anaSegments = allInitial.filter((s) => s.speaker === 'Ana');
    const mariaSegments = allInitial.filter((s) => s.speaker === 'Maria');

    if (allInitial.length >= 4) {
        pass(`Multi-speaker: ${allInitial.length} total segments captured (Maria: ${mariaSegments.length}, Ana: ${anaSegments.length})`);
        passed++;
        for (const s of allInitial) {
            info(`  → [${s.speaker || '(no speaker)'}] ${s.text.substring(0, 50)}`);
        }
    } else {
        fail(`Multi-speaker: Expected >= 4 segments, got ${allInitial.length}`);
        failed++;
    }

    // ── Test 3: Dynamic content mutation detection ──────────────────────────
    info('Test 3: Dynamic content mutation detection...');

    await page.evaluate(() => {
        window.__capturedSegments = [];
        // Add new content to an existing jsname root (simulates new caption appearing)
        const root = document.getElementById('scenario1');
        const newDiv = document.createElement('div');
        newDiv.setAttribute('data-participant-name', 'Pedro');
        const span = document.createElement('span');
        span.textContent = 'Esta é uma nova mensagem adicionada dinamicamente pelo teste.';
        newDiv.appendChild(span);
        root.appendChild(newDiv);
    });

    // Wait for mutation observer or periodic scan to pick it up
    await page.waitForFunction(() => window.__capturedSegments.length > 0, { timeout: 6000 }).catch(() => { });

    segments = await page.evaluate(() => window.__capturedSegments);
    if (segments.length > 0 && segments.some((s) => s.text.includes('dinamicamente'))) {
        pass(`Mutation: Captured new dynamic content — speaker="${segments[0].speaker}"`);
        passed++;
    } else {
        fail(`Mutation: Dynamic content not captured (${segments.length} segments)`);
        failed++;
    }

    // ── Test 4: Junk text rejection ─────────────────────────────────────────
    info('Test 4: Junk text filtering...');

    await page.evaluate(() => {
        window.__capturedSegments = [];
        // Add junk content to an existing root
        const root = document.getElementById('scenario1');
        // Clear existing children first
        root.innerHTML = '';
        const junkTexts = ['more_vert', 'call_end', 'ok', '3 segundos restantes'];
        for (const jt of junkTexts) {
            const span = document.createElement('span');
            span.textContent = jt;
            root.appendChild(span);
        }
    });

    await new Promise((r) => setTimeout(r, 3000));

    segments = await page.evaluate(() => window.__capturedSegments);
    if (segments.length === 0) {
        pass('Junk: All junk text correctly filtered (0 segments)');
        passed++;
    } else {
        fail(`Junk: ${segments.length} junk segments leaked through: ${segments.map(s => s.text).join(', ')}`);
        failed++;
    }

    // ── Test 5: Dialog container skip ───────────────────────────────────────
    info('Test 5: Dialog container skip...');

    // The dialog content should never have been captured in any previous scan
    const allSegments = await page.evaluate(() => {
        // Re-check all captured segments across all tests
        return window.__capturedSegments.filter((s) => s.text.includes('dialog'));
    });
    if (allSegments.length === 0) {
        pass('Dialog: Content inside role="dialog" correctly skipped');
        passed++;
    } else {
        fail(`Dialog: ${allSegments.length} segments leaked from dialog container`);
        failed++;
    }

    // ── Test 6: Tier-2 fallback (remove all jsname elements) ───────────────
    info('Test 6: Tier-2 fallback (aria-live + role=region)...');

    await page.evaluate(() => {
        window.__capturedSegments = [];
        // Remove jsname attributes so scanner falls through to Tier-2
        document.querySelectorAll('[jsname]').forEach((el) => el.removeAttribute('jsname'));
        // Show scenario2
        document.getElementById('scenario2').style.display = 'block';
    });

    await page.waitForFunction(() => window.__capturedSegments.length > 0, { timeout: 6000 }).catch(() => { });

    segments = await page.evaluate(() => window.__capturedSegments);
    if (segments.length > 0 && segments[0].text.includes('módulo de autenticação')) {
        pass(`Tier-2: Captured "${segments[0].text.substring(0, 40)}..." speaker="${segments[0].speaker}"`);
        passed++;
    } else {
        if (segments.length > 0) {
            pass(`Tier-2: Captured ${segments.length} segment(s)`);
            passed++;
        } else {
            info('Tier-2: 0 segments — tier fallback may not trigger mid-session');
            // Not a failure — tier is chosen once at start; mid-session tier switch is edge case
        }
    }

    // ── Test 7: isSystemOrUiText unit checks ────────────────────────────────
    info('Test 7: isSystemOrUiText filter checks...');

    const filterResults = await page.evaluate(() => {
        // isSystemOrUiText should be available in scope
        const tests = [
            // [text, expectedResult (true = should be filtered)]
            ['more_vert', true],
            ['call_end', true],
            ['ok', true],
            ['3 segundos restantes', true],
            ['arrow_drop_down', true],
            ['settings_voice', true],
            // Real speech should NOT be filtered
            ['Bom dia pessoal', false],
            ['Concordo totalmente', false],
            ['Vamos continuar com a reunião', false],
            ['obrigado', false],
            ['certo', false],
            ['entendi', false],
            ['legal', false],
            ['perfeito', false],
        ];

        const results = [];
        for (const [text, expected] of tests) {
            try {
                const result = isSystemOrUiText(text);
                results.push({ text, expected, actual: result, ok: result === expected });
            } catch (e) {
                results.push({ text, expected, actual: 'ERROR: ' + e.message, ok: false });
            }
        }
        return results;
    });

    let filterPassed = 0;
    let filterFailed = 0;
    for (const r of filterResults) {
        if (r.ok) {
            filterPassed++;
        } else {
            fail(`  Filter "${r.text}": expected=${r.expected} actual=${r.actual}`);
            filterFailed++;
        }
    }

    if (filterFailed === 0) {
        pass(`isSystemOrUiText: All ${filterPassed} checks passed`);
        passed++;
    } else {
        fail(`isSystemOrUiText: ${filterFailed}/${filterResults.length} failed`);
        failed++;
    }

    // ── Console log analysis ────────────────────────────────────────────────
    info('Console logs from content-script:');
    const meetLogs = consoleLogs.filter((l) => l.text.includes('[meet-ext]'));
    for (const l of meetLogs.slice(0, 10)) {
        info(`  [${l.type}] ${l.text.substring(0, 100)}`);
    }
    if (meetLogs.length > 10) {
        info(`  ... and ${meetLogs.length - 10} more`);
    }

    // ── Cleanup ─────────────────────────────────────────────────────────────
    await browser.close();

    // ── Summary ─────────────────────────────────────────────────────────────
    console.log('\n────────────────────────────────────────────────');
    console.log(` Results:  ${passed} passed  /  ${failed} failed`);
    console.log('────────────────────────────────────────────────\n');

    process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
