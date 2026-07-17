import re

with open('src/game/GameWorld.ts', 'r') as f:
    code = f.read()

code = code.replace("this.addTime(5); // already adds +5 and confetti!", "this.addTime(10); // already adds +10 and confetti!")

with open('src/game/GameWorld.ts', 'w') as f:
    f.write(code)

with open('src/game/Renderer.ts', 'r') as f:
    code = f.read()

code = code.replace("ctx.drawImage(img, -40, -40, 80, 80);", "ctx.drawImage(img, -28, -28, 56, 56);")
code = code.replace("ctx.fillText('+5s', 0, 4);", "ctx.fillText('+10s', 0, 4);")

with open('src/game/Renderer.ts', 'w') as f:
    f.write(code)

