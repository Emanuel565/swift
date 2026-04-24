const path = require('path');
const { spawnSync } = require('child_process');

function isAbiMismatch(err) {
    return (
        err?.code === 'ERR_DLOPEN_FAILED' &&
        String(err.message).includes('NODE_MODULE_VERSION')
    );
}

/**
 * Roda o script de rebuild em processo filho síncrono.
 * Retorna true se o rebuild terminou com exit 0.
 */
function doRebuild() {
    const script = path.join(__dirname, '..', 'scripts', 'rebuild-sqlite.cjs');
    console.warn('[valorantapi] Detectado ABI mismatch no better-sqlite3. Executando auto-rebuild...');
    const result = spawnSync(process.execPath, [script], {
        stdio: 'inherit',
        cwd: path.join(__dirname, '..'),
    });
    return result.status === 0;
}

/**
 * Carrega e instancia o módulo better-sqlite3.
 * Se o .node binário estiver compilado para outra ABI (ERR_DLOPEN_FAILED),
 * tenta rebuild automático e recarrega o módulo.
 */
function loadDatabase(dbPath) {
    // Limpa cache para garantir recarregamento após eventual rebuild.
    function freshRequire() {
        const resolved = require.resolve('better-sqlite3');
        delete require.cache[resolved];
        return require('better-sqlite3');
    }

    let Db;
    try {
        Db = freshRequire();
    } catch (e) {
        if (!isAbiMismatch(e)) throw e;
        if (!doRebuild()) throw e;
        Db = freshRequire();
    }

    // O bindings do better-sqlite3 só carrega o .node na instanciação, não no require.
    // Por isso testamos abrindo o banco real; se ainda der ABI mismatch, rebuilda de novo.
    try {
        return new Db(dbPath);
    } catch (e) {
        if (!isAbiMismatch(e)) {
            console.error(`[valorantapi] Falha ao abrir banco SQLite em ${dbPath}.`);
            console.error('[valorantapi] Em Windows, feche outros processos Node e tente `npm run rebuild:native`.');
            if (e.message) console.error(`[valorantapi] detalhe: ${e.message}`);
            throw e;
        }
        // Segunda chance: rebuild e tenta mais uma vez.
        if (!doRebuild()) throw e;
        Db = freshRequire();
        return new Db(dbPath);
    }
}

const DB_PATH = path.join(__dirname, '..', 'radiante.db');
const db = loadDatabase(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    email       TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password    TEXT NOT NULL,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch())
  );
`);

module.exports = db;
