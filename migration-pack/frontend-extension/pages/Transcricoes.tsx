import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  listRecordings,
  deleteRecording,
  deleteRecordingAudio,
  deleteTranscriptOnly,
  updateRecordingTranscript,
  recordingAudioUrl,
  type RecordingRow,
  type RecordingTrack,
  type TrackName,
} from '../services/recordingsApi';
import {
  Mic, Trash2, Pencil, Search, AlertTriangle, Check, Loader2,
  AudioLines, Headset, FileX, VolumeX, User, Users, Layers,
} from 'lucide-react';

function fmtDate(ts: number) {
  try {
    return new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return '—'; }
}

const TRACK_META: Record<TrackName, { label: string; description: string; icon: typeof User }> = {
  mic: { label: 'Você', description: 'Microfone do usuário', icon: User },
  tab: { label: 'Reunião', description: 'Áudio da aba (outros participantes)', icon: Users },
  mix: { label: 'Mix', description: 'Mixagem das duas fontes', icon: Layers },
};

export default function Transcricoes() {
  const [rows, setRows] = useState<RecordingRow[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 400);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const data = await listRecordings({ limit: 100, q: debouncedQ || undefined });
      setRows(data.items); setTotal(data.total);
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : 'Erro ao carregar'); }
    finally { setLoading(false); }
  }, [debouncedQ]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3200); return () => clearTimeout(t); }, [toast]);

  const showToast = (type: 'ok' | 'err', msg: string) => setToast({ type, msg });

  const onDeleteAll = async (id: string) => {
    if (!confirm('Excluir gravação inteira (áudio + transcrições de todas as trilhas)?')) return;
    try { await deleteRecording(id); showToast('ok', 'Gravação removida.'); load(); }
    catch (e: unknown) { showToast('err', e instanceof Error ? e.message : 'Falha'); }
  };

  const onDeleteAllAudio = async (id: string) => {
    if (!confirm('Remover o áudio de TODAS as trilhas? As transcrições serão mantidas.')) return;
    try { await deleteRecordingAudio(id); showToast('ok', 'Áudios removidos.'); load(); }
    catch (e: unknown) { showToast('err', e instanceof Error ? e.message : 'Falha'); }
  };

  const onDeleteTrackAudio = async (id: string, track: TrackName) => {
    if (!confirm(`Remover o áudio da trilha "${TRACK_META[track].label}"?`)) return;
    try { await deleteRecordingAudio(id, track); showToast('ok', `Áudio "${TRACK_META[track].label}" removido.`); load(); }
    catch (e: unknown) { showToast('err', e instanceof Error ? e.message : 'Falha'); }
  };

  const onDeleteTranscriptOnly = async (transcriptId: string) => {
    if (!confirm('Remover esta transcrição? O áudio será mantido.')) return;
    try { await deleteTranscriptOnly(transcriptId); showToast('ok', 'Transcrição removida.'); load(); }
    catch (e: unknown) { showToast('err', e instanceof Error ? e.message : 'Falha'); }
  };

  const startEdit = (groupId: string, t: RecordingTrack) => { setEditKey(`${groupId}::${t.track}`); setEditText(t.transcript?.text || ''); };

  const saveEdit = async () => {
    if (!editKey) return;
    const [groupId, trackName] = editKey.split('::') as [string, TrackName];
    setSaving(true);
    try { await updateRecordingTranscript(groupId, editText, trackName); setEditKey(null); showToast('ok', 'Salvo.'); load(); }
    catch (e: unknown) { showToast('err', e instanceof Error ? e.message : 'Erro ao salvar'); }
    finally { setSaving(false); }
  };

  const sourceBadge = (row: RecordingRow) => {
    if (row.sourceType === 'meet' || row.sourceHost === 'meet.google.com') return 'Google Meet';
    if (row.sourceType === 'desktop') return 'Desktop Capture';
    switch (row.sourceApp) {
      case 'teams': return 'Microsoft Teams';
      case 'discord': return 'Discord';
      case 'zoom': return 'Zoom';
      default: return row.sourceHost || 'Outro';
    }
  };

  const statusLabel = (status?: string | null) => {
    if (!status || status === 'processing' || status === 'pending') return 'Processando';
    if (status === 'done') return 'Pronto';
    if (status === 'error') return 'Erro';
    return status;
  };

  return (
    <div className="min-h-screen bg-[#0b0f14] text-zinc-100">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <motion.header initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
              <Mic className="text-emerald-400" size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-white">Transcrições</h1>
              <p className="text-sm text-zinc-500 mt-0.5">{total} gravação{total !== 1 ? 'ões' : ''} · Ghost Audio v3.1</p>
            </div>
          </div>
          <p className="text-zinc-400 text-sm max-w-2xl leading-relaxed">
            Cada reunião é gravada em duas trilhas: <strong>Você</strong> (microfone) e <strong>Reunião</strong> (áudio da aba). Exclua qualquer trilha sem perder a outra.
          </p>
        </motion.header>

        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" size={18} />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar no texto..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#12181f] border border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
        </div>

        {err && (
          <div className="mb-4 flex items-center gap-2 text-red-400 text-sm bg-red-950/40 border border-red-900/50 rounded-xl px-4 py-3">
            <AlertTriangle size={18} /> {err}
          </div>
        )}

        <AnimatePresence>
          {toast && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg border ${toast.type === 'ok' ? 'bg-emerald-950/90 border-emerald-800 text-emerald-200' : 'bg-red-950/90 border-red-800 text-red-200'}`}>
              {toast.type === 'ok' ? <Check size={18} /> : <AlertTriangle size={18} />}
              {toast.msg}
            </motion.div>
          )}
        </AnimatePresence>

        {loading ? (
          <div className="flex justify-center py-24 text-zinc-500 gap-2 items-center">
            <Loader2 className="animate-spin" size={22} /> Carregando…
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-20 text-zinc-500 border border-dashed border-zinc-800 rounded-2xl bg-[#0e1319]">
            Nenhuma gravação ainda. Use a extensão para capturar áudio.
          </div>
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => (
              <motion.li key={r.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="rounded-2xl border border-zinc-800/80 bg-[#0e1319] p-4 hover:border-zinc-700 transition-colors">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[11px] text-zinc-300">
                    <Headset size={12} /> {sourceBadge(r)}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[11px] text-zinc-400">
                    <AudioLines size={12} /> {statusLabel(r.transcript?.status)}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-[11px] text-zinc-400">
                    {r.tracks.length} trilha{r.tracks.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <p className="text-zinc-300 text-xs mb-3">
                  {r.tabTitle || r.sourceUrl || r.sourceHost || 'Origem não identificada'}
                </p>

                <div className="grid gap-3 sm:grid-cols-2">
                  {r.tracks.map((t) => {
                    const meta = TRACK_META[t.track] ?? TRACK_META.mix;
                    const Icon = meta.icon;
                    const editing = editKey === `${r.id}::${t.track}`;
                    return (
                      <div key={t.id} className="rounded-xl border border-zinc-800 bg-[#0a0e13] p-3">
                        <div className="flex items-center justify-between mb-2 gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-300 shrink-0">
                              <Icon size={14} />
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-zinc-200 truncate">{meta.label}</p>
                              <p className="text-[11px] text-zinc-500 truncate">{meta.description}</p>
                            </div>
                          </div>
                          <div className="flex gap-0.5 shrink-0">
                            <button type="button" onClick={() => startEdit(r.id, t)}
                              className="p-1.5 rounded-md text-zinc-500 hover:text-emerald-400 hover:bg-zinc-800/80" title="Editar transcrição">
                              <Pencil size={14} />
                            </button>
                            {!t.audioDeleted && (
                              <button type="button" onClick={() => onDeleteTrackAudio(r.id, t.track)}
                                className="p-1.5 rounded-md text-zinc-500 hover:text-amber-400 hover:bg-zinc-800/80" title="Excluir áudio desta trilha">
                                <VolumeX size={14} />
                              </button>
                            )}
                            {t.transcript?.id && (
                              <button type="button" onClick={() => onDeleteTranscriptOnly(t.transcript!.id)}
                                className="p-1.5 rounded-md text-zinc-500 hover:text-amber-400 hover:bg-zinc-800/80" title="Excluir transcrição desta trilha">
                                <FileX size={14} />
                              </button>
                            )}
                          </div>
                        </div>

                        {t.audioDeleted ? (
                          <div className="mb-2 flex items-center gap-2 text-[11px] text-zinc-500 italic rounded-lg border border-dashed border-zinc-800 bg-zinc-900/40 px-2.5 py-1.5">
                            <VolumeX size={12} /> Áudio removido.
                          </div>
                        ) : (
                          <audio controls className="w-full mb-2 h-8">
                            <source src={recordingAudioUrl(r.id, t.track)} type={t.mimeType || 'audio/webm'} />
                          </audio>
                        )}

                        {editing ? (
                          <div className="space-y-2">
                            <textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={4}
                              className="w-full rounded-lg bg-[#080b10] border border-zinc-800 text-zinc-100 p-2 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
                            <div className="flex gap-2 justify-end">
                              <button type="button" onClick={() => setEditKey(null)} className="px-2.5 py-1 rounded-md text-xs text-zinc-400 hover:text-white">Cancelar</button>
                              <button type="button" disabled={saving} onClick={saveEdit}
                                className="px-3 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs disabled:opacity-50">Salvar</button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-zinc-300 text-xs leading-relaxed whitespace-pre-wrap">
                            {t.transcript?.text || <span className="text-zinc-500 italic">{t.audioDeleted ? 'Sem transcrição.' : 'Transcrição em processamento...'}</span>}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-500">
                    <span>Sessão: {r.sessionId.slice(0, 8)}…</span>
                    <span>{fmtDate(r.createdAt)}</span>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {r.tracks.some((t) => !t.audioDeleted) && (
                      <button type="button" onClick={() => onDeleteAllAudio(r.id)}
                        className="px-2.5 py-1 rounded-md text-[11px] text-zinc-400 hover:text-amber-400 hover:bg-zinc-800/80 inline-flex items-center gap-1">
                        <VolumeX size={12} /> Remover áudios
                      </button>
                    )}
                    <button type="button" onClick={() => onDeleteAll(r.id)}
                      className="px-2.5 py-1 rounded-md text-[11px] text-zinc-400 hover:text-red-400 hover:bg-zinc-800/80 inline-flex items-center gap-1">
                      <Trash2 size={12} /> Excluir tudo
                    </button>
                  </div>
                </div>
              </motion.li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
