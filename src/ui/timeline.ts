import type {Step} from '../data/timeline';
import {fmtDate} from './format';

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

function monthTitle(iso: string): string {
  return new Date(iso + 'T00:00:00Z').toLocaleDateString('en-US', {month: 'long', year: 'numeric', timeZone: 'UTC'});
}

/** Build the bar once; later calls only update the moving parts. */
export function renderTimeline(el: HTMLElement, st: TimelineState, cb: TimelineCallbacks) {
  if (!el.dataset.built) {
    const ticks = st.steps
      .map((s, i) => {
        const pct = (i / (st.steps.length - 1)) * 100;
        const major = s.kind !== 'month' || /^\d{4}$/.test(s.label);
        return `<span class="tick ${s.kind}${major ? ' major' : ''}" style="left:${pct}%"><i></i><b>${s.label}</b></span>`;
      })
      .join('');
    el.innerHTML = `
      <button class="play" data-play aria-label="Play"></button>
      <select class="delay" data-delay aria-label="Step delay">${DELAYS.map(d => `<option value="${d}">${d / 1000}s</option>`).join('')}</select>
      <div class="track">
        <input type="range" data-range min="0" max="${st.steps.length - 1}" step="1" aria-label="Date" />
        <div class="ticks">${ticks}</div>
      </div>
      <div class="asof" data-asof></div>`;
    el.dataset.built = '1';
    el.querySelector<HTMLInputElement>('[data-range]')!.addEventListener('input', e => cb.onIndex(Number((e.target as HTMLInputElement).value)));
    el.querySelector<HTMLButtonElement>('[data-play]')!.addEventListener('click', () => cb.onPlay(!el.classList.contains('playing')));
    el.querySelector<HTMLSelectElement>('[data-delay]')!.addEventListener('change', e => cb.onDelay(Number((e.target as HTMLSelectElement).value)));
  }
  const step = st.steps[st.index];
  el.classList.toggle('playing', st.playing);
  el.querySelector<HTMLInputElement>('[data-range]')!.value = String(st.index);
  el.querySelector<HTMLSelectElement>('[data-delay]')!.value = String(st.delayMs);
  el.querySelector<HTMLButtonElement>('[data-play]')!.setAttribute('aria-label', st.playing ? 'Pause' : 'Play');
  const title = step.kind === 'now' ? 'Now' : step.kind === 'year' ? `End of ${step.label}` : monthTitle(step.date);
  el.querySelector('[data-asof]')!.innerHTML = `<b>${title}</b><span>as of ${fmtDate(step.date)}</span>`;
  el.querySelectorAll<HTMLElement>('.tick').forEach((t, i) => t.classList.toggle('current', i === st.index));
}
