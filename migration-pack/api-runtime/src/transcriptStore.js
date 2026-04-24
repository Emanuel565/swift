'use strict';

const { randomUUID } = require('crypto');
const db = require('./db');

function safeAlterAddColumn(sql) {
    const normalized = String(sql || '').toLowerCase();
    const hasDynamicDefault =
        normalized.includes(' default (unixepoch(') ||
        normalized.includes(' default (datetime(') ||
        normalized.includes(' default (strftime(') ||
        normalized.includes(' default (random(');
    if (hasDynamicDefault) {
        throw new Error('Migração insegura: ALTER TABLE ADD COLUMN com default dinâmico.');
    }
    db.exec(sql);
}

// ─── recordings: migração para multi-track ───────────────────────────────────
// Detecta o estado atual e recria a tabela com group_id/track se necessário.

db.exec(`
  CREATE TABLE IF NOT EXISTS recordings (
    id            TEXT PRIMARY KEY,
    session_id    TEXT NOT NULL UNIQUE,
    user_id       TEXT,
    source_type   TEXT NOT NULL DEFAULT 'tab',
    source_app    TEXT NOT NULL DEFAULT 'other',
    source_url    TEXT,
    source_host   TEXT,
    tab_title     TEXT,
    mime_type     TEXT NOT NULL,
    duration_ms   INTEGER,
    audio_blob    BLOB NOT NULL,
    created_at    INTEGER NOT NULL DEFAULT (unixepoch())
  );
`);

const recCols = db.prepare('PRAGMA table_info(recordings)').all();
const recColNames = new Set(recCols.map((c) => c.name));

if (!recColNames.has('source_type')) {
    safeAlterAddColumn(`ALTER TABLE recordings ADD COLUMN source_type TEXT NOT NULL DEFAULT 'tab'`);
}
if (!recColNames.has('audio_deleted_at')) {
    safeAlterAddColumn(`ALTER TABLE recordings ADD COLUMN audio_deleted_at INTEGER`);
}

// Migração para multi-track: adiciona group_id e track se ainda não existirem.
// Usa ADD COLUMN com DEFAULT para não violar dados existentes.
if (!recColNames.has('group_id')) {
    // Adiciona com DEFAULT = id (cada row vira seu próprio grupo)
    db.exec(`ALTER TABLE recordings ADD COLUMN group_id TEXT`);
    db.exec(`UPDATE recordings SET group_id = id WHERE group_id IS NULL`);
}
if (!recColNames.has('track')) {
    db.exec(`ALTER TABLE recordings ADD COLUMN track TEXT NOT NULL DEFAULT 'mix'`);
}

// ─── recording_groups ────────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS recording_groups (
    id          TEXT PRIMARY KEY,
    session_id  TEXT NOT NULL UNIQUE,
    user_id     TEXT,
    source_type TEXT NOT NULL DEFAULT 'tab',
    source_app  TEXT NOT NULL DEFAULT 'other',
    source_url  TEXT,
    source_host TEXT,
    tab_title   TEXT,
    mime_type   TEXT NOT NULL DEFAULT 'audio/webm;codecs=opus',
    duration_ms INTEGER,
    created_at  INTEGER NOT NULL DEFAULT (unixepoch())
  );
`);

// Backfill: cada recording antigo vira seu próprio grupo
db.exec(`
  INSERT OR IGNORE INTO recording_groups (
    id, session_id, user_id, source_type, source_app, source_url,
    source_host, tab_title, mime_type, duration_ms, created_at
  )
  SELECT
    r.group_id, r.session_id, r.user_id, r.source_type, r.source_app,
    r.source_url, r.source_host, r.tab_title, r.mime_type, r.duration_ms, r.created_at
  FROM recordings r
  WHERE r.group_id IS NOT NULL;
`);

// ─── Índices ─────────────────────────────────────────────────────────────────
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_recordings_group ON recordings(group_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_recordings_group_track ON recordings(group_id, track);
  CREATE INDEX IF NOT EXISTS idx_recordings_created ON recordings(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_recordings_session ON recordings(session_id);
  CREATE INDEX IF NOT EXISTS idx_groups_created ON recording_groups(created_at DESC);
`);

