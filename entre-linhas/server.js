const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

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
  'Gato','Primavera','Pombo','Bolsa','Flecha','Marrom','Salada','Lentilhas','Tórax','Sobremesa',
];

const rooms = {};

function pick(n) {
  const s = [...KEYWORDS].sort(() => Math.random() - 0.5);
  return s.slice(0, n);
}

function buildGrid(size) {
  const letters = ['A','B','C','D','E'].slice(0, size);
  const numbers = [1,2,3,4,5].slice(0, size);
  const words = pick(size * 2);
  const rows = {}, cols = {};
  letters.forEach((l, i) => { rows[l] = words[i]; });
  numbers.forEach((n, i) => { cols[n] = words[size + i]; });
  return { rows, cols, letters, numbers };
}

function buildPile(size) {
  const letters = ['A','B','C','D','E'].slice(0, size);
  const numbers = [1,2,3,4,5].slice(0, size);
  const cards = [];
  letters.forEach(l => numbers.forEach(n => cards.push(`${l}${n}`)));
  return cards.sort(() => Math.random() - 0.5);
}

function dealCard(room) {
  return room.pile.length > 0 ? room.pile.pop() : null;
}

function roomPublicState(room) {
  return {
    code: room.code,
    host: room.host,
    gridSize: room.gridSize,
    useTimer: room.useTimer,
    phase: room.phase,
    grid: room.grid,
    placed: room.placed,
    usedClues: [...(room.usedClues || [])],
    score: room.score,
    pileCount: room.pile ? room.pile.length : 0,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      cardCount: p.cards.length,
      online: p.online,
    })),
    currentClue: room.currentClue,
    groupGuess: room.groupGuess,
    lastResult: room.lastResult,
    timeLeft: room.timeLeft,
  };
}

function broadcastState(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;
  const pub = roomPublicState(room);
  room.players.forEach(p => {
    if (!p.online) return;
    io.to(p.id).emit('state', {
      ...pub,
      myCards: p.cards,
    });
  });
}

function startGame(roomCode) {
  const room = rooms[roomCode];
  room.grid = buildGrid(room.gridSize);
  room.pile = buildPile(room.gridSize);
  room.placed = {};
  room.usedClues = new Set();
  room.score = 0;
  room.phase = 'thinking';
  room.currentClue = null;
  room.groupGuess = null;
  room.lastResult = null;
  room.timeLeft = null;

  const handSize = room.players.length <= 3 ? 2 : 1;
  room.players.forEach(p => {
    p.cards = [];
    for (let i = 0; i < handSize; i++) {
      const c = dealCard(room);
      if (c) p.cards.push(c);
    }
  });

  if (room.useTimer) {
    const minutes = room.gridSize === 5 ? 10 : 5;
    room.timeLeft = minutes * 60;
    if (room.timerInterval) clearInterval(room.timerInterval);
    room.timerInterval = setInterval(() => {
      room.timeLeft--;
      if (room.timeLeft <= 0) endGame(roomCode);
      else broadcastState(roomCode);
    }, 1000);
  }
}

function endGame(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;
  if (room.timerInterval) { clearInterval(room.timerInterval); room.timerInterval = null; }
  room.phase = 'ended';
  broadcastState(roomCode);
}

function checkGameEnd(roomCode) {
  const room = rooms[roomCode];
  const allEmpty = room.players.every(p => p.cards.length === 0);
  if (room.pile.length === 0 && allEmpty) {
    endGame(roomCode);
    return true;
  }
  return false;
}

