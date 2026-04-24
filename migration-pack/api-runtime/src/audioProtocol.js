'use strict';

/**
 * Ghost Audio v3 — frame binário único por chunk (evita pareamento JSON+binário).
 *
 * Layout (big-endian):
 * [0-1]   magic 0x47 0x41 ("GA")
 * [2]     versão (0x01)
 * [3]     tipo: 0x01 = chunk de áudio
 * [4-7]   seq uint32
 * [8-43]  sessionId UUID ASCII (36 bytes, padding com espaços se menor)
 * [44-47] payloadLen uint32
 * [48...] payload
 */

const MAGIC = Buffer.from([0x47, 0x41]);
const VERSION = 0x01;
const TYPE_AUDIO_CHUNK = 0x01;
const HEADER_LEN = 48;
const SESSION_ID_LEN = 36;

function padSessionId(id) {
    const s = String(id);
    if (s.length > SESSION_ID_LEN) return s.slice(0, SESSION_ID_LEN);
    return s.padEnd(SESSION_ID_LEN, ' ');
}

function encodeAudioChunk({ seq, sessionId, payload }) {
    const sid = padSessionId(sessionId);
    const buf = Buffer.allocUnsafe(HEADER_LEN + payload.length);
    MAGIC.copy(buf, 0);
    buf[2] = VERSION;
    buf[3] = TYPE_AUDIO_CHUNK;
    buf.writeUInt32BE(seq >>> 0, 4);
    buf.write(sid, 8, 'utf8');
    buf.writeUInt32BE(payload.length, 44);
    Buffer.from(payload).copy(buf, 48);
    return buf;
}

function parseAudioChunk(buf) {
    if (!Buffer.isBuffer(buf) || buf.length < HEADER_LEN) {
        return { ok: false, error: 'buffer muito curto' };
    }
    if (buf[0] !== MAGIC[0] || buf[1] !== MAGIC[1]) {
        return { ok: false, error: 'magic inválido' };
    }
    if (buf[2] !== VERSION) {
        return { ok: false, error: 'versão não suportada' };
    }
    if (buf[3] !== TYPE_AUDIO_CHUNK) {
        return { ok: false, error: 'tipo de frame inválido' };
    }
    const seq = buf.readUInt32BE(4);
    const sessionId = buf.toString('utf8', 8, 8 + SESSION_ID_LEN).trim();
    const payloadLen = buf.readUInt32BE(44);
    if (HEADER_LEN + payloadLen > buf.length) {
        return { ok: false, error: 'payload incompleto' };
    }
    const payload = buf.subarray(48, 48 + payloadLen);
    return { ok: true, seq, sessionId, payload };
}

module.exports = {
    encodeAudioChunk,
    parseAudioChunk,
    HEADER_LEN,
    SESSION_ID_LEN,
    TYPE_AUDIO_CHUNK,
};