// ─── transcripts ─────────────────────────────────────────────────────────────
const transcriptCols = db.prepare('PRAGMA table_info(transcripts)').all();
if (transcriptCols.length === 0) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS transcripts (
        id              TEXT PRIMARY KEY,
        recording_id    TEXT NOT NULL UNIQUE,
        text            TEXT NOT NULL,
        status          TEXT NOT NULL DEFAULT 'done',
        created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
        updated_at      INTEGER NOT NULL DEFAULT (unixepoch()),
        FOREIGN KEY (recording_id) REFERENCES recordings(id) ON DELETE CASCADE
      );
    `);
} else {
    const colNames = new Set(transcriptCols.map((c) => c.name));
    if (!colNames.has('recording_id')) safeAlterAddColumn(`ALTER TABLE transcripts ADD COLUMN recording_id TEXT`);
    if (!colNames.has('status')) safeAlterAddColumn(`ALTER TABLE transcripts ADD COLUMN status TEXT NOT NULL DEFAULT 'done'`);
    if (!colNames.has('updated_at')) {
        safeAlterAddColumn(`ALTER TABLE transcripts ADD COLUMN updated_at INTEGER`);
        db.exec(`UPDATE transcripts SET updated_at = created_at WHERE updated_at IS NULL`);
    }
}
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_transcripts_recording ON transcripts(recording_id);
  CREATE INDEX IF NOT EXISTS idx_transcripts_created ON transcripts(created_at DESC);
`);

// ─── Helpers ─────────────────────────────────────────────────────────────────
function mapSourceApp(host, sourceType) {
    if (sourceType === 'meet') return 'meet';
    if (sourceType === 'desktop') return 'desktop';
    const h = String(host || '').toLowerCase();
    if (h.includes('meet.google.com')) return 'meet';
    if (h.includes('teams.microsoft.com')) return 'teams';
    if (h.includes('discord.com')) return 'discord';
    if (h.includes('zoom.us')) return 'zoom';
    return 'other';
}

const VALID_TRACKS = new Set(['mic', 'tab', 'mix']);
function normalizeTrack(t) {
    const v = String(t || 'mix').toLowerCase();
    return VALID_TRACKS.has(v) ? v : 'mix';
}

function trackOut(row) {
    if (!row) return null;
    return {
        id: row.id,
        track: row.track,
        mimeType: row.mime_type,
        durationMs: row.duration_ms,
        audioDeleted: row.audio_deleted_at != null,
        audioDeletedAt: row.audio_deleted_at != null ? row.audio_deleted_at * 1000 : null,
        createdAt: row.created_at * 1000,
        transcript: row.transcript_id
            ? {
                id: row.transcript_id,
                text: row.transcript_text,
                status: row.transcript_status || 'done',
                createdAt: row.transcript_created_at * 1000,
                updatedAt: row.transcript_updated_at * 1000,
            }
            : null,
    };
}

function groupOut(groupRow, trackRows) {
    if (!groupRow) return null;
    const tracks = trackRows.map(trackOut);
    const preferredOrder = ['mix', 'tab', 'mic'];
    const preferredTranscript = preferredOrder
        .map((t) => tracks.find((tr) => tr.track === t && tr.transcript))
        .find(Boolean)?.transcript || null;
    return {
        id: groupRow.id,
        sessionId: groupRow.session_id,
        userId: groupRow.user_id,
        sourceApp: groupRow.source_app,
        sourceType: groupRow.source_type || 'tab',
        sourceUrl: groupRow.source_url,
        sourceHost: groupRow.source_host,
        tabTitle: groupRow.tab_title,
        mimeType: groupRow.mime_type,
        durationMs: groupRow.duration_ms,
        createdAt: groupRow.created_at * 1000,
        tracks,
        transcript: preferredTranscript,
    };
}

const trackQuery = `
  SELECT
    r.id, r.track, r.mime_type, r.duration_ms, r.audio_deleted_at, r.created_at,
    t.id AS transcript_id, t.text AS transcript_text, t.status AS transcript_status,
    t.created_at AS transcript_created_at, t.updated_at AS transcript_updated_at
  FROM recordings r
  LEFT JOIN transcripts t ON t.recording_id = r.id
  WHERE r.group_id = ?
  ORDER BY CASE r.track WHEN 'mix' THEN 0 WHEN 'tab' THEN 1 WHEN 'mic' THEN 2 ELSE 3 END
`;

function fetchTracks(groupId) {
    return db.prepare(trackQuery).all(groupId);
}

