'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const ffmpegPath = require('ffmpeg-static');

/**
 * Whisper local via @xenova/transformers + ffmpeg-static.
 *
 * Variáveis de ambiente:
 *   WHISPER_ENABLED  — 'true' para ativar (default: false)
 *   WHISPER_MODEL    — nome do modelo HF (default: 'Xenova/whisper-small')
 *   WHISPER_LANG     — idioma para forçar (default: 'portuguese')
 *   WHISPER_TASK     — 'transcribe' ou 'translate' (default: 'transcribe')
 */

let pipelinePromise = null;
let warmedUp = false;

function isEnabled() {
    return String(process.env.WHISPER_ENABLED || '').toLowerCase() === 'true';
}

function getModelName() {
    return process.env.WHISPER_MODEL || 'Xenova/whisper-small';
}

function getLanguage() {
    return process.env.WHISPER_LANG || 'portuguese';
}

function getTask() {
    return process.env.WHISPER_TASK || 'transcribe';
}

/**
 * Carrega singleton do pipeline ASR.
 * @xenova/transformers é ESM-only, usamos dynamic import a partir de CommonJS.
 */
async function getPipeline() {
    if (pipelinePromise) return pipelinePromise;

    pipelinePromise = (async () => {
        const { pipeline, env } = await import('@xenova/transformers');

        // Mantém cache dentro do repo do backend (persiste entre restarts do node --watch)
        env.cacheDir = path.join(__dirname, '..', '.xenova-cache');
        env.allowLocalModels = true;

        const modelName = getModelName();
        console.log(`[Whisper] carregando modelo ${modelName}...`);
        const startMs = Date.now();

        const asr = await pipeline('automatic-speech-recognition', modelName, {
            quantized: true,
        });

        const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
        console.log(`[Whisper] modelo ${modelName} pronto em ${elapsed}s.`);
        warmedUp = true;

        return asr;
    })();

    return pipelinePromise;
}

/**
 * Converte buffer WebM/Opus em Float32Array PCM 16kHz mono via ffmpeg-static.
 */
async function webmToPcmFloat32(webmBuffer) {
    if (!webmBuffer || webmBuffer.length < 32) {
        throw new Error('buffer de áudio muito curto');
    }

    const tmpDir = os.tmpdir();
    const id = crypto.randomBytes(8).toString('hex');
    const inputPath = path.join(tmpDir, `ghost-audio-${id}.webm`);
    const outputPath = path.join(tmpDir, `ghost-audio-${id}.raw`);

    try {
        await fs.promises.writeFile(inputPath, webmBuffer);

        await new Promise((resolve, reject) => {
            const args = [
                '-y',
                '-hide_banner',
                '-loglevel', 'error',
                '-i', inputPath,
                '-f', 'f32le', // PCM 32-bit float little-endian
                '-acodec', 'pcm_f32le',
                '-ac', '1',    // mono
                '-ar', '16000',// 16 kHz (requisito Whisper)
                outputPath,
            ];

            const ff = spawn(ffmpegPath, args);
            let stderr = '';
            ff.stderr.on('data', (d) => { stderr += d.toString(); });
            ff.on('error', reject);
            ff.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`ffmpeg saiu com código ${code}: ${stderr || 'sem stderr'}`));
            });
        });

        const raw = await fs.promises.readFile(outputPath);
        // Bytes → Float32Array (little-endian)
        const float32 = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
        // Copia para um buffer próprio (desacopla do Buffer original que pode ser reciclado)
        return new Float32Array(float32);
    } finally {
        // Limpeza dos arquivos temporários
        try { await fs.promises.unlink(inputPath); } catch (_) { /* ignore */ }
        try { await fs.promises.unlink(outputPath); } catch (_) { /* ignore */ }
    }
}

/**
 * Transcreve um buffer WebM para texto.
 * Retorna string vazia em caso de erro (caller decide fallback).
 */
async function transcribeWebm(webmBuffer) {
    if (!isEnabled()) {
        throw new Error('WHISPER_ENABLED=false');
    }

    const t0 = Date.now();
    const audio = await webmToPcmFloat32(webmBuffer);
    const durationSec = audio.length / 16000;
    console.log(`[Whisper] áudio decodificado: ${durationSec.toFixed(1)}s (${audio.length} samples)`);

    const asr = await getPipeline();

    const t1 = Date.now();
    const result = await asr(audio, {
        language: getLanguage(),
        task: getTask(),
        chunk_length_s: 30,
        stride_length_s: 5,
        return_timestamps: false,
    });
    const t2 = Date.now();

    const text = (Array.isArray(result) ? result.map((r) => r.text).join(' ') : result.text || '').trim();

    console.log(
        `[Whisper] transcrição concluída: ${text.length} chars, ` +
        `decode=${((t1 - t0) / 1000).toFixed(1)}s, infer=${((t2 - t1) / 1000).toFixed(1)}s`,
    );

    return text;
}

/**
 * Pré-carrega o modelo (chame no boot para evitar delay na primeira transcrição).
 */
async function warmup() {
    if (!isEnabled() || warmedUp) return;
    try {
        await getPipeline();
    } catch (e) {
        console.warn(`[Whisper] warmup falhou: ${e.message}`);
    }
}

module.exports = {
    transcribeWebm,
    warmup,
    isEnabled,
};
