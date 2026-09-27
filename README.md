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
6. Open **Family settings**, create an account, confirm the email and sign in. Select **Share this family space** to upload the plans you see.
7. The person who created the space can choose **Create invite code**. A family member creates their own account and enters this code under **Join family space**. Share it privately.

Plans refresh every 15 seconds and when a window regains focus. Changes are applied as atomic operations to the latest household document, so changes to different records do not overwrite each other. Changes to the same record use the last saved version. Failed saves are reported and must be retried; cloud mode does not claim to queue changes offline.

Access is restricted to household members. Direct client writes are disabled; authenticated database functions check membership and validate the resulting document. Invite codes contain 192 bits of randomness, are stored hashed, and expire after seven days. A new code invalidates the previous one. Every signed-in household member can edit shared plans; only the household creator can create invitations. Accounts currently belong to one household. Household membership administration is done in Supabase; local family profiles are organisational labels, not access-control roles.

When you sign out, the app returns to the browser’s separate local family space. Shared data is not copied into the local planner storage. Backups can be exported in either mode; sign out before restoring locally.

Before relying on a live shared deployment, check with two separate accounts that an invited member can read and edit the same plan and an unrelated account cannot read the household or execute its mutations. Verify invite expiry, invalid codes, and reconnect behaviour in your Supabase project.

## Storage and scope

- Local plans use `localStorage` under `kinfolk-planner-v1`. They persist through reloads and update other tabs on the same browser origin. Clearing browser data removes them; download regular backups.
- Dates and times represent local household wall-clock time, without travel-time-zone conversion. Calendar exports use floating local times. Overnight events are not supported.
- Reminders appear inside the app. Push notifications, email reminders and two-way Google/Outlook calendar sync are not implemented.
- The recipe library is curated. Custom recipes, dietary/allergy verification and nutrition calculations are not implemented. Food photographs are illustrative.
- The home-screen manifest supports adding a shortcut. A service worker and offline app-shell caching are not included.
- The default data is fictional, dated relative to the first time you open the app. No real family information is included in the repository.

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
