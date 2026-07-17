import re

with open('src/game/Renderer.ts', 'r') as f:
    code = f.read()

code = code.replace("ctx.drawImage(img, -28, -28, 56, 56);", "ctx.drawImage(img, -20, -20, 40, 40);")

with open('src/game/Renderer.ts', 'w') as f:
    f.write(code)

