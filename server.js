const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// تخزين بيانات الغرف واللاعبين
const rooms = new Map();
const players = new Map();

// دالة لإنشاء غرفة جديدة
function createRoom(roomId) {
    return {
        id: roomId,
        players: [],
        gameState: {
            currentPlayer: 1,
            playerPositions: [1, 1],
            gameOver: false,
            snakes: [],
            ladders: [],
            negativeSquares: [],
            positiveSquares: [],
            isMoving: false
        },
        board: {
            rows: 10,
            cols: 10,
            totalCells: 100
        }
    };
}

// دالة لتوليد الثعابين والسلالم
function generateSnakesAndLadders() {
    const snakes = [];
    const ladders = [];
    const negativeSquares = [];
    const positiveSquares = [];
    
    // توليد السلالم
    const numLadders = Math.floor(Math.random() * 4) + 5; // 5-8 سلالم
    for (let i = 0; i < numLadders; i++) {
        let start, end;
        do {
            start = Math.floor(Math.random() * 90) + 2; // 2-91
            end = Math.floor(Math.random() * (100 - start - 5)) + start + 5; // start+5 إلى 100
        } while (ladders.some(l => l.start === start || l.end === end || Math.abs(l.start - start) < 5));
        
        ladders.push({start, end});
    }
    
    // توليد الثعابين
    const numSnakes = Math.floor(Math.random() * 4) + 5; // 5-8 ثعابين
    for (let i = 0; i < numSnakes; i++) {
        let start, end;
        do {
            start = Math.floor(Math.random() * 90) + 10; // 10-99
            end = Math.floor(Math.random() * (start - 5)) + 1; // 1 إلى start-5
        } while (snakes.some(s => s.start === start || s.end === end || Math.abs(s.start - start) < 5));
        
        snakes.push({start, end});
    }
    
    // توليد المربعات السالبة
    const numNegativeSquares = Math.floor(Math.random() * 4) + 3; // 3-6 مربعات
    for (let i = 0; i < numNegativeSquares; i++) {
        let position, value;
        do {
            position = Math.floor(Math.random() * 80) + 10; // 10-89
            value = Math.floor(Math.random() * 6) + 1; // 1-6
        } while (
            negativeSquares.some(ns => ns.position === position) ||
            snakes.some(s => s.start === position || s.end === position) ||
            ladders.some(l => l.start === position || l.end === position)
        );
        
        negativeSquares.push({position, value});
    }
    
    // توليد المربعات الموجبة
    const numPositiveSquares = Math.floor(Math.random() * 4) + 3; // 3-6 مربعات
    for (let i = 0; i < numPositiveSquares; i++) {
        let position, value;
        do {
            position = Math.floor(Math.random() * 80) + 10; // 10-89
            value = Math.floor(Math.random() * 6) + 1; // 1-6
        } while (
            positiveSquares.some(ps => ps.position === position) ||
            negativeSquares.some(ns => ns.position === position) ||
            snakes.some(s => s.start === position || s.end === position) ||
            ladders.some(l => l.start === position || l.end === position)
        );
        
        positiveSquares.push({position, value});
    }
    
    return { snakes, ladders, negativeSquares, positiveSquares };
}