io.on('connection', (socket) => {
  socket.on('createRoom', ({ name, gridSize, useTimer }) => {
    const code = Math.random().toString(36).substr(2, 5).toUpperCase();
    rooms[code] = {
      code, host: socket.id,
      gridSize: gridSize || 4,
      useTimer: !!useTimer,
      phase: 'lobby',
      players: [{ id: socket.id, name, cards: [], online: true }],
      grid: null, pile: [], placed: {}, usedClues: new Set(),
      score: 0, currentClue: null, groupGuess: null, lastResult: null,
      timerInterval: null, timeLeft: null,
    };
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.name = name;
    broadcastState(code);
  });

  socket.on('joinRoom', ({ name, code }) => {
    const room = rooms[code];
    if (!room) { socket.emit('error', 'Sala não encontrada.'); return; }
    if (room.phase !== 'lobby') { socket.emit('error', 'A partida já começou.'); return; }
    if (room.players.length >= 8) { socket.emit('error', 'Sala cheia.'); return; }
    room.players.push({ id: socket.id, name, cards: [], online: true });
    socket.join(code);
    socket.data.roomCode = code;
    socket.data.name = name;
    broadcastState(code);
  });

  socket.on('startGame', () => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room || room.host !== socket.id) return;
    if (room.players.length < 2) { socket.emit('error', 'Mínimo 2 jogadores.'); return; }
    startGame(code);
    broadcastState(code);
  });

  socket.on('updateSettings', ({ gridSize, useTimer }) => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room || room.host !== socket.id || room.phase !== 'lobby') return;
    if (gridSize) room.gridSize = gridSize;
    if (useTimer !== undefined) room.useTimer = useTimer;
    broadcastState(code);
  });

  socket.on('submitClue', ({ clue, cardCoord }) => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room || room.phase !== 'thinking') return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;
    if (!player.cards.includes(cardCoord)) { socket.emit('error', 'Carta inválida.'); return; }
    const clueClean = clue.trim().toLowerCase();
    if (!clueClean || clueClean.includes(' ')) { socket.emit('error', 'Dica deve ser uma única palavra.'); return; }
    if (room.usedClues.has(clueClean)) { socket.emit('error', 'Esta dica já foi usada.'); return; }

    room.phase = 'guessing';
    room.currentClue = { playerId: socket.id, playerName: player.name, clue: clue.trim(), cardCoord };
    room.groupGuess = null;
    room.lastResult = null;
    broadcastState(code);
  });

  socket.on('setGroupGuess', ({ coord }) => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room || room.phase !== 'guessing') return;
    if (room.currentClue && room.currentClue.playerId === socket.id) return; // clue giver can't guess
    room.groupGuess = coord;
    broadcastState(code);
  });

  socket.on('confirmGuess', () => {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room || room.phase !== 'guessing' || !room.groupGuess) return;
    if (room.currentClue && room.currentClue.playerId === socket.id) return;

    const correct = room.groupGuess === room.currentClue.cardCoord;
    room.usedClues.add(room.currentClue.clue.toLowerCase());

    if (correct) {
      room.placed[room.currentClue.cardCoord] = {
        clue: room.currentClue.clue,
        playerName: room.currentClue.playerName,
      };
      room.score++;
    }

    // Remove card from player's hand
    const player = room.players.find(p => p.id === room.currentClue.playerId);
    if (player) {
      player.cards = player.cards.filter(c => c !== room.currentClue.cardCoord);
      const newCard = dealCard(room);
      if (newCard) player.cards.push(newCard);
    }

    room.lastResult = { correct, coord: room.currentClue.cardCoord, guess: room.groupGuess, clue: room.currentClue.clue };
    room.currentClue = null;
    room.groupGuess = null;
    room.phase = 'thinking';

    if (!checkGameEnd(code)) broadcastState(code);
  });

  socket.on('disconnect', () => {
    const code = socket.data.roomCode;
    if (!code) return;
    const room = rooms[code];
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (player) player.online = false;
    broadcastState(code);
    // cleanup empty rooms
    setTimeout(() => {
      if (room && room.players.every(p => !p.online)) {
        if (room.timerInterval) clearInterval(room.timerInterval);
        delete rooms[code];
      }
    }, 60000);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Entre Linhas rodando em http://localhost:${PORT}`));
