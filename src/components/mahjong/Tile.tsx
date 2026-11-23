import { bare, isRed, tileName } from '../../../shared/mahjong/tiles';

/**
 * 마작패 한 장. 지금은 글자로 그려요 (4단계에서 직접 그린 패 그림으로 바꿔요).
 * 유니코드 마작 문자는 폰마다 다르게 보여서 쓰지 않아요.
 */
const HONOR = ['동', '남', '서', '북', '', '발', '중'];
const SUIT = { m: '만', p: '통', s: '삭' } as const;

export type TileSize = 'sm' | 'md' | 'lg' | 'pond' | 'dora';

interface Props {
  /** 'm3', 'p0', 'z7'. 버림패 기호('_' 쯔모기리 등)가 붙어 있어도 돼요. */
  tile: string;
  size?: TileSize;
  /** 쯔모기리처럼 흐리게 */
  faint?: boolean;
  /** 방금 버려진 패, 이긴 패처럼 강조 */
  mark?: boolean;
}

export function MjTile({ tile, size = 'md', faint, mark }: Props) {
  const t = bare(tile);
  const suit = t[0];
  const n = t[1];
  return (
    <span
      className="mj-tile"
      data-size={size}
      data-suit={suit}
      data-honor={suit === 'z' ? n : undefined}
      data-red={isRed(t) || undefined}
      data-faint={faint || undefined}
      data-mark={mark || undefined}
      role="img"
      aria-label={tileName(t)}
    >
      {suit === 'z' ? (
        <span className="mj-tile-honor" aria-hidden="true">
          {HONOR[Number(n) - 1]}
        </span>
      ) : (
        <span className="mj-tile-num" aria-hidden="true">
          <span className="mj-tile-digit">{n === '0' ? 5 : n}</span>
          <span className="mj-tile-suit">{SUIT[suit as keyof typeof SUIT]}</span>
        </span>
      )}
    </span>
  );
}

/** 뒷면 */
export function MjTileBack({ size = 'sm' }: { size?: TileSize }) {
  return <span className="mj-tile mj-tile-back" data-size={size} aria-hidden="true" />;
}

/** 여러 장을 한 줄로 (공개된 손패, 기다리는 패 등) */
export function MjTiles({ tiles, size = 'sm', mark, label }: { tiles: string[]; size?: TileSize; mark?: number; label?: string }) {
  return (
    <span className="mj-tiles" role="group" aria-label={label ?? tiles.map(tileName).join(', ')}>
      {tiles.map((t, i) => (
        <MjTile key={`${t}-${i}`} tile={t} size={size} mark={i === mark} />
      ))}
    </span>
  );
}
