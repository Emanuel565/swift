'use strict';

/**
 * Recompila better-sqlite3 para a ABI do Node atual.
 * Falhas (ex.: .node bloqueado no Windows) não quebram `npm install`.
 */
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const strict = process.argv.includes('--strict');

/**
 * Testa se better-sqlite3 está realmente funcional para este Node.
 * `require` sozinho não basta: o bindings carrega o .node lazily
 * apenas quando new Database() é chamado. Por isso testamos com :memory:.
 */
function canLoadBetterSqlite() {
    try {
        // Limpa cache para garantir que não usa uma cópia anterior já carregada.
        const resolvedPath = require.resolve('better-sqlite3');
        delete require.cache[resolvedPath];

        const Db = require('better-sqlite3');
        const test = new Db(':memory:');
        test.close();
        return true;
    } catch {
        return false;
    }
}

/**
 * Tenta remover o .node antigo antes de rebuildar, para evitar EBUSY/EPERM
 * no Windows quando outro processo o liberou mas o handle ainda está pendente.
 */
function removeOldNodeBinary() {
    const binaryPath = path.join(
        root,
        'node_modules',
        'better-sqlite3',
        'build',
        'Release',
        'better_sqlite3.node',
    );
    try {
        if (fs.existsSync(binaryPath)) {
            fs.unlinkSync(binaryPath);
        }
    } catch (_) {
        // Arquivo pode estar locked; rebuild vai tentar mesmo assim.
    }
}

// Em dev/start (`--strict`), só pula o rebuild se o módulo realmente funciona.
if (strict && canLoadBetterSqlite()) {
    console.log('[valorantapi] better-sqlite3 OK para este Node; rebuild não é necessário.');
    process.exit(0);
}

removeOldNodeBinary();

const r = spawnSync(npm, ['rebuild', 'better-sqlite3'], {
    stdio: 'inherit',
    shell: true,
    cwd: root,
});

if (r.status !== 0) {
    if (strict && canLoadBetterSqlite()) {
        console.warn(
            '[valorantapi] better-sqlite3: rebuild retornou erro, mas o módulo está funcional neste Node. Seguindo startup.',
        );
    } else {
        const msg =
            '[valorantapi] better-sqlite3: rebuild falhou (feche processos Node que estejam usando SQLite e rode: npm run rebuild:native)';
        if (strict) {
            console.error(msg);
            process.exit(r.status || 1);
        }
        console.warn(msg);
    }
}

if (strict) {
    if (!canLoadBetterSqlite()) {
        console.error(
            `[valorantapi] better-sqlite3 ainda indisponível para Node v${process.versions.node}. ` +
            'Execute manualmente: npm run rebuild:native',
        );
        process.exit(1);
    }
    console.log('[valorantapi] better-sqlite3 rebuilt successfully.');
}