// ─── Grupos ──────────────────────────────────────────────────────────────────
function ensureRecordingGroup({ sessionId, userId, sourceType, sourceUrl, sourceHost, tabTitle, mimeType, durationMs }) {
    const existing = db.prepare('SELECT id FROM recording_groups WHERE session_id = ?').get(sessionId);
    if (existing) {
        if (durationMs != null) {
            db.prepare('UPDATE recording_groups SET duration_ms = ? WHERE id = ?').run(durationMs, existing.id);
        }
        return existing.id;
    }
    const id = randomUUID();
    db.prepare(`
        INSERT INTO recording_groups (id, session_id, user_id, source_type, source_app, source_url, source_host, tab_title, mime_type, duration_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, sessionId, userId ?? null, sourceType || 'tab', mapSourceApp(sourceHost, sourceType),
        sourceUrl ?? null, sourceHost ?? null, tabTitle ?? null, mimeType || 'audio/webm;codecs=opus', durationMs ?? null);
    return id;
}

function createRecordingTrack({ sessionId, userId, track, sourceType, sourceUrl, sourceHost, tabTitle, mimeType, durationMs, audioBlob }) {
    const normalizedTrack = normalizeTrack(track);
    const groupId = ensureRecordingGroup({ sessionId, userId, sourceType, sourceUrl, sourceHost, tabTitle, mimeType, durationMs });

    const existing = db.prepare('SELECT id FROM recordings WHERE group_id = ? AND track = ?').get(groupId, normalizedTrack);
    if (existing) {
        db.prepare(`UPDATE recordings SET audio_blob = ?, mime_type = ?, duration_ms = COALESCE(?, duration_ms), audio_deleted_at = NULL WHERE id = ?`)
            .run(audioBlob, mimeType || 'audio/webm', durationMs ?? null, existing.id);
        return { groupId, recordingId: existing.id, track: normalizedTrack };
    }

    const id = randomUUID();
    const sessionKey = `${sessionId}:${normalizedTrack}`;
    db.prepare(`
        INSERT INTO recordings (id, group_id, track, session_id, user_id, source_type, source_app, source_url, source_host, tab_title, mime_type, duration_ms, audio_blob)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, groupId, normalizedTrack, sessionKey, userId ?? null, sourceType || 'tab',
        mapSourceApp(sourceHost, sourceType), sourceUrl ?? null, sourceHost ?? null,
        tabTitle ?? null, mimeType || 'audio/webm', durationMs ?? null, audioBlob);
    return { groupId, recordingId: id, track: normalizedTrack };
}

// ─── Transcripts ─────────────────────────────────────────────────────────────
const tcInfo = db.prepare('PRAGMA table_info(transcripts)').all();
const hasLegacySessionId = tcInfo.some((c) => c.name === 'session_id' && c.notnull === 1);
const hasLegacyIsPartial = tcInfo.some((c) => c.name === 'is_partial' && c.notnull === 1 && c.dflt_value == null);

function upsertTranscriptByRecording({ recordingId, text, status = 'done' }) {
    const existing = db.prepare('SELECT id FROM transcripts WHERE recording_id = ?').get(recordingId);
    const now = Math.floor(Date.now() / 1000);
    if (existing) {
        db.prepare('UPDATE transcripts SET text = ?, status = ?, updated_at = ? WHERE recording_id = ?').run(text, status, now, recordingId);
        return existing.id;
    }
    const id = randomUUID();
    let sessionId = null;
    if (hasLegacySessionId) {
        const rec = db.prepare('SELECT session_id FROM recordings WHERE id = ?').get(recordingId);
        sessionId = rec?.session_id || recordingId;
    }
    const cols = ['id', 'recording_id', 'text', 'status', 'created_at', 'updated_at'];
    const vals = [id, recordingId, text, status, now, now];
    if (hasLegacySessionId) { cols.push('session_id'); vals.push(sessionId); }
    if (hasLegacyIsPartial) { cols.push('is_partial'); vals.push(0); }
    db.prepare(`INSERT INTO transcripts (${cols.join(', ')}) VALUES (${vals.map(() => '?').join(', ')})`).run(...vals);
    return id;
}

// ─── Queries de grupos ───────────────────────────────────────────────────────
function listRecordingGroups({ limit = 50, offset = 0, q = '' }) {
    const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const off = Math.max(Number(offset) || 0, 0);
    const trimmedQ = q && String(q).trim();
    let whereSql = '';
    let whereParams = [];
    if (trimmedQ) {
        const term = `%${trimmedQ}%`;
        whereSql = `WHERE g.id IN (SELECT r.group_id FROM recordings r LEFT JOIN transcripts t ON t.recording_id = r.id WHERE IFNULL(t.text,'') LIKE ? OR IFNULL(r.source_host,'') LIKE ? OR IFNULL(r.tab_title,'') LIKE ?)`;
        whereParams = [term, term, term];
    }
    const rows = db.prepare(`SELECT * FROM recording_groups g ${whereSql} ORDER BY g.created_at DESC LIMIT ? OFFSET ?`).all(...whereParams, lim, off);
    const total = db.prepare(`SELECT COUNT(*) AS n FROM recording_groups g ${whereSql}`).get(...whereParams).n;
    return { items: rows.map((g) => groupOut(g, fetchTracks(g.id))), total };
}

