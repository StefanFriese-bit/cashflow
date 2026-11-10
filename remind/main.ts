// Runs every morning inside the PRIVATE data repository (GitHub Actions), from a checkout of that repository.
// Reads data.json and push/*.json, sends each device its notice, and notes the day so it sends once a day.
import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
// @ts-ignore — installed by the workflow
import * as wp from 'web-push';
const webpush: any = (wp as any).default ?? wp;
import { upgrade } from '../src/engine/merge';
import { todayUK } from '../src/engine/dates';
import { morningMessage } from '../src/engine/remind';

const SENT = 'push/sent.json';
const KEYS = '.reminders/vapid.json';

function londonHour(d = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hour12: false }).format(d));
}

async function main() {
  const force = process.env.FORCE === 'true';
  const today = process.env.TODAY || todayUK(); // TODAY: for testing only
  if (!force && londonHour() < 8) return console.log(`Too early in the UK (${londonHour()}:00) — the next run sends.`);
  const sent = existsSync(SENT) ? JSON.parse(readFileSync(SENT, 'utf8')) : {};
  if (!force && sent.date === today) return console.log(`Already sent today (${today}).`);
  const state = upgrade(JSON.parse(readFileSync('data.json', 'utf8')));
  const keys = JSON.parse(readFileSync(KEYS, 'utf8'));
  webpush.setVapidDetails('https://stefanfriese-bit.github.io/cashflow/', keys.publicKey, keys.privateKey);
  const files = existsSync('push') ? readdirSync('push').filter((f) => f.endsWith('.json') && f !== 'sent.json') : [];
  let n = 0;
  for (const f of files) {
    const dev = JSON.parse(readFileSync(`push/${f}`, 'utf8'));
    const msg = morningMessage(state, today, { person: dev.person, scope: dev.scope || 'mine' });
    const who = `${state.people[dev.person]?.name || dev.person}'s ${dev.device}`;
    if (!msg) {
      console.log(`${who}: nothing due`);
      continue;
    }
    try {
      await webpush.sendNotification(dev.subscription, JSON.stringify(msg), { TTL: 60 * 60 * 12, urgency: 'normal' });
      n++;
      console.log(`${who}: sent "${msg.title}"`);
    } catch (e: any) {
      if (e?.statusCode === 404 || e?.statusCode === 410) {
        console.log(`${who}: the device no longer accepts notifications — removed`);
        unlinkSync(`push/${f}`);
      } else console.log(`${who}: failed (${e?.statusCode || e?.message})`);
    }
  }
  writeFileSync(SENT, JSON.stringify({ date: today, sent: n, devices: files.length }, null, 1));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
