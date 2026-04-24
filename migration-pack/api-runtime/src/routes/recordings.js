'use strict';

const express = require('express');
const {
    listRecordingGroups,
    getRecordingGroup,
    getTrackAudio,
    getDefaultTrackAudio,
    deleteRecordingGroup,
    deleteGroupAudio,
    deleteTrackAudio,
    upsertTranscriptByRecording,
} = require('../transcriptStore');

const router = express.Router();

const VALID_TRACKS = new Set(['mic', 'tab', 'mix']);
function parseTrack(raw) {
    if (raw == null) return null;
    const v = String(raw).toLowerCase();
    return VALID_TRACKS.has(v) ? v : null;
}

router.get('/', (req, res) => {
    try {
        res.json(listRecordingGroups({ limit: req.query.limit, offset: req.query.offset, q: req.query.q }));
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/:id', (req, res) => {
    const row = getRecordingGroup(req.params.id);
    if (!row) return res.status(404).json({ error: 'Não encontrado' });
    res.json(row);
});

router.get('/:id/audio', (req, res) => {
    const track = parseTrack(req.query.track);
    const row = track ? getTrackAudio(req.params.id, track) : getDefaultTrackAudio(req.params.id);
    if (!row) return res.status(404).json({ error: 'Áudio não encontrado' });
    if (row.audioDeletedAt != null) return res.status(410).json({ error: 'Áudio removido', track: row.track });
    res.setHeader('Content-Type', row.mimeType || 'audio/webm');
    res.setHeader('Cache-Control', 'no-store');
    res.send(row.audioBlob);
});

router.patch('/:id/transcript', (req, res) => {
    const group = getRecordingGroup(req.params.id);
    if (!group) return res.status(404).json({ error: 'Gravação não encontrada' });
    const { text, status, track } = req.body ?? {};
    if (!text || typeof text !== 'string') return res.status(400).json({ error: 'Campo text é obrigatório.' });
    const preferredOrder = ['mix', 'tab', 'mic'];
    const targetTrack = parseTrack(track);
    const target = targetTrack
        ? group.tracks.find((t) => t.track === targetTrack)
        : preferredOrder.map((t) => group.tracks.find((tr) => tr.track === t)).find(Boolean);
    if (!target) return res.status(404).json({ error: 'Nenhuma track disponível.' });
    upsertTranscriptByRecording({ recordingId: target.id, text: text.trim(), status: status || 'done' });
    res.json(getRecordingGroup(req.params.id));
});

router.delete('/:id/audio', (req, res) => {
    const track = parseTrack(req.query.track);
    const ok = track ? deleteTrackAudio(req.params.id, track) : deleteGroupAudio(req.params.id);
    if (!ok) return res.status(404).json({ error: track ? `Track ${track} não encontrada` : 'Grupo não encontrado' });
    res.status(204).end();
});

router.delete('/:id', (req, res) => {
    const ok = deleteRecordingGroup(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Não encontrado' });
    res.status(204).end();
});

module.exports = router;
