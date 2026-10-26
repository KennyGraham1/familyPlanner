# Family planner research and feature roadmap

Research date: 26 October 2026. Product: Kinfolk.

## Recommendation

Build on the calendar, meals, shopping, and chores already in Kinfolk. The most useful next release would add **favourite recipes, reusable meal weeks, and clear pickup/drop-off responsibilities**. These address repeated family work and fit the existing app without adding another major section.

After that, improve ingredient quantities and pantry checks, then add school-day routines and a child-friendly view. Event discussions, document attachments, and importing school flyers are valuable, but require more infrastructure.

This ordering is my product and engineering assessment for this app, rather than a ranking published by the other products.

## Scope and evidence

I compared nine products using their official product pages, support documentation, release notes, and developer-published app listings. I also inspected Kinfolk's components, data schemas, reminder logic, shopping logic, and account controls. This is desk research and a code review; I did not sign into competitors or test their paid subscriptions. Published functionality does not establish reliability or prove that a feature will improve this family's habits.

The comparison includes general family organizers, specialist meal planners, a household display, and a co-parenting app. Specialist products offer useful workflow examples without implying that Kinfolk should adopt their entire scope. Prices are omitted because tiers, currencies, and platform entitlements vary.

## What comparable apps offer

| Product        | Verified feature evidence                                                                                                                                                                                                                                                                                                                                                                                                         | What we can use in Kinfolk                                                                                                                                                        |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Cozi**       | Combines a person-coloured calendar, reminders, agenda emails, recipes, shopping, and multiple to-do lists. [Feature overview](https://www.cozi.com/feature-overview/), [calendar documentation](https://www.cozi.com/calendar/).                                                                                                                                                                                                 | Keep a clear daily overview. Add reusable packing and school-preparation checklists rather than a separate generic productivity system.                                           |
| **FamilyWall** | Documents Google/Outlook sync, recurring or alternating timetables, meal planning, a recipe box, documents, and household budgets. [Premium features](https://www.familywall.com/premium.html?lang=en).                                                                                                                                                                                                                           | Term-time schedules and school documents are a closer fit for us than another calendar view. Budgeting can remain a later extension.                                              |
| **TimeTree**   | Supports event comments and images; PDFs and spreadsheets can be attached through Premium. Its shared calendar also has search and event labels. [Comments and attachments](https://support.timetreeapp.com/hc/en-us/articles/203005559-How-to-attach-images-and-comment-events-after-creating-an-event), [shared calendar guide](https://support.timetreeapp.com/hc/en-us/articles/900004492623-How-to-use-shared-calendar-app). | Keep practical discussion next to an event: who is driving, what to bring, and the school notice. Kinfolk already has global search.                                              |
| **AnyList**    | Offers meal notes for leftovers or eating out, moving meals between dates, and ingredient selection before generating groceries. Its December 2025 release added reusable templates, a cooking queue, and pinned entries. [Meal planning](https://www.anylist.com/meal-planning), [release notes](https://help.anylist.com/articles/release-notes-anylist-dec-2025/).                                                             | Copy a useful week, keep favourite dishes close, and let a meal slot say “leftovers” without inventing a recipe.                                                                  |
| **Paprika**    | Its established recipe manager scales servings, combines grocery ingredients, tracks pantry items, and saves reusable menus. Pantry ingredients are initially unchecked when adding a recipe to groceries. [Features](https://www.paprikaapp.com/windows/), [Paprika 3 guide](https://www.paprikaapp.com/help/ios/).                                                                                                              | Add a “check the cupboard” step and accurate quantities before attempting automatic stock deduction.                                                                              |
| **Skylight**   | Separates routines from chores, supports selected weekdays and times of day, and saves common tasks for reuse. Sidekick can extract events from photos, PDFs, forwarded emails, or speech. [Tasks and routines](https://skylight.zendesk.com/hc/en-us/articles/45761249913499-Tasks-Routines-and-Chores), [Sidekick](https://skylight.zendesk.com/hc/en-us/articles/39335273393947-Skylight-Sidekick).                            | School-morning and bedtime routines are useful for the boys. A readable shared tablet display could reuse our overview; dedicated hardware is unnecessary for an initial version. |
| **S'moresUp**  | Its developer listing describes chore points, allowance management, recurring scheduling, reward approval, and completion reports. [Developer listing](https://play.google.com/store/apps/details?hl=en-US&id=com.rotation5.smoresup).                                                                                                                                                                                            | Extend our existing weekly stars with optional reward goals and parent approval. Stars themselves are already implemented.                                                        |
| **2houses**    | Provides schedule-change requests, shared child information, document storage, expense categories, and account-specific access rights. It is designed for separated households. [Official features](https://www.2houses.com/en/features/).                                                                                                                                                                                        | Borrow explicit responsibility and controlled access for caregivers. Custody schedules and financial settlement are outside our current requirements.                             |
| **Maple**      | Its email product describes selected-sender imports and extracting tasks/events from messages. Its official farewell page announces closure on **31 December 2026**. [Email workflow](https://www.growmaple.com/email), [closure notice](https://www.growmaple.com/farewell).                                                                                                                                                     | Use it as a workflow reference, not a service dependency. Preserve our existing backup/export options as features grow.                                                           |

Version distinction: Paprika's cited guide covers version 3. Its [version 4 open-beta announcement](https://www.paprikaapp.com/news/2026/09/28/paprika-4-is-now-in-open-beta/) describes newer functionality; beta-only additions are not treated here as established baseline features.

## What Kinfolk already has

These findings come from the repository, rather than competitor claims. They describe implemented code, not a check of production credentials or deployment configuration.

| Area                   | Present implementation                                                                                                                   | Remaining opportunity                                                                                                                                                           |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Calendar               | Week, month, year, agenda; person filters; recurring and multi-day events; overlap warnings; month event previews in this change.        | Responsibility separate from attendance; term exclusions; editing a single recurring occurrence.                                                                                |
| Integrations           | Google two-way sync implementation, calendar subscription links, and ICS export.                                                         | A broader integration is only justified by a family need. These existing capabilities require their service configuration.                                                      |
| Meals                  | Breakfast/lunch/dinner planning, recipe search, Ghanaian and lighter-meal filters, swapping meals, recipes with ingredients and methods. | Favourites, family-authored recipes, copy week/templates, leftovers, and adjustable servings.                                                                                   |
| Shopping               | Shared categorized list, aisle suggestions, duplicate-name avoidance, “Shop this week,” and purchased-item controls.                     | Ingredient amounts are text. Repeating a recipe does not currently multiply quantities; items with the same name are skipped rather than summed. There is no pantry inventory.  |
| Chores                 | Assignment, repeats, rotations, completion history, weekly stars, undo, and person filters.                                              | Ordered routines, selected weekdays, optional approvals, and redeemable goals.                                                                                                  |
| Notifications          | Today’s reminder panel, event/chore device preferences, shared push implementation, and a Sunday 6 pm week-ahead digest.                 | Change history, targeted “event changed” alerts, quiet hours, snooze, and configurable digest scheduling. A weekly digest is an enhancement opportunity, not a missing feature. |
| Family and reliability | Cloud household membership/ownership, invitations, shared edits, offline cache/outbox, backup/restore, themes, and install support.      | Dedicated child/caregiver permissions and a shared-tablet child view. A profile's displayed role is not itself an authorization boundary.                                       |

Relevant implementation: [data and schemas](../src/lib/data.ts), [meals](../src/components/meals.tsx), [shopping and chores](../src/components/lists.tsx), [reminders](../src/lib/reminders.ts), [household controls](../src/components/family-access.tsx), [offline changes](../src/lib/outbox.ts).

## Prioritized backlog

Effort is relative to this repository: **small** means a focused UI/preference change; **medium** spans shared data and several workflows; **large** adds a new subsystem, authorization rules, or an external service. These are scope estimates, not delivery promises.

| Order | Proposed feature                                         | Practical result                                                                                          | Effort                                                    |
| ----- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 1     | Recipe favourites and “cook soon”                        | Quickly find the Ghanaian dishes and other recipes the family uses most.                                  | Small for favourites; medium when shared across accounts. |
| 2     | Copy meal week and saved templates                       | Reuse a good week and swap only the meals that need changing.                                             | Medium                                                    |
| 3     | Pickup/drop-off responsibility and bring-along checklist | An event says which child attends, which adult handles each journey, and what to pack.                    | Medium                                                    |
| 4     | Servings, combined quantities, and cupboard review       | A week's groceries reflect how often dishes are cooked and let us remove items already at home.           | Large; deliver in stages.                                 |
| 5     | School-day routines and child view                       | The 10-year-old and 6-year-old see their own morning/bedtime steps with large checkboxes.                 | Medium for routines; large for restricted child access.   |
| 6     | Relevant change alerts and weekly preparation            | See who changed tomorrow's plans and review dinners, responsibilities, and missing preparations together. | Medium–large                                              |
| 7     | Event discussion and attachments                         | A school flyer and short family conversation stay with the right event.                                   | Large                                                     |
| 8     | Term schedules and individual exceptions                 | School routines pause for a holiday, and one lesson can move without changing the whole series.           | Large                                                     |
| 9     | Reviewable flyer/email import                            | Extract proposed dates and tasks from a notice, then review before saving.                                | Large; processing service and running costs.              |
| 10    | Simple household spending log                            | Optionally record grocery and school expenses with monthly category totals.                               | Large; lower priority for current needs.                  |

### 1. Favourite recipes

Add a working heart control to recipe cards and details, plus a “Favourites” filter beside Ghanaian, Lighter meals, and Quick & easy. Do not change a recipe's name or image to indicate a favourite.

Acceptance: favourites survive refresh; removing a favourite updates both views; the control exposes its selected state; searching within favourites works; an empty list explains how to save a recipe. Start with personal favourites. If shared family favourites are desired, represent them explicitly in shared data rather than presenting browser-only storage as synchronized.

A later step can add family recipe creation and web import, inspired by [AnyList's recipe collection](https://www.anylist.com/recipes). That requires persistent user recipes: the current catalogue is built into the app, and meal validation checks IDs against that catalogue.

### 2. Reusable meal weeks

Start with “Copy previous week.” Preview all breakfast, lunch, and dinner slots, then choose empty slots only or specific replacements. Next add named templates such as “Busy school week” and “Ghanaian favourites,” and meal notes such as “Leftovers” or “Eating out.”

Acceptance: preview before replacing meals; preserve untouched slots; copy across month/year boundaries; one undo action reverses the operation; shopping uses the resulting dated plan. A template stores weekday and meal slot rather than old calendar dates. Meal notes need a distinct data shape, since today's meal schema requires a recipe ID.

### 3. Event responsibilities

Keep attendees and responsible adults separate. For swimming, both boys may attend while one adult drops them off and the other collects them. Add a brief checklist for goggles, towels, or a school form.

Acceptance: optional pickup/drop-off fields; responsibility visible in event detail and the daily overview; unassigned journeys are clearly labelled; completing a checklist item does not edit the event's title. Conflict checks should include the responsible adult's time commitment when that is represented. Repeating checklists must reset per occurrence rather than remain ticked forever.

This is our proposed adaptation of coordination workflows, not a claim that every compared product implements those exact fields.

### 4. More useful shopping

Deliver three stages: a review of required ingredients with “Already have”; servings and amounts that combine correctly; then optional saved pantry items with “use soon.” Avoid requiring the family to maintain an exact inventory before basic shopping improves.

Acceptance: cooking a dish twice increases its needed amount; compatible units combine; free text such as “to taste” remains readable; unknown units stay separate for review. Do not interpret a crossed-off shopping item as proof that a cupboard still contains it. Stock changes should be explicit until consumption tracking is reliable.

Keep Ghanaian and lighter-meal preferences available when choosing plans. Adult serving preferences should be independent of the children's meals; this feature should not silently apply an adult weight goal across the family or claim guaranteed weight loss.

### 5. Routines and the boys' view

Offer editable morning, after-school, and bedtime routines, with steps, selected weekdays, and different versions for school days and holidays. The 6-year-old can use simple pictures and short labels; the 10-year-old can see more detail. Reuse existing chore completion and stars where possible.

Acceptance: each day's completion resets in the family's timezone; finishing late does not move a school-day routine into the weekend; optional rewards have a clear goal and cannot be redeemed twice. A child view initially can be a convenience screen on an adult-supervised tablet. Restricted child accounts require backend enforcement and narrower data access; hiding settings buttons is insufficient.

### 6. Relevant alerts and a preparation review

Extend the existing digest instead of creating another competing notification system. Add a configurable review time and an in-app weekly review showing open responsibilities, unplanned dinners, and preparations due before events.

For shared changes, show author, time, and the meaningful before/after value, then notify only relevant people according to their preferences. Group a burst of edits and suppress notifications for a person's own changes by default. Attendance alone should not imply acknowledgement.

Acceptance: one logical change produces one notification; offline retries do not create duplicates; an alert opens the affected occurrence; users can mute categories and set quiet hours. History needs a server-recorded actor and revision rather than trusting a client-supplied name.

### 7–9. Discussions, school schedules, and import

Add event comments and document links first; uploaded files need household-scoped storage, deletion rules, and access checks. Recurring-event discussion or documents must distinguish a whole series from one occurrence.

For school schedules, add exceptions and term ranges before automatic import. Existing weekly/fortnightly repeats and an end date already cover part of the requirement. The missing work includes skipped dates, changed individual occurrences, and consistent behavior in reminders and Google sync.

For flyer import, start with pasted text or an uploaded notice rather than full mailbox access. Show source text alongside extracted dates, timezone, people, location, and uncertainty. Save only reviewed choices; detect duplicates. Validate Auckland daylight saving and dates such as “next Friday” before promising one-tap scheduling.

## Implementation sequence

1. **FP-01: Personal recipe favourites.** Update recipe cards/details and filters in `meals.tsx`; use stable recipe IDs and persistent personal preferences. Verify reload, removal, search, keyboard access, and light/dark views.
2. **FP-02: Copy previous meal week.** Build the preview and mutation batch using the existing planner provider and undo flow. Verify occupied slots, all three meal slots, year boundaries, and offline replay. Add saved templates after the copying workflow works well.
3. **FP-03: Event responsibility and checklist.** Extend validated event fields, forms, details, and overview. Define per-occurrence checklist state before supporting repeats. Add focused recurrence, conflict, and shared-edit checks.
4. **FP-04: Ingredient review and structured amounts.** Introduce review first; migrate quantities gradually before serving arithmetic or pantry subtraction.
5. **FP-05: Routines, then optional rewards/child access.** Separate routine scheduling from a larger authorization change so the useful checklist feature can arrive earlier.

Any shared-data extension needs backward-compatible defaults, matching JSON/database validation, backup/restore handling, and offline replay coverage. Calendar-related additions also need a defined Google/ICS mapping. Existing backend configuration must be checked when shipping new push or sync behavior.

## How to tell whether these changes help

Use a short family trial rather than copying competitors' feature counts. Check whether people can plan the next week faster, find repeat recipes easily, identify the responsible adult without messaging, and shop without duplicated or missing ingredients. Ask whether the boys can finish routines without help navigating the screen.

For the first release, observe these tasks manually; a new analytics service is unnecessary. Keep the visual design quiet: clear dates, short event previews, direct actions, and familiar family language. Expand a feature after the family uses its simpler version.
