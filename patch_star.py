import re

with open('src/game/GameWorld.ts', 'r') as f:
    code = f.read()

code = code.replace("this.invincibilityTimer = 10.0;", "this.invincibilityTimer = 9.0;")

with open('src/game/GameWorld.ts', 'w') as f:
    f.write(code)

