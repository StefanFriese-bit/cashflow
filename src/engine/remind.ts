import { diffDays, nice } from './dates';
import { money } from './money';
import { dueSoon, notTicked } from './plan';
import type { Occ, State } from './types';

export interface PushTarget {
  person: string;
  scope: 'mine' | 'all';
}

export interface PushMessage {
  title: string;
  body: string;
  tag: string;
  url: string;
  count: number;
}

function when(o: Occ, today: string): string {
  const n = diffDays(o.date, today);
  return n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : nice(o.date);
}

/** The morning notice for one device, or null when there is nothing to say. */
export function morningMessage(state: State, today: string, target: PushTarget): PushMessage | null {
  const mine = (o: Occ) => target.scope === 'all' || o.item.person === target.person;
  const due = dueSoon(state, today).filter(mine);
  const late = notTicked(state, today).filter((o) => mine(o) && o.item.remind && diffDays(today, o.date) <= 14);
  if (!due.length && !late.length) return null;
  const name = (o: Occ) => (target.scope === 'all' && state.people[o.item.person] ? `${o.item.name}` : o.item.name);
  const lines = due.slice(0, 5).map((o) => `${when(o, today)} · ${name(o)} ${money(o.amount, o.item.currency)}`);
  if (due.length > 5) lines.push(`and ${due.length - 5} more`);
  if (late.length) lines.push(`${late.length} earlier payment${late.length > 1 ? 's' : ''} not ticked off yet`);
  let title: string;
  if (due.length === 1) {
    const w = when(due[0], today);
    title = `${due[0].item.name} due ${w === 'Today' || w === 'Tomorrow' ? w.toLowerCase() : 'on ' + w}`;
  }
  else if (due.length > 1) {
    const total = due.reduce((s, o) => s - o.gbp, 0);
    title = `${due.length} payments due soon · ${money(total)}`;
  } else title = 'Did these go out?';
  return { title, body: lines.join('\n'), tag: `due-${today}`, url: './#/today', count: due.length + late.length };
}