// إدارة اتصالات Socket.IO
io.on('connection', (socket) => {
    console.log(`مستخدم جديد متصل: ${socket.id}`);
    
    // انضمام اللاعب إلى غرفة
    socket.on('joinRoom', (data) => {
        const { roomId, playerName } = data;
        
        // إنشاء الغرفة إذا لم تكن موجودة
        if (!rooms.has(roomId)) {
            rooms.set(roomId, createRoom(roomId));
        }
        
        const room = rooms.get(roomId);
        
        // التحقق من عدد اللاعبين
        if (room.players.length >= 2) {
            socket.emit('roomFull', { message: 'الغرفة ممتلئة بالفعل' });
            return;
        }
        
        // إضافة اللاعب إلى الغرفة
        const player = {
            id: socket.id,
            name: playerName,
            number: room.players.length + 1
        };
        
        room.players.push(player);
        socket.join(roomId);
        players.set(socket.id, { roomId, player });
        
        // إرسال معلومات الغرفة للاعب الجديد
        socket.emit('joinedRoom', {
            room: room,
            player: player
        });
        
        // إخبار جميع اللاعبين في الغرفة بانضمام لاعب جديد
        io.to(roomId).emit('playerJoined', {
            players: room.players,
            newPlayer: player
        });
        
        // إذا كان هناك لاعبين، ابدأ اللعبة
        if (room.players.length === 2) {
            // توليد الثعابين والسلالم
            const gameElements = generateSnakesAndLadders();
            room.gameState.snakes = gameElements.snakes;
            room.gameState.ladders = gameElements.ladders;
            room.gameState.negativeSquares = gameElements.negativeSquares;
            room.gameState.positiveSquares = gameElements.positiveSquares;
            
            io.to(roomId).emit('gameReady', {
                gameState: room.gameState,
                board: room.board
            });
        }
        
        console.log(`اللاعب ${playerName} انضم إلى الغرفة ${roomId}`);
    });
    
    // رمي النرد
    socket.on('rollDice', (data) => {
        const playerData = players.get(socket.id);
        if (!playerData) return;
        
        const room = rooms.get(playerData.roomId);
        if (!room) return;
        
        const player = room.players.find(p => p.id === socket.id);
        if (!player || room.gameState.currentPlayer !== player.number) return;
        
        // توليد قيمة النرد
        const diceValue = Math.floor(Math.random() * 6) + 1;
        
        // إرسال قيمة النرد لجميع اللاعبين
        io.to(playerData.roomId).emit('diceRolled', {
            player: player.number,
            diceValue: diceValue
        });
        
        // معالجة حركة اللاعب
        setTimeout(() => {
            processPlayerMove(room, player.number, diceValue);
        }, 1000);
    });
    
    // إعادة تعيين اللعبة
    socket.on('resetGame', () => {
        const playerData = players.get(socket.id);
        if (!playerData) return;
        
        const room = rooms.get(playerData.roomId);
        if (!room) return;
        
        // إعادة تعيين حالة اللعبة
        room.gameState = {
            currentPlayer: 1,
            playerPositions: [1, 1],
            gameOver: false,
            snakes: room.gameState.snakes,
            ladders: room.gameState.ladders,
            negativeSquares: room.gameState.negativeSquares,
            positiveSquares: room.gameState.positiveSquares,
            isMoving: false
        };
        
        // توليد ثعابين وسلالم جديدة
        const gameElements = generateSnakesAndLadders();
        room.gameState.snakes = gameElements.snakes;
        room.gameState.ladders = gameElements.ladders;
        room.gameState.negativeSquares = gameElements.negativeSquares;
        room.gameState.positiveSquares = gameElements.positiveSquares;
        
        io.to(playerData.roomId).emit('gameReset', {
            gameState: room.gameState
        });
    });
    
    // انفصال اللاعب
    socket.on('disconnect', () => {
        const playerData = players.get(socket.id);
        if (playerData) {
            const room = rooms.get(playerData.roomId);
            if (room) {
                // إزالة اللاعب من الغرفة
                room.players = room.players.filter(p => p.id !== socket.id);
                
                // إخبار اللاعبين الآخرين
                io.to(playerData.roomId).emit('playerLeft', {
                    playerId: socket.id,
                    players: room.players
                });
                
                // حذف الغرفة إذا لم يتبق لاعبين
                if (room.players.length === 0) {
                    rooms.delete(playerData.roomId);
                }
            }
            players.delete(socket.id);
        }
        
        console.log(`المستخدم ${socket.id} انفصل`);
    });
});

// دالة معالجة حركة اللاعب
function processPlayerMove(room, playerNumber, steps) {
    const playerIndex = playerNumber - 1;
    const startPosition = room.gameState.playerPositions[playerIndex];
    
    // التحقق من قاعدة الوصول الدقيق لرقم 100
    const stepsToWin = room.board.totalCells - startPosition;
    let newPosition;
    
    if (startPosition + steps > room.board.totalCells) {
        // اللاعب لا يتحرك إذا كان النرد أكبر من الخطوات المطلوبة
        newPosition = startPosition;
    } else {
        newPosition = startPosition + steps;
    }
    
    // تحقق من الفوز
    if (newPosition === room.board.totalCells) {
        room.gameState.gameOver = true;
        room.gameState.playerPositions[playerIndex] = newPosition;
        
        io.to(room.id).emit('gameOver', {
            winner: playerNumber,
            gameState: room.gameState
        });
        return;
    }
    
    // تحديث موقع اللاعب
    room.gameState.playerPositions[playerIndex] = newPosition;
    
    // معالجة التأثيرات الخاصة
    const specialEffects = processSpecialEffects(room, playerNumber, newPosition);
    
    // إرسال تحديث اللعبة
    io.to(room.id).emit('playerMoved', {
        player: playerNumber,
        newPosition: specialEffects.finalPosition,
        gameState: room.gameState,
        effects: specialEffects.effects
    });
    
    // تبديل اللاعب إذا لم تكن اللعبة منتهية
    if (!room.gameState.gameOver && !specialEffects.bonusRoll) {
        room.gameState.currentPlayer = room.gameState.currentPlayer === 1 ? 2 : 1;
        
        io.to(room.id).emit('turnChanged', {
            currentPlayer: room.gameState.currentPlayer,
            gameState: room.gameState
        });
    }
}

