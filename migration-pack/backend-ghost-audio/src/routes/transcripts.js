'use strict';

const express = require('express');
const {
    listTranscripts,
    getTranscript,
    updateTranscript,
    deleteTranscript,
} = require('../transcriptStore');

const router = express.Router();

router.get('/', (req, res) => {
    const limit = req.query.limit;
    const offset = req.query.offset;
    const q = req.query.q;
    try {
        const data = listTranscripts({ limit, offset, q });
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/:id', (req, res) => {
    const row = getTranscript(req.params.id);
    if (!row) return res.status(404).json({ error: 'Não encontrado' });
    res.json(row);
});

router.patch('/:id', (req, res) => {
    const { text } = req.body ?? {};
    if (text === undefined) return res.status(400).json({ error: 'Informe text.' });
    const ok = updateTranscript(req.params.id, { text: String(text) });
    if (!ok) return res.status(404).json({ error: 'Não encontrado' });
    res.json(getTranscript(req.params.id));
});

router.delete('/:id', (req, res) => {
    const ok = deleteTranscript(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Não encontrado' });
    res.status(204).end();
});

module.exports = router;
