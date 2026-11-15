import { CODE_ALPHABET, CODE_LENGTH, isRoomCode } from '../../shared/protocol';
import { Room } from './room';

export { Room };

export interface Env {
  ROOMS: DurableObjectNamespace<Room>;
  CREATE_LIMITER?: RateLimit;
  ALLOWED_ORIGINS?: string;
}

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

export function randomCode() {
  const out: string[] = [];
  const bytes = new Uint8Array(16);
  while (out.length < CODE_LENGTH) {
    crypto.getRandomValues(bytes);
    for (const b of bytes) {
      // rejection sampling keeps every letter equally likely
      if (b < 256 - (256 % CODE_ALPHABET.length) && out.length < CODE_LENGTH) {
        out.push(CODE_ALPHABET[b % CODE_ALPHABET.length]);
      }
    }
  }
  return out.join('');
}

export function originAllowed(origin: string | null, env: Env, requestHost?: string) {
  if (!origin) return true;
  let host: string;
  let protocol: string;
  try {
    ({ host, protocol } = new URL(origin));
  } catch {
    return false;
  }
  const hostname = host.split(':')[0];
  if (protocol === 'http:' && (hostname === 'localhost' || hostname === '127.0.0.1')) return true;
  if (protocol !== 'https:') return false;
  // 같은 사이트에서 온 요청은 허용 (내 Cloudflare Pages 주소가 뭐든 그대로 동작)
  if (requestHost && host === requestHost) return true;
  if (hostname === 'chip-poker.pages.dev' || hostname.endsWith('.chip-poker.pages.dev')) return true;
  return (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
    .includes(origin);
}

const stub = (env: Env, code: string) => env.ROOMS.get(env.ROOMS.idFromName(code));

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] !== 'api') return json({ error: 'Not found' }, 404);

    if (parts[1] === 'health') return json({ ok: true });

    if (!originAllowed(request.headers.get('Origin'), env, url.host)) return json({ error: 'Forbidden' }, 403);

    if (parts[1] === 'rooms' && parts.length === 2 && request.method === 'POST') {
      const ip = request.headers.get('cf-connecting-ip') ?? 'local';
      if (env.CREATE_LIMITER) {
        const { success } = await env.CREATE_LIMITER.limit({ key: ip });
        if (!success) return json({ error: '테이블을 너무 많이 만들었어요. 1분 뒤에 다시 시도해 주세요.' }, 429);
      }
      for (let attempt = 0; attempt < 8; attempt++) {
        const code = randomCode();
        const res = await stub(env, code).fetch('https://room/init', {
          method: 'POST',
          body: JSON.stringify({ code }),
        });
        if (res.status === 201) return json({ code }, 201);
      }
      return json({ error: '테이블을 만들지 못했어요' }, 503);
    }

    if (parts[1] === 'rooms' && parts.length >= 3) {
      const code = parts[2].toUpperCase();
      if (!isRoomCode(code)) return json({ error: 'Not found' }, 404);
      if (parts.length === 3 && request.method === 'GET') {
        const res = await stub(env, code).fetch('https://room/info');
        if (res.status === 404) return json({ error: '그 코드의 테이블이 없어요' }, 404);
        return json(await res.json());
      }
      if (parts.length === 4 && parts[3] === 'ws') {
        if (request.headers.get('Upgrade') !== 'websocket') return json({ error: 'Expected WebSocket' }, 426);
        const res = await stub(env, code).fetch('https://room/ws', { headers: request.headers });
        if (res.status === 404) return json({ error: '그 코드의 테이블이 없어요' }, 404);
        return res;
      }
    }

    return json({ error: 'Not found' }, 404);
  },
} satisfies ExportedHandler<Env>;
