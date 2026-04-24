import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { AudioLines, Mic, Radio, CircleAlert, CircleCheckBig } from 'lucide-react';
import { connectLiveTranscriptWs, type LiveTranscriptEvent } from '../services/liveTranscriptWs';

type SessionState = {
  sessionId: string;
  status: string;
  sourceLabel: string;
  partials: string[];
  finalText: string;
};

function deriveSourceLabel(evt: Partial<LiveTranscriptEvent>) {
  const anyEvt = evt as { sourceType?: string; sourceHost?: string | null; tabTitle?: string | null };
  if (anyEvt.sourceType === 'meet') return 'Google Meet';
  if (anyEvt.sourceType === 'desktop') return 'Desktop Capture (sistema + mic)';
  if (anyEvt.tabTitle) return anyEvt.tabTitle;
  if (anyEvt.sourceHost) return anyEvt.sourceHost;
  return 'Origem não identificada';
}

export default function ReuniaoAoVivo() {
  const [events, setEvents] = useState<LiveTranscriptEvent[]>([]);
  const [sessions, setSessions] = useState<Record<string, SessionState>>({});
  const [lastError, setLastError] = useState('');

  useEffect(() => {
    return connectLiveTranscriptWs((evt) => {
      setEvents((prev) => [evt, ...prev].slice(0, 80));
      if (evt.type === 'error') {
        setLastError(evt.message || 'Erro no stream ao vivo.');
        return;
      }
      if (evt.type === 'session-started') {
        setSessions((prev) => ({
          ...prev,
          [evt.sessionId]: {
            sessionId: evt.sessionId,
            status: 'processing',
            sourceLabel: deriveSourceLabel(evt),
            partials: [],
            finalText: '',
          },
        }));
        return;
      }
      if (evt.type === 'transcript-status' && evt.sessionId) {
        const sessionId = evt.sessionId;
        setSessions((prev) => {
          const base = prev[sessionId] || {
            sessionId,
            status: 'processing',
            sourceLabel: 'Origem não identificada',
            partials: [],
            finalText: '',
          };
          return { ...prev, [sessionId]: { ...base, status: evt.status } };
        });
        return;
      }
      if (evt.type === 'transcript-partial') {
        setSessions((prev) => {
          const base = prev[evt.sessionId] || {
            sessionId: evt.sessionId,
            status: 'processing',
            sourceLabel: 'Origem não identificada',
            partials: [],
            finalText: '',
          };
          return {
            ...prev,
            [evt.sessionId]: {
              ...base,
              partials: [...base.partials, evt.text].slice(-10),
            },
          };
        });
        return;
      }
      if (evt.type === 'transcript-ready' && evt.sessionId) {
        const sessionId = evt.sessionId;
        setSessions((prev) => {
          const base = prev[sessionId] || {
            sessionId,
            status: 'done',
            sourceLabel: deriveSourceLabel(evt),
            partials: [],
            finalText: '',
          };
          return {
            ...prev,
            [sessionId]: {
              ...base,
              status: evt.status || 'done',
              sourceLabel: deriveSourceLabel(evt),
              finalText: evt.text || base.finalText,
            },
          };
        });
      }
    });
  }, []);

  const orderedSessions = useMemo(
    () => Object.values(sessions).sort((a, b) => b.sessionId.localeCompare(a.sessionId)),
    [sessions],
  );

  return (
    <div className="min-h-screen bg-[#0b0f14] text-zinc-100 px-4 py-10">
      <div className="max-w-5xl mx-auto">
        <motion.header initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
              <Radio className="text-emerald-400" size={26} />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-white">Reunião Ao Vivo</h1>
              <p className="text-zinc-500 text-sm">Transcrição parcial em tempo real (Google Meet)</p>
            </div>
          </div>
          {lastError && (
            <div className="mt-4 rounded-xl border border-red-900/60 bg-red-950/30 px-4 py-3 text-red-300 text-sm flex items-center gap-2">
              <CircleAlert size={16} /> {lastError}
            </div>
          )}
        </motion.header>

        {orderedSessions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-800 bg-[#0e1319] p-8 text-zinc-500 text-center">
            Nenhuma sessão ao vivo no momento. Abra uma call no Google Meet e inicie pela extensão.
          </div>
        ) : (
          <div className="space-y-4">
            {orderedSessions.map((session) => (
              <div key={session.sessionId} className="rounded-2xl border border-zinc-800/80 bg-[#0e1319] p-5">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="text-sm text-zinc-300 flex items-center gap-2">
                    <AudioLines size={16} className="text-zinc-400" />
                    <span>{session.sourceLabel}</span>
                  </div>
                  <span className="text-xs rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-zinc-300">
                    {session.status === 'done' ? 'Concluído' : session.status === 'error' ? 'Erro' : 'Processando'}
                  </span>
                </div>

                <div className="text-xs text-zinc-500 mb-3">Sessão: {session.sessionId}</div>

                {session.partials.length > 0 && (
                  <div className="rounded-xl border border-zinc-800 bg-[#090d12] p-3 mb-3">
                    <div className="text-xs text-zinc-400 mb-2 flex items-center gap-2">
                      <Mic size={14} /> Parcial ao vivo
                    </div>
                    <div className="space-y-1 text-sm text-zinc-200">
                      {session.partials.map((line, idx) => (
                        <p key={`${session.sessionId}-${idx}`}>• {line}</p>
                      ))}
                    </div>
                  </div>
                )}

                <div className="rounded-xl border border-zinc-800 bg-[#090d12] p-3">
                  <div className="text-xs text-zinc-400 mb-2 flex items-center gap-2">
                    <CircleCheckBig size={14} /> Versão final
                  </div>
                  <p className="text-sm text-zinc-100 whitespace-pre-wrap">
                    {session.finalText || 'Aguardando finalização da transcrição...'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 text-xs text-zinc-600">
          Eventos recebidos: {events.length}
        </div>
      </div>
    </div>
  );
}
