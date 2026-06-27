const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const os = require('os');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.get('/p/:token', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'player.html'));
});

const KEYWORDS = [
  'Cabra','Laranja','Medo','Macaco','Raiva','Cobra','Bigode','Urso','Segurança','Armadura',
  'Lento','Fogo','Ônibus','Cavalo','Orelha','Relâmpago','Carro','Homem','Mulher','Cavaleiro',
  'Inimigo','Preto','Salada','Verde','Sanduíche','Óculos','Frango','Oceano','Cadeia','Casa',
  'Veterinário','Professor','Bombeiro','Dia','Pesado','Gelo','Cachorro','Doença','Velho','Caixa',
  'Sofá','Prato','Anel','Capa','Pedra','Papel','Herói','Carta','Outono','Buraco',
  'Paraquedas','Avião','Pé','Capacete','Zoológico','Motocicleta','Alegria','Tristeza','Férias','Caracol',
  'Polvo','Tubarão','Notebook','Bolo','Felicidade','Vermelho','Terra','Estrada','Vento','Cinza',
  'Aranha','Rosa','Rabanete','Branco','Trigo','Verão','Surpresa','Viagem','Chapéu','Robô',
  'Mel','Porco','Dinossauro','Dragão','Lobo','Amarelo','Peixe','Piano','Unicórnio','Rato',
  'Açúcar','Nojo','Mala','Vaca','Tempo','Feio','Amigos','Rei','Rápido','Quente',
  'Deserto','Morango','Aeroporto','Castelo','Trem','Tomate','Cabeça','Queijo','Criança','Espaçonave',
  'Inverno','Escola','Rainha','Lâmpada','Sopa','Pintura','Olho','Água','Lua','Marte',
  'Selva','Montanha','Praia','Neve','Pera','Caneta','Helicóptero','Pato','Camelo','Noite',
  'Detetive','Bicicleta','Pirata','Enfermeira','Médico','Soldado','Cozinheiro','Luz','Banana','Circo',
  'Chocolate','Planeta','Mapa','Presidente','Guerra','Tesouro','Alto','Camisa','Malvado','Frio',
  'Barco','Diamante','Cama','Violão','Azul','Abacate','Bola','Cogumelo','Madeira','Livro',
  'Gato','Primavera','Pombo','Bolsa','Flecha','Marrom','Lentilhas','Tórax','Sobremesa','Feijão',
  'Espada','Coroa','Bruxa','Fada','Gigante','Navio','Foguete','Fantasma','Feitiço','Dragão',
];

function getBaseUrl(socket) {
  const host = socket && socket.handshake && socket.handshake.headers && socket.handshake.headers.host;
  if (host) {
    const isLocal = /^(localhost|127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(host);
    const proto = (!isLocal || (socket.handshake && socket.handshake.secure)) ? 'https' : 'http';
    return proto + '://' + host;
  }
  if (process.env.RAILWAY_PUBLIC_DOMAIN) return 'https://' + process.env.RAILWAY_PUBLIC_DOMAIN;
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces) {
      if (iface.family === 'IPv4' && !iface.internal)
        return 'http://' + iface.address + ':' + (process.env.PORT || 3000);
    }
  }
  return 'http://localhost:' + (process.env.PORT || 3000);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function rnd(n) { return Math.random().toString(36).substr(2, n); }

const rooms = new Map();
const tokenMap = new Map();

function publicState(room, code) {
  const rh = room.raisedHand;
  const rhPlayer = rh != null ? room.players[rh.playerIndex] : null;
  return {
    code, phase: room.phase,
    gridSize: room.gridSize,
    letters: room.letters, numbers: room.numbers,
    rows: room.rows, cols: room.cols,
    placed: room.placed,
    usedClues: [...room.usedClues],
    score: room.score, pileCount: room.pile.length,
    players: room.players.map(function(p) {
      return {
        index: p.index, name: p.name,
        cardCount: p.cards.length,
        connected: !!p.playerSocketId,
        hasRaisedHand: rh != null && rh.playerIndex === p.index,
      };
    }),
    currentClue: room.currentClue,
    groupGuess: room.groupGuess,
    lastResult: room.lastResult,
    timeLeft: room.timeLeft,
    raisedHand: rh != null ? { playerIndex: rh.playerIndex, playerName: rhPlayer && rhPlayer.name } : null,
  };
}

