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
