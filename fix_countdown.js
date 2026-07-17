const fs = require('fs');
let code = fs.readFileSync('src/game/GameWorld.ts', 'utf8');

const regex = /if \(this\.subState === GameSubState\.COUNTDOWN\) \{([\s\S]*?)this\.ball\.updatePhysics\(dt, \[this\.player, this\.bot\]\);/g;
code = code.replace(regex, 'if (this.subState === GameSubState.COUNTDOWN) {$1');

fs.writeFileSync('src/game/GameWorld.ts', code);
console.log('Fixed GameWorld.ts');
