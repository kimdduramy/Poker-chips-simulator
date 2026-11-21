import type { HandRecord } from '../../shared/protocol';
export interface RoomInfo {
  code: string;
  phase: string;
  cardMode?: boolean;
  players: string[];
}

export async function createRoom(opts: { cardMode?: boolean } = {}): Promise<string> {
  const res = await fetch('/api/rooms', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ cardMode: !!opts.cardMode }),
  });
  const body = (await res.json().catch(() => ({}))) as { code?: string; error?: string };
  if (!res.ok || !body.code) throw new Error(body.error ?? '테이블을 만들지 못했어요. 다시 시도해 주세요.');
  return body.code;
}

export async function roomInfo(code: string): Promise<RoomInfo | null> {
  const res = await fetch(`/api/rooms/${code}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('테이블에 연결하지 못했어요');
  return (await res.json()) as RoomInfo;
}

/** 끝난 핸드 기록 (이 테이블에 앉은 기기만 받을 수 있어요) */
export interface HistoryReply {
  code: string;
  cardMode: boolean;
  /** 디버그 코드가 맞으면 hands에 모두의 시작 패(holes)가 들어 있어요 */
  debug: boolean;
  hands: HandRecord[];
}

export async function fetchHistory(code: string, token: string, debugCode?: string): Promise<HistoryReply> {
  const headers: Record<string, string> = { 'x-token': token };
  if (debugCode !== undefined) headers['x-debug-code'] = debugCode;
  const res = await fetch(`/api/rooms/${code}/history`, { headers, cache: 'no-store' });
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(body.error ?? '기록을 가져오지 못했어요');
  return body as HistoryReply;
}
