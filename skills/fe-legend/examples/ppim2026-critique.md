# Critique: PPIM 2026 42K poster legend

| Criterion | Score | Note |
|---|---|---|
| Legibility at print | 3 | Legend labels ~15px on 1080 canvas; fine on screen, small at A3. Icon tiles 28px are good. |
| Icon/map consistency | 4 | Same drop/cross/U-turn chips reused on map. "HS" sub-tag is tiny on map. |
| Hierarchy | 3 | START/FINISH, 42KM badges, title all compete in magenta/purple; 3 badge styles. |
| Color count | 2 | 9 working colors + photo bubbles; purples (#5909c1, #7534c8, #5421bf) too close. |
| Editability | 2 | Raster, photo bubbles and leaders are hand-placed. |

## Improvements (max 5)
1. Lock palette to 5 roles: panel navy #0c0d56, sea #3e43f5, accent #5909c1, badge magenta #ce1f52, text #f6effb. Use one purple for the route.
2. One badge grammar: km block + name block, always left-km / right-name, consistent 12px radius, pointer leader 2px.
3. Legend as a 4-row grid, 36px pitch, 28px tiles, 12px gap, labels 16px/700, aligned to the stats-bar baseline grid.
4. Replace "HS" micro-tag with a hollow-drop icon variant so it reads at 10px on the map.
5. Build from GPX: km ticks every 1 km, start/finish and aid stations placed by coordinate, so updates are regenerated, not redrawn.
