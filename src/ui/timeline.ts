import {nowIndex, type Step} from '../data/timeline';
import {fmtDate, fmtMonth} from './format';

export interface TimelineState {
  steps: Step[];
  index: number;
  playing: boolean;
  delayMs: number;
}
export interface TimelineCallbacks {
  onIndex: (i: number) => void;
  onPlay: (playing: boolean) => void;
  onDelay: (ms: number) => void;
}

const DELAYS = [500, 1000, 2000, 4000];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Relative horizontal room per step kind: the yearly stretch is compressed, months get space. */
const WEIGHT: Record<Step['kind'], number> = {year: 0.55, month: 1, now: 1, future: 0.6};

/** Fractional x-position (0..1) of every step, by cumulative weight. */
function positions(steps: Step[]): number[] {
  const w = steps.map(s => WEIGHT[s.kind]);
  const total = w.reduce((a, b) => a + b, 0) - w[0];
  const out: number[] = [];
  let acc = 0;
  for (let i = 0; i < steps.length; i++) {
    out.push(acc / total);
    acc += w[i + 1] ?? 0;
  }
  return out;
}

/** Contiguous runs of steps that share a header label (a year, or "Scheduled"). */
function headerSpans(steps: Step[], pos: number[]): {label: string; from: number; to: number; kind: string}[] {
  const spans: {label: string; from: number; to: number; kind: string}[] = [];
  steps.forEach((s, i) => {
    const label = s.kind === 'year' ? 'yearly' : s.kind === 'future' ? 'Scheduled' : s.date.slice(0, 4);
    const last = spans.at(-1);
    if (last && last.label === label) last.to = pos[i];
    else spans.push({label, from: pos[i], to: pos[i], kind: s.kind});
  });
  return spans;
}

/** Build the bar once; later calls only update the moving parts. */
export function renderTimeline(el: HTMLElement, st: TimelineState, cb: TimelineCallbacks) {
  const pos = positions(st.steps);
  if (!el.dataset.built) {
    const heads = headerSpans(st.steps, pos)
      .map(h => {
        const firstMonthly = st.steps.find(s => s.kind !== 'year')!;
        const text = h.kind === 'year' ? `${st.steps[0].label}–${Number(firstMonthly.date.slice(0, 4)) - 1}` : h.label;
        return `<span class="head ${h.kind}" style="left:${h.from * 100}%;width:${(h.to - h.from) * 100}%"><b>${text}</b></span>`;
      })
      .join('');
    const ticks = st.steps
      .map((s, i) => {
        const label = s.kind === 'year' ? (i % 2 === 0 ? s.label : '') : s.kind === 'month' ? MONTHS[Number(s.date.slice(5, 7)) - 1] : s.label;
        const title = s.events ? ` title="${s.events.map(e => `${e.kind}: ${e.title}`).join('\n').replace(/"/g, '&quot;')}"` : '';
        return `<span class="tick ${s.kind}" style="left:${pos[i] * 100}%" data-i="${i}"${title}><i></i><b>${label}</b></span>`;
      })
      .join('');
    el.innerHTML = `
      <button class="play" data-play aria-label="Play"></button>
      <select class="delay" data-delay aria-label="Step delay">${DELAYS.map(d => `<option value="${d}">${d / 1000}s</option>`).join('')}</select>
      <div class="track" data-track role="slider" tabindex="0" aria-label="Date" aria-valuemin="0" aria-valuemax="${st.steps.length - 1}">
        <div class="heads">${heads}</div>
        <div class="rail"><div class="rail-past" data-past></div><div class="rail-future" data-future></div></div>
        <div class="ticks">${ticks}</div>
        <div class="thumb" data-thumb></div>
      </div>
      <div class="asof" data-asof></div>
      <div class="credit">© ${new Date().getUTCFullYear()} <a href="https://matthewpurdon.me" rel="author">matthewpurdon.me</a></div>`;
    el.dataset.built = '1';

    // Pointer scrubbing: nearest step to the pointer's x within the track.
    const track = el.querySelector<HTMLDivElement>('[data-track]')!;
    const nearest = (clientX: number) => {
      const r = track.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
      let best = 0;
      pos.forEach((p, i) => { if (Math.abs(p - x) < Math.abs(pos[best] - x)) best = i; });
      return best;
    };
    let dragging = false;
    track.addEventListener('pointerdown', e => { dragging = true; track.setPointerCapture(e.pointerId); cb.onIndex(nearest(e.clientX)); });
    track.addEventListener('pointermove', e => { if (dragging) cb.onIndex(nearest(e.clientX)); });
    track.addEventListener('pointerup', () => { dragging = false; });
    track.addEventListener('pointercancel', () => { dragging = false; });
    track.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); cb.onIndex(st.index - 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); cb.onIndex(st.index + 1); }
      if (e.key === 'Home') cb.onIndex(0);
      if (e.key === 'End') cb.onIndex(nowIndex(st.steps));
    });
    el.querySelector<HTMLButtonElement>('[data-play]')!.addEventListener('click', () => cb.onPlay(!el.classList.contains('playing')));
    el.querySelector<HTMLSelectElement>('[data-delay]')!.addEventListener('change', e => cb.onDelay(Number((e.target as HTMLSelectElement).value)));
  }

  const step = st.steps[st.index];
  const x = pos[st.index] * 100;
  const nowX = pos[nowIndex(st.steps)] * 100;
  el.classList.toggle('playing', st.playing);
  el.classList.toggle('in-future', step.kind === 'future');
  el.querySelector<HTMLDivElement>('[data-thumb]')!.style.left = `${x}%`;
  el.querySelector<HTMLDivElement>('[data-past]')!.style.width = `${Math.min(x, nowX)}%`;
  el.querySelector<HTMLDivElement>('[data-future]')!.style.left = `${nowX}%`;
  el.querySelector<HTMLDivElement>('[data-track]')!.setAttribute('aria-valuenow', String(st.index));
  el.querySelector<HTMLDivElement>('[data-track]')!.setAttribute('aria-valuetext', step.kind === 'now' ? 'Now' : fmtDate(step.date));
  el.querySelector<HTMLSelectElement>('[data-delay]')!.value = String(st.delayMs);
  el.querySelector<HTMLButtonElement>('[data-play]')!.setAttribute('aria-label', st.playing ? 'Pause' : 'Play');
  const title = step.kind === 'now' ? 'Now' : step.kind === 'year' ? `End of ${step.label}` : step.kind === 'future' ? 'Scheduled' : fmtMonth(step.date);
  el.querySelector('[data-asof]')!.innerHTML = `<b>${title}</b><span>${step.kind === 'future' ? 'from' : 'as of'} ${fmtDate(step.date)}</span>`;
  el.querySelectorAll<HTMLElement>('.tick').forEach((t, i) => t.classList.toggle('current', i === st.index));
}
