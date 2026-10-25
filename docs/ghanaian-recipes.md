# Ghanaian recipes and lighter meals

The library now has 68 recipes: 32 from West Africa, including 14 Ghanaian dishes. The eight additions below are original home-kitchen adaptations with links to the Ghanaian cooks who explain the dishes and their variations. Ingredient substitutions and measured oil are stated in the recipes.

| New recipe | Background | App image |
| --- | --- | --- |
| Kontomire-style spinach & smoked fish | [Fafa Gilbert](https://fafagilbert.com/2021/04/13/how-to-make-the-tastiest-kontomire-stew-cocoyam-leaves/) | [kontomire-spinach.webp](../public/images/recipes/kontomire-spinach.webp) |
| Garden egg & smoked fish stew | [Biscuits and Ladles](https://biscuitsandladles.com/garden-egg-stew/) | [garden-egg-stew.webp](../public/images/recipes/garden-egg-stew.webp) |
| Ghanaian fish light soup | [Biscuits and Ladles](https://biscuitsandladles.com/fresh-fish-soup/) | [ghana-fish-light-soup.webp](../public/images/recipes/ghana-fish-light-soup.webp) |
| Ghanaian tuna & cabbage stew | [Biscuits and Ladles](https://biscuitsandladles.com/tuna-cabbage-stew/) | [ghana-tuna-cabbage.webp](../public/images/recipes/ghana-tuna-cabbage.webp) |
| Ghanaian chicken & carrot sauce | [Biscuits and Ladles](https://biscuitsandladles.com/chicken-sauce-carrots-onions/) | [ghana-chicken-carrots.webp](../public/images/recipes/ghana-chicken-carrots.webp) |
| Yam eto with eggs & avocado | [Biscuits and Ladles](https://biscuitsandladles.com/yam-eto-baayer-eto-%C9%9Bto/) | [yam-eto.webp](../public/images/recipes/yam-eto.webp) |
| Ghanaian spiced corn porridge | [Biscuits and Ladles](https://biscuitsandladles.com/spicy-corn-dough-porridge/) | [ghana-corn-porridge.webp](../public/images/recipes/ghana-corn-porridge.webp) |
| Ghanaian egg stew & plantain | [Biscuits and Ladles](https://biscuitsandladles.com/easy-egg-stew/) | [ghana-egg-stew.webp](../public/images/recipes/ghana-egg-stew.webp) |

The **Lighter meals** filter selects 13 recipes, including five of these additions, around vegetables, beans or other protein, measured oil and practical serving suggestions. The approach follows the [NHS guidance on balanced meals for weight management](https://www.nhs.uk/better-health/lose-weight/healthy-eating-when-trying-to-lose-weight/). It does not calculate calories or promise a weight-loss result. Existing vegetarian, ingredient, country and quick-meal searches continue to work.

All eight new serving images were created with the **built-in imagegen tool**, then resized to 960 × 640 WebP assets in `public/images/recipes/`. These are serving illustrations, not photographs of tested cooking results. The exact prompts and saved paths are in [ghana-recipe-image-prompts.json](./ghana-recipe-image-prompts.json).

The new recipe IDs are included in both the full Supabase schema and the repeatable [recipe validation update](../supabase/update-recipes.sql). Run that update in an existing shared deployment before planning the newly added dishes. Browser-only families need no setup.
