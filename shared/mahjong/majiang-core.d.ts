// @kobalab/majiang-core (MIT, https://github.com/kobalab/majiang-core) 타입.
// 원본은 JS라서 우리가 쓰는 부분만 타입을 붙였어요. 동작은 test/majiang.test.ts에서 확인해요.
//
// 패 표기: 종류 글자 + 숫자. m 만수, p 통수, s 삭수(0은 빨간 5), z 자패(1동 2남 3서 4북 5백 6발 7중).
// 버린 패 뒤 기호: '_' 쯔모기리, '*' 리치 선언, '+' '=' '-' 하가·대면·상가가 울어 감.
// 운 몸통(면자): 'm123-'(치), 'p555='(퐁), 'z1111'(안깡), 's5555+'(대명깡), 'm555=5'(가깡).
// 자리 번호: l은 이번 국의 바람 순서(0이 친), id는 처음 앉은 자리(qijia 기준)예요.

declare module '@kobalab/majiang-core' {
  export type Pai = string;
  export type Mianzi = string;

  export type Rule = Record<string, unknown> & {
    配給原点: number;
    場数: number;
    赤牌: { m: number; p: number; s: number };
    クイタンあり: boolean;
    裏ドラあり: boolean;
  };

  export function rule(param?: Partial<Rule>): Rule;

  export class Shoupai {
    static valid_pai(p: string): Pai | undefined;
    static valid_mianzi(m: string): Mianzi | undefined;
    static fromString(paistr?: string): Shoupai;
    constructor(qipai?: Pai[]);
    _bingpai: { _: number; m: number[]; p: number[]; s: number[]; z: number[] };
    _fulou: Mianzi[];
    _zimo: string | null;
    _lizhi: boolean;
    readonly menqian: boolean;
    readonly lizhi: boolean;
    toString(): string;
    clone(): Shoupai;
    zimo(p: Pai, check?: boolean): this;
    dapai(p: Pai, check?: boolean): this;
    fulou(m: Mianzi, check?: boolean): this;
    gang(m: Mianzi, check?: boolean): this;
    get_dapai(check?: boolean): Pai[] | null;
    get_chi_mianzi(p: Pai, check?: boolean): Mianzi[] | null;
    get_peng_mianzi(p: Pai): Mianzi[] | null;
    get_gang_mianzi(p?: Pai): Mianzi[] | null;
  }

  export class Shan {
    static zhenbaopai(p: Pai): Pai;
    constructor(rule: Rule);
    _pai: Pai[];
    _baopai: Pai[];
    _fubaopai: Pai[] | null;
    readonly paishu: number;
    readonly baopai: Pai[];
    readonly fubaopai: Pai[] | null;
    zimo(): Pai;
  }

  export class He {
    _pai: string[];
    find(p: Pai): boolean | undefined;
  }

  /** 화료 계산 결과의 역 하나 */
  export interface Hupai {
    name: string;
    /** 판 수. 역만은 '*'(역만) '**'(더블 역만) 같은 문자열이에요. */
    fanshu: number | string;
    baojia?: number;
  }

  export interface HuleResult {
    hupai: Hupai[] | null;
    fu: number;
    fanshu: number;
    damanguan: number;
    defen: number;
    /** 바람 순서(l)별 점수 변화 */
    fenpei: number[];
  }

  export interface HuleParam {
    rule: Rule;
    zhuangfeng: number;
    menfeng: number;
    hupai: { lizhi: number; yifa: boolean | number; qianggang: boolean; lingshang: boolean; haidi: number; tianhu: number };
    baopai: Pai[];
    fubaopai: Pai[] | null;
    jicun: { changbang: number; lizhibang: number };
  }

  export const Util: {
    xiangting(shoupai: Shoupai): number;
    tingpai(shoupai: Shoupai, f_xiangting?: (s: Shoupai) => number): Pai[];
    hule(shoupai: Shoupai, rongpai: Pai | null, param: HuleParam): HuleResult | undefined;
    hule_param(param?: Record<string, unknown>): HuleParam;
  };

  /** Game이 각 자리에 보내는 메시지 (한 번에 하나의 키만 있어요) */
  export interface GameMessage {
    kaiju?: { id: number; rule: Rule; title: string; player: string[]; qijia: number };
    qipai?: { zhuangfeng: number; jushu: number; changbang: number; lizhibang: number; defen: number[]; baopai: Pai; shoupai: string[] };
    zimo?: { l: number; p: Pai };
    gangzimo?: { l: number; p: Pai };
    dapai?: { l: number; p: Pai };
    fulou?: { l: number; m: Mianzi };
    gang?: { l: number; m: Mianzi };
    kaigang?: { baopai: Pai };
    hule?: {
      l: number;
      shoupai: string;
      baojia: number | null;
      fubaopai: Pai[] | null;
      fu?: number;
      fanshu?: number;
      damanguan?: number;
      defen: number;
      hupai: Hupai[];
      fenpei: number[];
    };
    pingju?: { name: string; shoupai: string[]; fenpei: number[] };
    jieju?: Paipu;
  }

  /** 각 자리의 대답 */
  export interface Reply {
    dapai?: Pai;
    hule?: string;
    daopai?: string;
    fulou?: Mianzi;
    gang?: Mianzi;
  }

  export interface Paipu {
    title: string;
    player: string[];
    qijia: number;
    log: GameMessage[][];
    defen: number[];
    point: string[];
    rank: number[];
  }

  export interface GamePlayer {
    action(msg: GameMessage, callback?: (reply?: Reply) => void): void;
  }

  export class Game {
    constructor(players: GamePlayer[], callback?: (paipu: Paipu) => void, rule?: Rule, title?: string);
    _sync: boolean;
    _status: string;
    _reply: (Reply | undefined)[];
    _rule: Rule;
    _paipu: Paipu;
    _dapai: Pai | null;
    _neng_rong: (boolean | number)[];
    _lizhi: number[];
    _diyizimo: boolean;
    _model: {
      title: string;
      player: string[];
      qijia: number;
      zhuangfeng: number;
      jushu: number;
      changbang: number;
      lizhibang: number;
      defen: number[];
      shan: Shan;
      shoupai: Shoupai[];
      he: He[];
      player_id: number[];
      lunban: number;
    };
    readonly model: Game['_model'];
    kaiju(qijia?: number): void;
    qipai(shan?: Shan): void;
    reply(id: number, reply?: Reply): void;
    next(): void;
    get_dapai(): Pai[];
    allow_hule(l?: number): boolean;
    allow_pingju(): boolean;
    static get_dapai(rule: Rule, shoupai: Shoupai): Pai[];
  }
}
