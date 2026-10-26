# Planner update

## Implemented

| Area                      | Available behavior                                                                                                                                                                                                                                             |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recipes                   | Per-person favourites and cook-soon lists; family-authored recipes with pasted ingredients/method and source links; adjustable servings.                                                                                                                       |
| Meal planning             | Copy previous week with a preview and optional replacement; save/reuse named templates; leftovers/eating-out notes.                                                                                                                                            |
| Shopping                  | Every planned serving contributes to quantities; compatible units combine; review cupboard items and edit required amounts before saving. Checking/unchecking updates immediately while shared saves complete, with failure rollback and rapid-tap protection. |
| Event coordination        | Separate drop-off/pickup people; bring-along checklists with completion per occurrence; responsibilities in the daily agenda and weekly preparation view.                                                                                                      |
| Routines and rewards      | Selected weekdays, term dates and holiday pauses; ordered morning/after-school/bedtime steps; shared-tablet child view; star goals, reserved requests and owner approval.                                                                                      |
| Family preparation        | Next-seven-days meal and event review; family timezone, weekly digest schedule, quiet hours and relevant change alerts; per-device one-hour notification pause.                                                                                                |
| Discussions and documents | Event-specific or whole-series comments, plus attached document links. Shared comment authors and activity authors are assigned by the server.                                                                                                                 |
| Recurring events          | Skip dates and holiday ranges; move one occurrence by excluding its original date and saving a separate event atomically; Google/ICS excluded dates.                                                                                                           |
| Notice import             | Paste a school notice or load a text/email file; review extracted dates/times and original text before saving; relative-date warnings and duplicate checks.                                                                                                    |
| Spending                  | NZD expense log, monthly/category totals, optional budget, edits/undo, and CSV export.                                                                                                                                                                         |
| Search                    | Ranked title/content matches, accent handling, missed/extra/swapped-letter tolerance, common synonyms, person/location/ingredient/note matching, category filters, tomorrow/today/week and overdue queries. Search indexing is reused between keystrokes.      |
| Phone push                | Authenticated server-sent test endpoint restricted to the signed-in person's registered device; rate limiting; expired-subscription cleanup; notification links open the affected event or chore.                                                              |

Existing family files remain valid: new shared collections and settings are optional. Shared mutations, offline replay and JSON backup/restore use the extended schema. Deleting an event also removes its discussion/links; undo restores the related records.

## Verification

The production build, lint and TypeScript checks passed. Automated verification includes 163 unit tests and 92 browser checks across desktop, mobile and signed-in use. Browser coverage includes delayed shopping saves and failure rollback, misspelled searches, notification registration and the server-test request, custom recipe editing, both colour themes and accessibility checks for the new family tools. These checks do not establish delivery to a physical phone.

## Shared database rollout

For an existing Supabase project, run [update-planner.sql](../supabase/update-planner.sql). It updates validation, shared mutations, server-authored activity, reward rules and per-device reminder pauses. It does not replace saved plans or account memberships. The migration is generated by `node --import tsx scripts/db-schema.ts` and is tested by applying it twice to an existing family.

For a new project, use the complete [schema.sql](../supabase/schema.sql).

## Phone notification rollout

The deployed app URL listed in this repository is `https://kinfolk-graham.vercel.app`. Its public `/api/push/config` endpoint was checked during this work and returned `configured: false`. This establishes that live background push is not configured; browser tests do not establish delivery to a physical phone.

A fresh VAPID key pair and cron secret were generated in **`.env.push.local`**. This file is ignored by Git and should stay private. Do not regenerate the keys after phones subscribe: changing keys requires devices to subscribe again.

1. Add the four values in `.env.push.local` to the app's production hosting environment. The production server also needs its existing Supabase URL and server secret/service-role key. Redeploy after configuring the environment.
2. Apply the database upgrade above.
3. Set the Supabase Vault secrets and run [schedule-reminders.sql](../supabase/schedule-reminders.sql), following the existing [README setup](../README.md#enable-phone-reminders). The scheduler must run each minute; a successful notification test does not itself prove the scheduler is running.
4. Check `/api/push/config` now returns `configured: true`.
5. Sign into the shared family on the phone and enable reminders in Settings. For iPhone/iPad, add the app to the Home Screen and open that installed app before requesting permission. [WebKit requirements](https://webkit.org/blog/13878/).
6. Choose **Send test notification**. Shared families now send this from the server through the push provider. The UI reports provider acceptance and asks the user to check the notification centre; it does not claim the OS displayed it.
7. Create an event with a reminder a few minutes ahead, close the app, and confirm arrival on the phone. Tap the notification and confirm it opens that event. Repeat for each device.

Vercel and Supabase integrations were discovered but were not connected at the time of verification. Production configuration, migration, scheduling and deployment have not been performed from this workspace.

## Scope boundaries

- The child view simplifies a supervised shared tablet. It is not a restricted child login or a separate authorization system.
- Documents are attached by http/https link. Binary file storage and full mailbox access are not enabled.
- Notice import handles text and email source files. It does not claim OCR of photographs/PDFs or autonomous email reading.
- Family recipes accept pasted ingredients and method steps. They do not scrape arbitrary websites.
- Amounts that cannot be combined safely remain explicit text expressions for review. Pantry use is recorded explicitly rather than automatically deducted.
- Expenses are a household record; there are no bank connections, transfers or payment execution.

These versions cover the ten prioritized workflow areas. Larger extensions named as later options in the research remain separate work, rather than being presented as completed capabilities.
