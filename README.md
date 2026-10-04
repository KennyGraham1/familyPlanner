# Kinfolk — a little more together

A warm, responsive family planner.sßßß It works immediately with editable example data and browser storage. Add the included Supabase backend to share plans between family members on different devices.

## Run locally

Use Node.js 22 or later.

```sh
npm install
npm run dev
```

Open [localhost:3000](http://localhost:3000). Visit **Family settings** to rename the example family, edit its members, and choose the start of the week. **Clear plans** removes the example events and lists while retaining your family profiles; it asks you to confirm first.

## What works

- **Family overview:** today’s agenda, chores, dinner, shopping, and a pinned family note.
- **Calendar:** week, month and agenda views; individual family filters; add, edit and delete events; weekly recurrence; locations and notes; `.ics` export. Editing a recurring event changes the entire series.
- **Meals:** breakfast, lunch and dinner slots; weekly navigation; six complete recipes; ingredient checklists and cooking steps; add or swap a meal; add missing ingredients to shopping.
- **Shopping:** categorised lists; quick entry; quantities; search; mark items bought; clear bought items; text-file export. Existing unchecked ingredients are not duplicated. Quantities are not automatically combined when planning repeated meals.
- **Chores:** assignments, due dates, overdue indicators, priority, progress, and completed-item filters.
- **Family board:** editable coloured notes, authors, and pinning.
- **Personalisation:** family name, member names, roles, colours, emoji and default greeting.
- **Useful extras:** global search (`⌘K` / `Ctrl+K`), in-app reminders, keyboard-accessible dialogs, responsive navigation, JSON backup and validated restore, and a home-screen manifest.

Fonts and images are served from the project. No third-party image or font requests are required to use the app.

## Deploy to Vercel

1. Push this project to your Git repository.
2. In Vercel, choose **Add New → Project**, then import the repository.
3. Keep the **Next.js** framework preset, project root, default output directory and `npm run build` build command. Select a supported Node.js LTS version of 22 or newer.
4. Deploy. No environment variables are needed for the local-storage version.
5. For shared family accounts, follow the Supabase setup below, add the two environment variables in Vercel, and redeploy.

Vercel provides the supported [Next.js deployment configuration](https://vercel.com/docs/frameworks/full-stack/nextjs) and [Node.js runtime options](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions). The app does not write data to Vercel’s filesystem.

## Enable private family sharing

This integration is implemented but **requires your own Supabase project and has not been exercised against a live project in this workspace**. All local functionality works without it.

1. Create a Supabase project.
2. Open its **SQL Editor** and run [`supabase/schema.sql`](supabase/schema.sql). It creates the tables, validation functions, access policies and invite functions. Supabase’s `pgcrypto` and `pg_jsonschema` extensions are used.
3. Find the project URL and **anon/public** API key in the project settings. Create `.env.local` from `.env.example`:

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-public-anon-key
   ```

   These values are intentionally public. Do not put a service-role key in either variable; household access is enforced in the database.

4. In **Authentication → URL Configuration**, set the Site URL to your deployed address. Add `http://localhost:3000` and your deployed address to allowed redirect URLs as appropriate. Enable email/password authentication; keep email confirmation enabled. Configure Supabase email delivery for production use.
5. Add the same two values under **Vercel → Project → Settings → Environment Variables**, then redeploy. Next.js embeds public variables at build time. Restart the development server after changing them locally.
6. Open the app. It now starts on a sign-in screen: choose **Create account**, confirm the email and sign in. Then enter your name and family name to create your family space. You start as its only member; add everyone else from the sidebar or **Family settings**.
7. The person who created the space can choose **Create invite code**. A family member creates their own account and enters this code under **Join family space**. Share it privately.

Open apps update live: Supabase Realtime notifies every family member's app when plans change, and each fetches the latest version within about a second. If the live connection drops, the app checks every 15 seconds and whenever it returns to the screen. The status line at the bottom of each page says "Live" while connected. Changes are applied as atomic operations to the latest household document, so changes to different records do not overwrite each other. Changes to the same record use the last saved version. Failed saves are reported and must be retried; cloud mode does not claim to queue changes offline.

Access is restricted to household members. Direct client writes are disabled; authenticated database functions check membership and validate the resulting document. Invite codes contain 192 bits of randomness, are stored hashed, and expire after seven days. A new code invalidates the previous one. Every signed-in household member can edit shared plans; only the household creator can create invitations. Accounts currently belong to one household. Household membership administration is done in Supabase; local family profiles are organisational labels, not access-control roles.

When Supabase is configured, the planner is only available to signed-in members; signing out returns to the sign-in screen. Without Supabase, the app starts with the same family setup and saves plans in this browser only. Backups can be exported in either mode; restoring a backup is only available in a browser-only family space.

Before relying on a live shared deployment, check with two separate accounts that an invited member can read and edit the same plan and an unrelated account cannot read the household or execute its mutations. Verify invite expiry, invalid codes, and reconnect behaviour in your Supabase project.

## Enable phone reminders

Reminders are sent as push notifications, even when the planner is closed. Supabase Cron calls `/api/reminders/send` every minute; the app works out what is due for each device and sends it. This works on Vercel Hobby.

1. Generate keys (once): `npm run setup:push -- https://kinfolk-graham.vercel.app`. This writes `.env.push.local` (ignored by Git) with `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` and `CRON_SECRET`. Keep it private.
2. In **Vercel → Project → Settings → Environment Variables** (Production), add those four values and `SUPABASE_SECRET_KEY` (Supabase → **Project Settings → API Keys** → secret key). These are server-only: never prefix them with `NEXT_PUBLIC_`. Redeploy.
3. Check `https://kinfolk-graham.vercel.app/api/push/config` shows `"configured":true`.
4. In the Supabase **SQL Editor**, store the address and secret in Vault, using the same `CRON_SECRET` as Vercel:

   ```sql
   select vault.create_secret('https://kinfolk-graham.vercel.app', 'kinfolk_site_url');
   select vault.create_secret('<your CRON_SECRET>', 'kinfolk_cron_secret');
   ```

5. Run [`supabase/schedule-reminders.sql`](supabase/schedule-reminders.sql) (after `schema.sql`). It turns on `pg_cron` and `pg_net` and schedules the job. Running it again updates the same job.
6. On each phone or computer: **Family settings → Phone reminders → Enable on this device**. On iPhone or iPad (iOS 16.4+), first open the site in Safari, choose **Share → Add to Home Screen**, and enable reminders from the installed app.

Each device chooses its own reminders: its owner's or the whole family's, events (at the start or 5–60 minutes before) and a daily reminder for due chores. All-day events are reminded at 08:00 and multi-day events once, before their first day. A reminder is never sent twice to the same device.

To check it is running, look at **Integrations → Cron** in Supabase, or run `select status_code, content from net._http_response order by created desc limit 5;` — a working run returns status 200 with counts such as `{"sent":1,...}`. To change the secret, update `CRON_SECRET` in Vercel and `kinfolk_cron_secret` in Vault together.

## Storage and scope

- Local plans use `localStorage` under `kinfolk-planner-v1`. They persist through reloads and update other tabs on the same browser origin. Clearing browser data removes them; download regular backups.
- Dates and times represent local household wall-clock time, without travel-time-zone conversion. Calendar exports use floating local times. Events can be all day, span several days (including overnight) and repeat weekly, every two weeks, monthly or yearly.
- Event locations can be searched as you type. Suggestions come from [Photon](https://photon.komoot.io) (OpenStreetMap data, no API key): what you type in **Where?** is sent to that service. A chosen place is shown on an OpenStreetMap map, and **Open in Maps** opens directions in Google Maps. Typed text is saved even if search is unavailable.
- Reminders appear inside the app and, once set up, as phone notifications (see above). Email reminders and two-way Google/Outlook calendar sync are not implemented.
- The recipe library is curated. Custom recipes, dietary/allergy verification and nutrition calculations are not implemented. Food photographs are illustrative.
- The home-screen manifest supports installing the app. Its service worker only shows reminders; it does not cache pages, so the planner needs a connection.
- New families start empty. The fictional sample family in `src/lib/data.ts` is only used by the tests. No real family information is included in the repository.

## Checks

```sh
npm test                 # date, recurrence, validation and mutation tests
npm run typecheck        # TypeScript
npm run lint             # ESLint
npm run build            # production build
npx playwright install chromium
npm run test:e2e         # desktop and mobile workflows
```

The browser suite covers events, validation, persistence, meal-to-shopping integration, chores, notes, settings, backup restore, mobile overflow, modal focus and dashboard WCAG AA checks. `node scripts/review.mjs` additionally captures every screen at desktop and mobile sizes and checks all desktop views with axe. Start the development server first for that script. Local review artifacts are excluded from Git.

## Project map

```text
src/app/                 Next.js entry, metadata and responsive styling
src/components/          Planner screens, forms, shared UI and data provider
src/lib/data.ts          Schemas, calendar logic, recipes and example data
src/lib/cloud.ts         Optional Supabase client
supabase/schema.sql      Shared storage, validation, access rules and invitations
tests/                   Unit and Playwright tests
public/                  Local fonts, photography, illustration and app icon
docs/                    Research and visual-asset notes
```

The concept draws on [Cozi’s colour-coded family calendar and recipe-to-shopping workflow](https://www.cozi.com/feature-overview/) and [FamilyWall’s combined family dashboard, lists and meal planning](https://www.familywall.com/en/index.html). The branding and interface are original. See [research and artwork notes](docs/design-notes.md) for sources and the generated illustration prompt.
