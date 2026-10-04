# Recipe library

The library contains 60 recipes: the six existing favourites, 24 West African dishes and 30 additional everyday meals. Existing recipe IDs are retained, so previous meal plans and backups remain valid.

## Update an existing Supabase project

Before deploying this app version, open the correct project's **SQL Editor**, paste the contents of [`supabase/update-recipes.sql`](../supabase/update-recipes.sql), and click **Run**. This repeatable update changes recipe validation without deleting family data. Then deploy the app changes to Vercel. A newly created project should use the complete [`supabase/schema.sql`](../supabase/schema.sql) instead.

The database must recognise new recipe IDs before the deployed app saves them. The old database accepts only the original six recipes. A successful browser-only save does not verify your live Supabase database has been updated.

## Maintaining recipes

Additional recipes live in `src/lib/recipes-west-africa.ts` and `src/lib/recipes-everyday.ts`; `recipe-helpers.ts` calculates total time and maps ingredients to shopping categories. Times include specified soaking, chilling, marinating and resting. Optional serving accompaniments are separate from the shopping ingredients unless listed explicitly. Quick recipes take at most 30 minutes, including inactive time.

After changing recipe IDs or the family data schema, run `npm run db:schema`. It regenerates the database allowlist and the existing-project update. Tests check both SQL copies, every recipe's meal-plan validity, ingredient deduplication and PostgreSQL acceptance of all 60 IDs. PostgreSQL tests substitute Supabase's JSON-schema extension locally and do not contact a live family database.

The West African recipes are original home-kitchen versions informed by the sources linked in each recipe. They are not presented as the sole traditional preparation. Images show serving ideas, not photographs of kitchen-tested results. Check ingredient packaging for dietary requirements; the meat-free filter is not an allergy guarantee.

Cooking temperatures follow [FoodSafety.gov's minimum internal temperature chart](https://www.foodsafety.gov/food-safety-charts/safe-minimum-internal-temperatures). Recipe-specific sources are linked under “Let’s make it” in the app.

## Images

The six original food photos remain in `public/images/`. The 54 new dish images are generated individually using the built-in image generation tool, then resized and encoded as WebP for the app in `public/images/recipes/`. The exact final prompt set and file mapping are recorded in `docs/recipe-image-prompts.json`. Original generated PNGs remain in the image-generation output folder; all app assets are copied into this project.
