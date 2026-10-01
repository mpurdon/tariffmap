import type {Meta} from './data/types';
import {fmtDate} from './ui/format';

const OUTCOME: Record<string, string> = {
  'no-changes': 'No changes needed',
  'changes-proposed': 'Changes proposed for review',
  manual: 'Manual review'
};

document.querySelector('[data-year]')!.textContent = String(new Date().getUTCFullYear());

/** The check record is agent-written; only link to pull requests on GitHub. */
const prLink = (url?: string | null) => (url && /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+$/.test(url) ? ` · <a href="${url}">pull request</a>` : '');

const set = (k: string, html: string) => { document.querySelector(`[data-k="${k}"]`)!.innerHTML = html; };

fetch('/data/meta.json')
  .then(r => (r.ok ? (r.json() as Promise<Meta>) : Promise.reject(new Error(String(r.status)))))
  .then(meta => {
    const check = meta.lastCheck;
    set('checked', check ? fmtDate(check.checkedAt) : 'No completed check recorded');
    set('outcome', check
      ? `${OUTCOME[check.outcome] ?? check.outcome}${prLink(check.pullRequest)}${check.reverified ? ` · ${check.reverified} entries re-verified` : ''}`
      : '—');
    set('verified', fmtDate(meta.actionsVerifiedThrough));
    set('count', String(meta.counts.actions));
    set('built', fmtDate(meta.builtAt.slice(0, 10)));
  })
  .catch(() => document.getElementById('status')!.insertAdjacentHTML('afterend', '<p class="note">Live status is unavailable right now.</p>'));