function getRecordingGroup(groupId) {
    const g = db.prepare('SELECT * FROM recording_groups WHERE id = ?').get(groupId);
    if (!g) return null;
    return groupOut(g, fetchTracks(groupId));
}

function getTrackAudio(groupId, track) {
    return db.prepare(`SELECT audio_blob AS audioBlob, mime_type AS mimeType, audio_deleted_at AS audioDeletedAt FROM recordings WHERE group_id = ? AND track = ?`).get(groupId, normalizeTrack(track));
}

function getDefaultTrackAudio(groupId) {
    return db.prepare(`SELECT audio_blob AS audioBlob, mime_type AS mimeType, audio_deleted_at AS audioDeletedAt, track FROM recordings WHERE group_id = ? ORDER BY CASE track WHEN 'mix' THEN 0 WHEN 'tab' THEN 1 WHEN 'mic' THEN 2 ELSE 3 END LIMIT 1`).get(groupId);
}

// ─── Deletes ─────────────────────────────────────────────────────────────────
function deleteRecordingGroup(groupId) {
    db.prepare(`DELETE FROM transcripts WHERE recording_id IN (SELECT id FROM recordings WHERE group_id = ?)`).run(groupId);
    db.prepare('DELETE FROM recordings WHERE group_id = ?').run(groupId);
    return db.prepare('DELETE FROM recording_groups WHERE id = ?').run(groupId).changes > 0;
}

function deleteGroupAudio(groupId) {
    const now = Math.floor(Date.now() / 1000);
    return db.prepare(`UPDATE recordings SET audio_blob = ?, audio_deleted_at = ? WHERE group_id = ? AND audio_deleted_at IS NULL`).run(Buffer.alloc(0), now, groupId).changes > 0;
}

function deleteTrackAudio(groupId, track) {
    const now = Math.floor(Date.now() / 1000);
    return db.prepare(`UPDATE recordings SET audio_blob = ?, audio_deleted_at = ? WHERE group_id = ? AND track = ? AND audio_deleted_at IS NULL`).run(Buffer.alloc(0), now, groupId, normalizeTrack(track)).changes > 0;
}

function deleteTranscript(id) {
    return db.prepare('DELETE FROM transcripts WHERE id = ?').run(id).changes > 0;
}

// ─── Transcripts (lista independente) ────────────────────────────────────────
function transcriptOut(row) {
    if (!row) return null;
    return { id: row.id, recordingId: row.recording_id, text: row.text, status: row.status || 'done', createdAt: row.created_at * 1000, updatedAt: row.updated_at * 1000 };
}

function listTranscripts({ limit = 50, offset = 0, q = '' }) {
    const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
    const off = Math.max(Number(offset) || 0, 0);
    if (q && String(q).trim()) {
        const term = `%${String(q).trim()}%`;
        const rows = db.prepare(`SELECT * FROM transcripts WHERE text LIKE ? ORDER BY updated_at DESC LIMIT ? OFFSET ?`).all(term, lim, off);
        return { items: rows.map(transcriptOut), total: db.prepare('SELECT COUNT(*) AS n FROM transcripts WHERE text LIKE ?').get(term).n };
    }
    return {
        items: db.prepare('SELECT * FROM transcripts ORDER BY updated_at DESC LIMIT ? OFFSET ?').all(lim, off).map(transcriptOut),
        total: db.prepare('SELECT COUNT(*) AS n FROM transcripts').get().n,
    };
}

function getTranscript(id) {
    return transcriptOut(db.prepare('SELECT * FROM transcripts WHERE id = ?').get(id));
}

function updateTranscript(id, { text }) {
    if (text === undefined) return false;
    const now = Math.floor(Date.now() / 1000);
    return db.prepare('UPDATE transcripts SET text = ?, updated_at = ? WHERE id = ?').run(text, now, id).changes > 0;
}

module.exports = {
    createRecordingTrack,
    listRecordingGroups,
    getRecordingGroup,
    getTrackAudio,
    getDefaultTrackAudio,
    deleteRecordingGroup,
    deleteGroupAudio,
    deleteTrackAudio,
    upsertTranscriptByRecording,
    listTranscripts,
    getTranscript,
    updateTranscript,
    deleteTranscript,
};
