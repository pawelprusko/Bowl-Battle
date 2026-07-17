import re

with open('src/game/GameWorld.ts', 'r') as f:
    code = f.read()

old_drop_near = """        let isDropNear = false;
        for (const drop of (this as any).drops || []) {
            if (!drop.collected) {
                const dist = drop.worldX - (this.bgScrollX + GAME_WIDTH/3);
                if (dist > 100 && dist < 400) {
                    isDropNear = true;
                    break;
                }
            }
        }"""

new_drop_near = """        let isDropNear = false;
        for (const drop of (this as any).drops || []) {
            if (!drop.collected) {
                const dropScreenX = drop.worldX - this.bgScrollX;
                // If drop is approaching or on screen, don't spawn bots
                if (dropScreenX > -200 && dropScreenX < 1400) {
                    isDropNear = true;
                    break;
                }
            }
        }"""

if old_drop_near in code:
    code = code.replace(old_drop_near, new_drop_near)
    print("Replaced drop near logic")
else:
    print("Could not find drop near logic")

with open('src/game/GameWorld.ts', 'w') as f:
    f.write(code)