// دالة معالجة التأثيرات الخاصة
function processSpecialEffects(room, playerNumber, position) {
    const effects = [];
    let finalPosition = position;
    let bonusRoll = false;
    
    // تحقق من الثعابين والسلالم
    const snakeOrLadder = checkSnakeOrLadder(room, position);
    if (snakeOrLadder) {
        effects.push({
            type: snakeOrLadder.type,
            from: position,
            to: snakeOrLadder.to
        });
        finalPosition = snakeOrLadder.to;
    }
    
    // تحقق من المربعات السالبة
    const negativeSquare = checkNegativeSquare(room, finalPosition);
    if (negativeSquare) {
        const opponentPlayer = playerNumber === 1 ? 2 : 1;
        const opponentIndex = opponentPlayer - 1;
        const opponentOldPosition = room.gameState.playerPositions[opponentIndex];
        
        let opponentNewPosition;
        if (negativeSquare.value >= opponentOldPosition) {
            opponentNewPosition = 1;
        } else {
            opponentNewPosition = opponentOldPosition - negativeSquare.value;
        }
        
        room.gameState.playerPositions[opponentIndex] = opponentNewPosition;
        
        effects.push({
            type: 'negativeSquare',
            player: playerNumber,
            opponent: opponentPlayer,
            opponentNewPosition: opponentNewPosition,
            value: negativeSquare.value
        });
    }
    
    // تحقق من المربعات الموجبة
    const positiveSquare = checkPositiveSquare(room, finalPosition);
    if (positiveSquare) {
        const playerIndex = playerNumber - 1;
        const newPosition = Math.min(room.board.totalCells, finalPosition + positiveSquare.value);
        
        room.gameState.playerPositions[playerIndex] = newPosition;
        finalPosition = newPosition;
        
        effects.push({
            type: 'positiveSquare',
            player: playerNumber,
            value: positiveSquare.value,
            newPosition: newPosition
        });
        
        // تحقق من الفوز بعد التقدم
        if (newPosition === room.board.totalCells) {
            room.gameState.gameOver = true;
        }
    }
    
    // تحقق من التصادم مع اللاعب الآخر
    const opponentIndex = playerNumber === 1 ? 1 : 0;
    const currentPlayerIndex = playerNumber - 1;
    
    if (room.gameState.playerPositions[opponentIndex] === room.gameState.playerPositions[currentPlayerIndex] && 
        room.gameState.playerPositions[currentPlayerIndex] > 1) {
        
        const opponentOldPosition = room.gameState.playerPositions[opponentIndex];
        let opponentNewPosition;
        
        if (steps >= opponentOldPosition) {
            opponentNewPosition = 1;
        } else {
            opponentNewPosition = opponentOldPosition - steps;
        }
        
        room.gameState.playerPositions[opponentIndex] = opponentNewPosition;
        bonusRoll = true;
        
        effects.push({
            type: 'collision',
            player: playerNumber,
            opponent: playerNumber === 1 ? 2 : 1,
            opponentNewPosition: opponentNewPosition
        });
    }
    
    return {
        finalPosition,
        effects,
        bonusRoll
    };
}

// دوال مساعدة للتحقق من التأثيرات
function checkSnakeOrLadder(room, position) {
    // تحقق من السلالم
    for (const ladder of room.gameState.ladders) {
        if (ladder.start === position) {
            return {type: 'ladder', to: ladder.end};
        }
    }
    
    // تحقق من الثعابين
    for (const snake of room.gameState.snakes) {
        if (snake.start === position) {
            return {type: 'snake', to: snake.end};
        }
    }
    
    return null;
}

function checkNegativeSquare(room, position) {
    for (const negSquare of room.gameState.negativeSquares) {
        if (negSquare.position === position) {
            return {value: negSquare.value};
        }
    }
    return null;
}

function checkPositiveSquare(room, position) {
    for (const posSquare of room.gameState.positiveSquares) {
        if (posSquare.position === position) {
            return {value: posSquare.value};
        }
    }
    return null;
}

// تشغيل الخادم
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`الخادم يعمل على المنفذ ${PORT}`);
    console.log(`افتح المتصفح على: http://localhost:${PORT}`);
}); 