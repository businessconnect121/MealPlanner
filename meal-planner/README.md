# Meal Planner for NutriLens

The Meal Planner is a separate page (`meal-planner/index.html`) that opens from the NutriLens left menu. It's shown in a frame inside the main screen and shares the browser's storage with NutriLens.

## Changes to NutriLens `index.html` (4 additions, nothing removed)
1. A **Meal Planner** item in the left menu (`dnav-planner`).
2. `<div id="mp-view">` holding the planner frame, just before `.main-body`.
3. One line at the top of `navTo()`: `if (typeof mpNav === 'function' && mpNav(view)) return;`
4. `<script src="meal-planner/nl-embed.js">` before `</body>`.

`meal-planner/nl-embed.js` shows and hides the planner, sizes the frame, and hides the token/cost bar while the planner is open.

## What the planner uses from NutriLens
- **Profiles** (`nl_profiles`): each profile is a family member. Name, health conditions and food preferences are read and never changed.
- **Gemini:** your key and model from NutriLens Settings (`nl_gemini_key`, `nl_gemini_model`). With no personal key, requests go through the existing `/.netlify/functions/gemini` proxy.
- **YouTube API key** from NutriLens Settings (`nl_yt_key`), used for playlist import.

## Features
1. **Menu + backup.** Opens on an empty week. **Backup** exports and imports, and accepts the standalone planner's backup file.
2. **Favourites.** Paste public or unlisted playlist links. Gemini turns titles into dishes and suggests linking to master-list dishes; you review before anything is added. Favourites show with ★ in their own colour, with the video link, in the week, the type-to-add suggestions and Meal combinations. Re-syncing adds only new videos and flags removed ones.
3. **Family.** Members are your NutriLens profiles, and the family can be renamed. "Cooking for" defaults to 3. Goals (low-FODMAP, diabetes, cholesterol, weight loss) are read from conditions and can be changed in the planner only. Headcount can be set per day (👥) and per meal (⚙). The Guest meal switch adds an optional guest note, and the planner asks "Cooking for guests?" when the headcount goes above family size.
4. **Check for family.** Badges per member:
   - ✓ suits, • limited portion, ✕ not suitable, ⚠ allergy or strict diet, ? check with a doctor.
   - An outlined G badge appears for guest notes.
   - FODMAP comes from the meal list; other conditions come from Gemini. Results are kept until a profile changes.
   - "View as" shows the week from one person's point of view.
5. **Suggest boxes** for the week (**Regenerate week** asks for your requirements first, then plans every meal; tick "Keep the dishes already in the week" to fill only empty meals), day (👥 button) and meal (⚙).
   - **Only the meals a box asks for are filled:** "idli for breakfast" fills breakfasts; "Sunday lunch chicken dish" fills only that meal.
   - A general request (or empty boxes) fills every empty meal in that scope.
   - A meal's box beats its day's, and a day's beats the week's, where they clash. Dishes you placed are never replaced.
   - Each box shows what it understood, and Undo reverses a fill.
   - **Clear:** one meal (⚙), a day (👥), one slot across the week ("Clear row" on desktop, or the Regenerate week box), or the whole week (Regenerate week box). Undo works.
6. **Ingredients.** Raw ingredients as bought (rice and urad dal, never "idli batter" or "cooked rice"), with a category, estimated per serving once per dish. Favourites also use the video description. Edit them under Groceries → Dish ingredients.
7. **Groceries.**
   - Grouped as Vegetables & herbs, Fruits, Dairy & eggs, Meat & fish, Pantry, and Pantry basics.
   - Each item shows its name, the amount needed for each meal's headcount, and a tick for "I have it".
   - Typing or saying "I have onion, 2 apples, no rice" just ticks or unticks items; amounts are ignored.
   - Pantry basics are ticked by default.
   - **Copy for Keep** copies only unticked items, as "name – amount", one per line. In Keep, turn on Show checkboxes.
8. **Planning settings.**
   - Food (veg / veg + egg / non-veg) per week and per day.
   - Dishes: favourites, mix or try new.
   - Time to cook per week and per meal.
   - These feed the suggestions.
   - **Check for family** turns into **Stop checking** while running.
   - **View as** works before checking (allergies, diet and FODMAP from the list); a banner says when health conditions still need a check.

## Saved favourites (shared across devices)
Favourite recipe videos, playlists and own dishes come from three layers, combined by video ID and dish name. A duplicate never overwrites anything.
1. **Built-in list:** `meal-planner/my-dishes.js`, shipped with the planner. Every device has it, even with no passcode.
2. **Shared online store:** Netlify Blobs on your site, through `netlify/functions/meal-master.mjs`. Every change saves automatically and loads on every device.
3. **This browser.**

Removals are remembered and shared, so an older copy never brings a removed favourite back. Re-importing a playlist skips videos already saved and videos you removed. The master meal list itself is never changed.

### One-time setup on Netlify
1. **Site configuration → Environment variables:** add `MEAL_PLANNER_PASSCODE` (any phrase your family will share). Like `GEMINI_API_KEY`, it never appears in the page code.
2. **Deploy the whole folder from Git or the Netlify CLI** (`netlify deploy --prod`). `package.json` adds Netlify's own storage library (`@netlify/blobs`, free, no other service) and the deploy installs it. Drag-and-drop uploads may skip that install. `netlify.toml` sets Node 22, which the library needs.
3. On each device, **Favourites → enter the passcode once**. It's kept in that browser (`mp-family-passcode`).

The Favourites dialog shows the status: shared, saving, couldn't reach the site (changes are kept and retried), wrong passcode, or not set up. A red dot on Favourites means something isn't shared yet. Opened from a file (file://), favourites stay in that browser.

**Backup → Save to master (download)** gives a `my-dishes.js` copy. Placed in `meal-planner/`, it becomes the built-in list.

## Storage (this browser only)
Keys start with `lf-` (weeks, saved plans, family, favourites, ingredients, pantry, check results). NutriLens's own `nl_` keys are only read. `mp-family-passcode` and `mp-master-base` (last shared copy) belong to shared favourites.

## Tests
```
node tests/planner-step1.test.js      # NutriLens regression + planner inside NutriLens (desktop and phone)
node tests/planner-features.test.js   # Steps 2–8 + shared favourites, with mocked Gemini, YouTube and store
npm install && node tests/meal-master-function.test.mjs   # the real store function on Netlify's local Blobs server
```
