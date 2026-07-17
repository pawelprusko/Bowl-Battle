const fs = require('fs');
let code = fs.readFileSync('src/game/Renderer.ts', 'utf8');

const target = `let animSpeedDampen = 1.0;
            if (spritePrefix === 'bot' && w > 25) {
                animSpeedDampen = 0.30; 
            }
            
            // POPRAWKA: Jeśli QTE podania jest aktywne, drastycznie zwalniamy ruchy rąk i nóg o mnożnik 0.12, dopasowując je do spowolnionej fizyki areny!
            if (world.isGroupQTEActive) {
                animSpeedDampen *= 0.12;
            }
            
        // POPRAWKA: Ujednolicono krok i spowolnienie cyklu animacji kończyn oraz trzymanej piłki futbolowej (mnożnik 0.12) w czasie trwania slow-mo QTE!
            const runCycle = world.isGroupQTEActive ? (now * 0.002) : (isRunning ? now * 0.015 * (runSpeed / 100) * animSpeedDampen : 0);
            const idleCycle = world.isGroupQTEActive ? (now * 0.001) : (isRunning ? 0 : now * 0.003);
            
            const bounceY = isRunning && !isTackling ? Math.abs(Math.sin(runCycle)) * 12 : Math.sin(idleCycle) * 3;`;

const replacement = `let animSpeedDampen = 1.0;
            if (spritePrefix === 'bot' && w > 25) {
                animSpeedDampen = 0.30; 
            }
            
            let runCycle = 0;
            let idleCycle = 0;
            
            if (world.isGroupQTEActive) {
                runCycle = now * 0.002;
                idleCycle = now * 0.001;
            } else if (world.newPlayerTransitionTimer > 0) {
                if (isRunning) {
                    runCycle = now * 0.002;
                    idleCycle = 0;
                } else {
                    runCycle = 0;
                    idleCycle = now * 0.001;
                }
            } else {
                runCycle = isRunning ? now * 0.015 * (runSpeed / 100) * animSpeedDampen : 0;
                idleCycle = isRunning ? 0 : now * 0.003;
            }
            
            const bounceY = isRunning && !isTackling ? Math.abs(Math.sin(runCycle)) * 12 : Math.sin(idleCycle) * 3;`;

code = code.replace(target, replacement);
fs.writeFileSync('src/game/Renderer.ts', code);
