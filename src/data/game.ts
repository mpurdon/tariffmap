/**
 * An iterated prisoner's dilemma framed as a trade war: each round both countries either keep
 * trade open or impose tariffs. Payoffs are the textbook ones (T 5 > R 3 > P 1 > S 0), read as
 * illustrative welfare points, not dollars. Seeded, so the page shows the same result every time.
 */

export type Move = 'open' | 'tariff';

export interface Strategy {
  id: string;
  name: string;
  description: string;
  /** Next intended move, given both histories (own moves, opponent's moves) and a random source. */
  play: (mine: Move[], theirs: Move[], rand: () => number) => Move;
}

/** Points for the row player: [my move][their move]. */
export const PAYOFF: Record<Move, Record<Move, number>> = {
  open: {open: 3, tariff: 0},
  tariff: {open: 5, tariff: 1}
};

const last = <T>(xs: T[]) => xs[xs.length - 1];

export const STRATEGY_MODELS: Strategy[] = [
  {
    id: 'tft',
    name: 'Tit-for-tat',
    description: 'Opens, then copies whatever the other side did last round.',
    play: (_m, t) => last(t) ?? 'open'
  },
  {
    id: 'gtft',
    name: 'Forgiving tit-for-tat',
    description: 'Tit-for-tat, but lets one tariff in three go unanswered.',
    play: (_m, t, rand) => (last(t) === 'tariff' && rand() >= 1 / 3 ? 'tariff' : 'open')
  },
  {
    id: 'tf2t',
    name: 'Tit-for-two-tats',
    description: 'Retaliates only after two tariffs in a row.',
    play: (_m, t) => (t.length >= 2 && t[t.length - 1] === 'tariff' && t[t.length - 2] === 'tariff' ? 'tariff' : 'open')
  },
  {
    id: 'grudger',
    name: 'Grudger',
    description: 'Opens until the other side tariffs once, then tariffs forever.',
    play: (_m, t) => (t.includes('tariff') ? 'tariff' : 'open')
  },
  {
    id: 'always',
    name: 'Always tariff',
    description: 'Imposes tariffs every round, whatever happens.',
    play: () => 'tariff'
  },
  {
    id: 'never',
    name: 'Never retaliate',
    description: 'Keeps trade open every round, whatever happens.',
    play: () => 'open'
  }
];

/** mulberry32: a small, fast, seedable PRNG. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Match {
  a: Move[];
  b: Move[];
  /** Points scored each round. */
  pa: number[];
  pb: number[];
}

/** Play `rounds` rounds; with probability `noise` each intended move is flipped (a misread or a mistake). */
export function playMatch(sa: Strategy, sb: Strategy, rounds: number, noise: number, seed: number): Match {
  const rand = rng(seed);
  const flip = (m: Move): Move => (rand() < noise ? (m === 'open' ? 'tariff' : 'open') : m);
  const m: Match = {a: [], b: [], pa: [], pb: []};
  for (let i = 0; i < rounds; i++) {
    const x = flip(sa.play(m.a, m.b, rand));
    const y = flip(sb.play(m.b, m.a, rand));
    m.a.push(x);
    m.b.push(y);
    m.pa.push(PAYOFF[x][y]);
    m.pb.push(PAYOFF[y][x]);
  }
  return m;
}

/**
 * Round-robin (every strategy plays every strategy, itself included), averaged over `reps`
 * seeds. Returns points per round, so 3 means "as good as permanent open trade".
 */
export function tournament(strategies: Strategy[], rounds: number, noise: number, reps: number): {strategy: Strategy; perRound: number}[] {
  const total = new Map(strategies.map(s => [s.id, 0]));
  let games = 0;
  for (let r = 0; r < reps; r++) {
    for (let i = 0; i < strategies.length; i++) {
      for (let j = 0; j < strategies.length; j++) {
        const m = playMatch(strategies[i], strategies[j], rounds, noise, 1000 * r + 31 * i + j + 1);
        total.set(strategies[i].id, total.get(strategies[i].id)! + m.pa.reduce((s, p) => s + p, 0));
      }
    }
    games += strategies.length;
  }
  return strategies
    .map(s => ({strategy: s, perRound: total.get(s.id)! / (games * rounds)}))
    .sort((x, y) => y.perRound - x.perRound);
}