function playerState(room, idx) {
  const p = room.players[idx];
  const rh = room.raisedHand;
  return {
    name: p.name, playerIndex: idx,
    totalPlayers: room.players.length,
    cards: p.cards.map(function(coord) {
      const l = coord[0], n = parseInt(coord[1]);
      return { coord: coord, rowWord: room.rows[l] || '?', colWord: room.cols[n] || '?' };
    }),
    canDraw: p.cards.length < 2 && room.pile.length > 0 && room.phase === 'thinking' && room.players.length <= 3,
    phase: room.phase,
    currentClue: room.currentClue,
    isGiving: room.currentClue != null && room.currentClue.playerIndex === idx,
    score: room.score,
    hasRaisedHand: rh != null && rh.playerIndex === idx,
    raisedHand: rh != null ? { playerIndex: rh.playerIndex, playerName: room.players[rh.playerIndex] && room.players[rh.playerIndex].name } : null,
  };
}

function broadcast(code) {
  const room = rooms.get(code);
  if (!room) return;
  if (room.hostSocketId) io.to(room.hostSocketId).emit('gameState', publicState(room, code));
  room.players.forEach(function(p) {
    if (p.playerSocketId) io.to(p.playerSocketId).emit('myState', playerState(room, p.index));
  });
}

function endGame(code) {
  const room = rooms.get(code);
  if (!room) return;
  if (room.timerInterval) { clearInterval(room.timerInterval); room.timerInterval = null; }
  room.phase = 'ended';
  room.raisedHand = null;
  broadcast(code);
}

