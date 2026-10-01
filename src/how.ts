import type {Meta} from './data/types';
import {daysSince, isStale, nextCheck, STALE_DAYS} from './data/schedule';
import {fmtDate} from './ui/format';

document.querySelector('[data-year]')!.textContent = String(new Date().getUTCFullYear());

const $k = (k: string) => document.querySelector<HTMLElement>(`[data-k="${k}"]`)!;
const set = (k: string, html: string) => { $k(k).innerHTML = html; };

const ago = (days: number) => (days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`);
const fmtWhen = (d: Date) =>
  d.toLocaleString('en-US', {weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC'}) + ' UTC';

/** The check record is agent-written; only trust pull request links on this repository. */
const PR_URL = /^https:\/\/github\.com\/mpurdon\/tariffmap\/pull\/(\d+)$/;

type Tone = 'ok' | 'warn' | 'info' | 'muted';
const chip = (tone: Tone, text: string) => `<span class="chip ${tone}">${text}</span>`;
const setState = (tone: Tone, text: string) => { const el = $k('state'); el.className = `chip ${tone}`; el.textContent = text; };

/** Whether the check's PR has merged, from GitHub's public API (best effort; falls back to the recorded outcome). */
async function prMerged(num: string): Promise<boolean | null> {
  try {
    const r = await fetch(`https://api.github.com/repos/mpurdon/tariffmap/pulls/${num}`, {headers: {accept: 'application/vnd.github+json'}});
    if (!r.ok) return null;
    return Boolean((await r.json()).merged);
  } catch {
    return null;
  }
}

async function render(meta: Meta) {
  const check = meta.lastCheck;
  const checkedAt = check?.checkedAt ?? meta.actionsVerifiedThrough;
  const days = daysSince(checkedAt);
  const stale = isStale(checkedAt);
  const next = nextCheck();

  // Headline: the one question a visitor arrives with — is this current?
  if (stale) setState('warn', 'Check overdue'); else setState('ok', 'Up to date');
  set('ago', `Sources checked <b>${ago(days)}</b>`);
  set('when', `${fmtDate(checkedAt)} · next check ${fmtWhen(next)}${stale ? ` · overdue after ${STALE_DAYS} days` : ''}`);

  // The weekly rhythm as a track: last check → next check, with today on it.
  const from = Date.parse(checkedAt);
  const span = next.getTime() - from;
  const pct = Math.max(0, Math.min(100, ((Date.now() - from) / span) * 100));
  const cycle = $k('cycle');
  cycle.hidden = false;
  cycle.classList.toggle('stale', stale);
  cycle.style.setProperty('--now', `${pct}%`);
  set('from', `Last check · ${fmtDate(checkedAt)}`);
  set('to', `Next · ${next.toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC'})}`);

  // Receipt: labels hard left, values hard right; colour only where the data says so.
  const pr = check?.pullRequest?.match(PR_URL)?.[1];
  const link = pr ? ` <a href="${check!.pullRequest}">PR #${pr} ↗</a>` : '';
  const outcome = !check
    ? chip('muted', 'Not recorded')
    : check.outcome === 'no-changes'
      ? chip('muted', 'No changes needed')
      : check.outcome === 'manual'
        ? chip('muted', 'Manual review')
        : chip('info', 'Changes proposed') + link;
  set('outcome', outcome);
  set('reverified', check?.reverified != null ? String(check.reverified) : '—');
  set('verified', fmtDate(meta.actionsVerifiedThrough));
  set('count', String(meta.counts.actions));
  set('built', `${fmtDate(meta.builtAt.slice(0, 10))} · ${meta.builtAt.slice(11, 16)} UTC`);

  if (check?.outcome === 'changes-proposed' && pr) {
    const merged = await prMerged(pr);
    if (merged !== null) set('outcome', (merged ? chip('ok', 'Changes merged') : chip('info', 'Awaiting review')) + link);
  }
}

fetch('/data/meta.json')
  .then(r => (r.ok ? (r.json() as Promise<Meta>) : Promise.reject(new Error(String(r.status)))))
  .then(render)
  .catch(() => {
    setState('muted', 'Unavailable');
    set('ago', 'Live status is unavailable right now.');
  });
