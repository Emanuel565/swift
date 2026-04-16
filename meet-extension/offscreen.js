let currentStream;
let currentAudioContext;

async function openTabAudioStream(streamId) {
    return navigator.mediaDevices.getUserMedia({
        audio: {
            mandatory: {
                chromeMediaSource: "tab",
                chromeMediaSourceId: streamId
            }
        },
        video: false
    });
}

async function startTranscription(streamId) {
    currentStream = await openTabAudioStream(streamId);
    currentAudioContext = new AudioContext({ sampleRate: 16000 });

    const source = currentAudioContext.createMediaStreamSource(currentStream);
    const processor = currentAudioContext.createScriptProcessor(4096, 1, 1);

    processor.onaudioprocess = (event) => {
        const inputData = event.inputBuffer.getChannelData(0);

        // TODO: converter PCM float32 para int16 e enviar para a API de transcrição
        console.debug("Chunk de áudio recebido:", inputData.length);
    };

    source.connect(processor);
    processor.connect(currentAudioContext.destination);
}

chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== "START_TRANSCRIPTION") {
        return;
    }

    startTranscription(message.payload.streamId).catch((error) => {
        console.error("Falha no processamento offscreen:", error);
    });
});
