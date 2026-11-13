---
name: smw-level-playtest
description: Launch and playtest a Super Mario World level directly in the browser, bypassing the title menu and campaign unlock progression.
---

# Super Mario World level playtest

Use this skill when a task needs hands-on gameplay inspection of a specific level or room in this repository.

## Procedure

1. Resolve the level's internal ID from `generated/content.json`. The keys under `levels` are accepted by the launcher; `names` maps campaign IDs to display names. If the requested name is ambiguous, inspect the matching entries instead of guessing. If the generated file is absent, follow the asset preparation steps in the repository README.
2. From the repository root, start the local app with `npm run dev`. Open `http://localhost:5173/?testLevel=<ID>`, replacing `<ID>` with the exact key. For a built local server, use `npm start` and `http://127.0.0.1:8787/?testLevel=<ID>`.
3. The game starts as a fresh local Mario session in that level. The direct launch skips campaign selection, map navigation, and unlock requirements; it ignores existing campaign saves and does not persist test progress. Reload the same URL to restart the level.
4. Play only the scenario needed to answer the task. Record the starting level ID, inputs or sequence of actions, expected result, and observed result. Use browser screenshots or a short capture when visual behavior is part of the finding.

An unknown ID is shown as an error on the play surface. Check the `levels` keys and correct the URL; the launcher does not silently open the menu or another level.
