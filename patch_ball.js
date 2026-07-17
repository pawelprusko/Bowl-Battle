const fs = require('fs');
let code = fs.readFileSync('src/game/Renderer.ts', 'utf8');

// Use regex to replace the entire if (world.subState === GameSubState.SCRUM_MATRIX) ... block

code = code.replace(/if \(world\.subState === GameSubState\.SCRUM_MATRIX\) \{[\s\S]*?ballSpin = 0; \/\/ Don't spin when held/, 
`if (world.subState === GameSubState.SCRUM_MATRIX) {
                // SCRUM lean offset
                ballVisX += faceDir * 10;
                ballVisY += 10;
                const runCycle = now * 0.002;
                const bounceY = Math.abs(Math.sin(runCycle)) * 12;
                ballVisY += bounceY * 0.8;
            } else if (attacker.onGround) {
                const simulatedAttackerVelX = (world.subState === GameSubState.REGULAR && world.isScrolling && attacker.stunTimer <= 0) ? 120 : attacker.vel.x;
                const runSpeed = Math.abs(simulatedAttackerVelX);
                const isRunning = runSpeed > 10;
                
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
                    runCycle = isRunning ? now * 0.015 * (runSpeed / 100) : 0;
                    idleCycle = isRunning ? 0 : now * 0.003;
                }
                
                const bounceY = isRunning ? Math.abs(Math.sin(runCycle)) * 12 : Math.sin(idleCycle) * 3;
                ballVisY += bounceY * 0.8; // Torso bounce offset
            }
            ballSpin = 0; // Don't spin when held`);

fs.writeFileSync('src/game/Renderer.ts', code);
