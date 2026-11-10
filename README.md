# Cash flow

A household cash-flow web app for the phone and the laptop: every regular payment, week by week, who pays what,
loans and savings goals, a pop-up and a morning notification for payments due in the next days.

The plan itself is NOT in this repository. It lives in a separate private repository and each device reads and
writes it with its own access key. This repository only holds the app.

- `npm run dev` — work on it locally
- `npm test` / `npm run e2e` — checks (made-up household in `tests/fixture.ts`)
- `npm run build` — the site in `dist/`, plus `dist/remind.mjs`, the morning-reminder script that the private
  repository's daily job downloads and runs
