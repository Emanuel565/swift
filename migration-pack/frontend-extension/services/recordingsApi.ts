import axios from 'axios';

const recordingsClient = axios.create({
  baseURL: '/api/recordings',
  headers: { Accept: 'application/json' },
});

const transcriptsClient = axios.create({
  baseURL: '/api/transcripts',
  headers: { Accept: 'application/json' },
});

export type SourceApp = 'meet' | 'teams' | 'discord' | 'zoom' | 'desktop' | 'other';
export type TrackName = 'mic' | 'tab' | 'mix';

export interface RecordingTranscript {
  id: string;
  text: string;
  status: 'pending' | 'processing' | 'done' | 'error' | string;
  createdAt: number;
  updatedAt: number;
}

export interface RecordingTrack {
  id: string;
  track: TrackName;
  mimeType: string;
  durationMs: number | null;
  audioDeleted: boolean;
  audioDeletedAt: number | null;
  createdAt: number;
  transcript: RecordingTranscript | null;
}

export interface RecordingRow {
  id: string;
  sessionId: string;
  userId: string | null;
  sourceApp: SourceApp;
  sourceType: 'tab' | 'desktop' | 'meet' | string;
  sourceUrl: string | null;
  sourceHost: string | null;
  tabTitle: string | null;
  mimeType: string;
  durationMs: number | null;
  createdAt: number;
  tracks: RecordingTrack[];
  transcript: RecordingTranscript | null;
}

export interface RecordingsListResult {
  items: RecordingRow[];
  total: number;
}

export async function listRecordings(params?: { limit?: number; offset?: number; q?: string }) {
  const { data } = await recordingsClient.get<RecordingsListResult>('/', { params });
  return data;
}

export async function getRecording(id: string) {
  const { data } = await recordingsClient.get<RecordingRow>(`/${id}`);
  return data;
}

export function recordingAudioUrl(id: string, track?: TrackName) {
  return track ? `/api/recordings/${id}/audio?track=${track}` : `/api/recordings/${id}/audio`;
}

export async function updateRecordingTranscript(recordingId: string, text: string, track?: TrackName) {
  const payload: Record<string, unknown> = { text };
  if (track) payload.track = track;
  const { data } = await recordingsClient.patch<RecordingRow>(`/${recordingId}/transcript`, payload);
  return data;
}

export async function deleteRecording(recordingId: string) {
  await recordingsClient.delete(`/${recordingId}`);
}

export async function deleteRecordingAudio(recordingId: string, track?: TrackName) {
  const url = track ? `/${recordingId}/audio?track=${track}` : `/${recordingId}/audio`;
  await recordingsClient.delete(url);
}

export async function deleteTranscriptOnly(transcriptId: string) {
  await transcriptsClient.delete(`/${transcriptId}`);
}