io.on('connection', function(socket) {

  socket.on('setupGame', function(data) {
    const names = data.names, gridSize = data.gridSize, cronoMin = data.cronoMin;
    const code = rnd(5).toUpperCase();
    const baseUrl = getBaseUrl(socket);

    const players = names.map(function(name, i) {
      return { index: i, name: name, token: rnd(8), cards: [], playerSocketId: null };
    });
    players.forEach(function(p) { tokenMap.set(p.token, { roomCode: code, playerIndex: p.index }); });

    rooms.set(code, {
      phase: 'lobby', gridSize: gridSize, cronoMin: cronoMin,
      letters: [], numbers: [], rows: {}, cols: {},
      pile: [], placed: {}, usedClues: new Set(),
      score: 0, players: players,
      currentClue: null, groupGuess: null, lastResult: null,
      raisedHand: null,
      timeLeft: null, timerInterval: null,
      hostSocketId: socket.id,
    });

    socket.data.roomCode = code;
    socket.data.role = 'host';

    socket.emit('roomCreated', {
      code: code,
      players: players.map(function(p) {
        return { name: p.name, url: baseUrl + '/p/' + p.token };
      }),
    });
  });

  socket.on('startGame', function() {
    const code = socket.data.roomCode;
    const room = rooms.get(code);
    if (!room || socket.data.role !== 'host') return;

    const letters = 'ABCDE'.slice(0, room.gridSize).split('');
    const numbers = [1,2,3,4,5].slice(0, room.gridSize);
    const words = shuffle(KEYWORDS).slice(0, room.gridSize * 2);

    room.letters = letters;
    room.numbers = numbers;
    room.rows = {};
    letters.forEach(function(l, i) { room.rows[l] = words[i]; });
    room.cols = {};
    numbers.forEach(function(n, i) { room.cols[n] = words[room.gridSize + i]; });

    const pile = [];
    letters.forEach(function(l) { numbers.forEach(function(n) { pile.push(l + n); }); });
    room.pile = shuffle(pile);
    room.placed = {};
    room.usedClues = new Set();
    room.score = 0;
    room.phase = 'thinking';
    room.currentClue = null;
    room.groupGuess = null;
    room.lastResult = null;
    room.raisedHand = null;

    room.players.forEach(function(p) {
      p.cards = [];
      const c = room.pile.pop();
      if (c) p.cards.push(c);
    });

    if (room.cronoMin > 0) {
      room.timeLeft = room.cronoMin * 60;
      room.timerInterval = setInterval(function() {
        room.timeLeft--;
        broadcast(code);
        if (room.timeLeft <= 0) endGame(code);
      }, 1000);
    }

    broadcast(code);
  });

  socket.on('playerConnect', function(data) {
    const token = data.token;
    const entry = tokenMap.get(token);
    if (!entry) { socket.emit('playerError', 'Link inválido.'); return; }
    const room = rooms.get(entry.roomCode);
    if (!room) { socket.emit('playerError', 'Sala não encontrada.'); return; }

    const p = room.players[entry.playerIndex];
    p.playerSocketId = socket.id;
    socket.data.roomCode = entry.roomCode;
    socket.data.playerIndex = entry.playerIndex;
    socket.data.role = 'player';

    socket.emit('myState', playerState(room, entry.playerIndex));
    if (room.hostSocketId) io.to(room.hostSocketId).emit('gameState', publicState(room, entry.roomCode));
  });

  socket.on('drawCard', function() {
    const code = socket.data.roomCode;
    const idx = socket.data.playerIndex;
    if (idx === undefined) return;
    const room = rooms.get(code);
    if (!room || room.phase !== 'thinking') return;
    const p = room.players[idx];
    if (p.cards.length >= 2 || room.pile.length === 0 || room.players.length > 3) return;
    p.cards.push(room.pile.pop());
    broadcast(code);
  });

  socket.on('raiseHand', function(data) {
    const coord = data.coord;
    const code = socket.data.roomCode;
    const idx = socket.data.playerIndex;
    if (idx === undefined) return;
    const room = rooms.get(code);
    if (!room || room.phase !== 'thinking') return;
    if (room.raisedHand != null) {
      socket.emit('raiseHandError', 'Outro jogador já levantou a mão.');
      return;
    }
    const p = room.players[idx];
    if (!p || p.cards.indexOf(coord) === -1) {
      socket.emit('raiseHandError', 'Carta inválida.');
      return;
    }
    room.raisedHand = { playerIndex: idx, coord: coord };
    broadcast(code);
  });

  socket.on('lowerHand', function() {
    const code = socket.data.roomCode;
    const idx = socket.data.playerIndex;
    if (idx === undefined) return;
    const room = rooms.get(code);
    if (!room || !room.raisedHand || room.raisedHand.playerIndex !== idx) return;
    room.raisedHand = null;
    broadcast(code);
  });

  socket.on('submitClue', function(data) {
    const clue = data.clue;
    const code = socket.data.roomCode;
    const room = rooms.get(code);
    if (!room || room.phase !== 'thinking') return;
    if (socket.data.role !== 'player') return;

    const pIdx = socket.data.playerIndex;
    if (pIdx === undefined) return;

    if (!room.raisedHand || room.raisedHand.playerIndex !== pIdx) {
      socket.emit('clueError', 'Levante a mão primeiro.');
      return;
    }

    const coord = room.raisedHand.coord;
    const p = room.players[pIdx];
    if (!p || p.cards.indexOf(coord) === -1) {
      socket.emit('clueError', 'Carta inválida.');
      return;
    }

    const clean = clue.trim().toLowerCase();
    if (!clean || clean.indexOf(' ') !== -1) { socket.emit('clueError', 'Uma única palavra.'); return; }
    if (room.usedClues.has(clean)) { socket.emit('clueError', 'Dica já foi usada.'); return; }

    room.phase = 'guessing';
    room.currentClue = { playerIndex: pIdx, playerName: p.name, clue: clue.trim(), coord: coord };
    room.raisedHand = null;
    room.groupGuess = null;
    room.lastResult = null;
    broadcast(code);
  });

  socket.on('setGroupGuess', function(data) {
    const coord = data.coord;
    const code = socket.data.roomCode;
    const room = rooms.get(code);
    if (!room || room.phase !== 'guessing' || socket.data.role !== 'host') return;
    room.groupGuess = coord;
    broadcast(code);
  });

  socket.on('confirmGuess', function() {
    const code = socket.data.roomCode;
    const room = rooms.get(code);
    if (!room || room.phase !== 'guessing' || !room.groupGuess || !room.currentClue) return;
    if (socket.data.role !== 'host') return;

    const correct = room.groupGuess === room.currentClue.coord;
    room.usedClues.add(room.currentClue.clue.toLowerCase());

    if (correct) {
      room.placed[room.currentClue.coord] = { clue: room.currentClue.clue, playerName: room.currentClue.playerName };
      room.score++;
    }

    const p = room.players[room.currentClue.playerIndex];
    p.cards = p.cards.filter(function(c) { return c !== room.currentClue.coord; });
    if (room.pile.length > 0 && p.cards.length === 0) {
      p.cards.push(room.pile.pop());
    }

    room.lastResult = {
      correct: correct,
      coord: room.currentClue.coord,
      guess: room.groupGuess,
      clue: room.currentClue.clue,
      playerName: room.currentClue.playerName,
    };
    room.currentClue = null;
    room.groupGuess = null;
    room.phase = 'thinking';

    const allEmpty = room.players.every(function(pl) { return pl.cards.length === 0; }) && room.pile.length === 0;
    if (allEmpty) { endGame(code); } else { broadcast(code); }
  });

  socket.on('disconnect', function() {
    const code = socket.data.roomCode;
    if (!code) return;
    const room = rooms.get(code);
    if (!room) return;
    if (socket.data.role === 'player' && socket.data.playerIndex !== undefined) {
      const idx = socket.data.playerIndex;
      room.players[idx].playerSocketId = null;
      if (room.raisedHand && room.raisedHand.playerIndex === idx) {
        room.raisedHand = null;
      }
      if (room.hostSocketId) io.to(room.hostSocketId).emit('gameState', publicState(room, code));
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, function() { console.log('Entre Linhas → http://localhost:' + PORT); });
