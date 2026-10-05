# Kinfolk design and research notes

## Product research

Reviewed on 28 September 2026:

- [Cozi features](https://www.cozi.com/feature-overview/): colour-coded household schedules, a daily agenda, to-dos and recipes connected to grocery lists.
- [FamilyWall](https://www.familywall.com/en/index.html): an integrated family dashboard with shared schedules, grocery lists and meal planning.

Kinfolk adapts these useful organisational patterns into an original interface: forest green, warm ivory, sage and terracotta accents; consistent member colours; visible daily priorities; and short, friendly forms. Location tracking, subscriptions and social messaging are outside this implementation’s scope.

## Forest green UI refresh

The primary colour is forest green (`#28634f`) on warm ivory (`#f6f5ef`), with charcoal text, white cards and soft sage selections. Navigation, forms, calendar colours, recipe controls, the app icon and installed-app theme use the same palette. Existing stored `lavender` values are retained for compatibility and display as forest green; the colour picker names that swatch “Forest green”.

The current welcome illustration is [`public/images/family-breakfast-african.webp`](../public/images/family-breakfast-african.webp), edited with the **built-in imagegen tool** to show a Black African family and match the new palette. The exact edit prompts are saved in [`ui-refresh-image-prompt.json`](./ui-refresh-image-prompt.json). The original artwork is retained below.

## Original dashboard illustration

Generated with the **built-in imagegen tool**, using the imagegen skill. No API key or CLI fallback was used.

- Original: [`public/images/family-breakfast.png`](../public/images/family-breakfast.png)
- Optimised app asset: [`public/images/family-breakfast.webp`](../public/images/family-breakfast.webp)

Final prompt:

> Use case: illustration-story. Asset type: original wide editorial illustration for a warm family planner web app dashboard, 1536x1024 landscape. Primary request: A charming contemporary editorial illustration of a cozy family breakfast in a sunny kitchen, two parents and two children gathered around an oval wooden table, a little golden dog resting beside it, houseplant, bowl of oranges, mugs, a vase with flowers, window with soft leafy view. Style: sophisticated flat gouache and colored pencil illustration with visible soft paper grain, simple expressive faces, playful rounded shapes, gentle organic curves, minimal detail, premium magazine art, handcrafted warmth. Colors: muted lavender, butter yellow, warm ivory, terracotta, sage green, small deep charcoal accents. Composition: complete scene centered in the frame, lots of creamy pale lavender background and generous breathing room, no crop of characters, low visual density. Mood: joyful ordinary family moments, calm and quietly delightful. No text, no lettering, no logos, no watermark. This will sit in the right half of a pale lavender greeting banner.

## Other assets

The locally stored recipe photographs are illustrative images from Unsplash:

| File           | Source image                                           |
| -------------- | ------------------------------------------------------ |
| `pasta.jpg`    | `images.unsplash.com/photo-1551183053-bf91a1d81141`    |
| `tacos.jpg`    | `images.unsplash.com/photo-1551504734-5ee1c4a1479b`    |
| `salmon.jpg`   | `images.unsplash.com/photo-1467003909585-2f8a72700288` |
| `curry.jpg`    | `images.unsplash.com/photo-1603894584373-5ac82b2ae398` |
| `pizza.jpg`    | `images.unsplash.com/photo-1513104890138-7c749659a591` |
| `pancakes.jpg` | `images.unsplash.com/photo-1528207776546-365bb710ee93` |

DM Sans and Manrope are served locally under their included SIL Open Font Licenses in `public/fonts/`. UI icons come from Lucide. The app mark is an original SVG.
