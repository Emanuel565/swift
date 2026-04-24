export type LiveTranscriptEvent =
  | { type: 'live-connected'; connectedAt: number }
  | { type: 'session-started'; sessionId: string; sourceType?: string; sourceHost?: string | null; tabTitle?: string | null }
  | { type: 'transcript-status'; sessionId?: string; status: string; error?: string }
  | { type: 'transcript-partial'; sessionId: string; text: string }
  | { type: 'transcript-ready'; sessionId?: string; recordingId?: string; status?: string; text?: string; sourceType?: string; sourceHost?: string | null; tabTitle?: string | null }
  | { type: 'recording_saved'; recordingId: string }
  | { type: 'error'; message?: string };

export function connectLiveTranscriptWs(onEvent: (event: LiveTranscriptEvent) => void) {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  let closedByUser = false;
  let ws: WebSocket | null = null;
  let retryMs = 1000;
  let connectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  const clearTimer = (timer: ReturnType<typeof setTimeout> | null) => {
    if (timer) clearTimeout(timer);
    return null;
  };

  const scheduleConnect = (delayMs: number) => {
    if (closedByUser) return;
    connectTimer = clearTimer(connectTimer);
    connectTimer = setTimeout(connect, delayMs);
  };

  const connect = () => {
    if (closedByUser) return;
    ws = new WebSocket(`${proto}//${window.location.host}/ws/live-transcripts`);
    const socket = ws;

    socket.onopen = () => {
      retryMs = 1000;
    };

    socket.onmessage = (event) => {
      if (typeof event.data !== 'string') return;
      try {
        const data = JSON.parse(event.data) as LiveTranscriptEvent;
        onEvent(data);
      } catch {
        // ignore malformed events
      }
    };

    socket.onclose = () => {
      if (ws === socket) ws = null;
      if (closedByUser) return;
      reconnectTimer = clearTimer(reconnectTimer);
      reconnectTimer = setTimeout(connect, retryMs);
      retryMs = Math.min(retryMs * 2, 8000);
    };

    socket.onerror = () => {
      // Deixar o navegador encerrar naturalmente e disparar onclose para reconectar.
    };
  };

  // Atraso curto evita ruído de StrictMode (mount/unmount instantâneo no dev).
  scheduleConnect(80);

  return () => {
    closedByUser = true;
    connectTimer = clearTimer(connectTimer);
    reconnectTimer = clearTimer(reconnectTimer);
    ws?.close();
    ws = null;
  };
}
