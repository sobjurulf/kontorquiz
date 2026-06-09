const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

// Statiske filer
app.use(express.static(path.join(process.cwd(), 'public')));

// Admin-rute eksplisitt
app.get('/admin', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'admin.html'));
});


// --- Fasit ---
let answers = {
  1: '123456789',
  2: '987654321',
  3: '789654321',
  4: '135792468',
  5: '321654987'
};

// --- State ---
let currentRound = 1;
let submissions = { 1: [], 2: [], 3: [], 4: [], 5: [] };

const adminClients = new Set();
const teamClients = new Map();

function broadcastAdmin(data) {
  const msg = JSON.stringify(data);
  for (const ws of adminClients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  }
}

wss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'register_admin') {
      adminClients.add(ws);
      ws.send(JSON.stringify({
        type: 'init',
        answers,
        submissions,
        currentRound
      }));
    }

    if (msg.type === 'register_team') {
      teamClients.set(ws, msg.teamName);
      ws.send(JSON.stringify({ type: 'round', round: currentRound }));
    }

    if (msg.type === 'set_round') {
      currentRound = msg.round;
      for (const [client] of teamClients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({ type: 'round', round: currentRound }));
        }
      }
      broadcastAdmin({ type: 'round_changed', round: currentRound });
    }

    if (msg.type === 'update_answer') {
      answers[msg.round] = msg.answer;
      broadcastAdmin({ type: 'answers_updated', answers });
    }

    if (msg.type === 'submit') {
      const team = teamClients.get(ws) || 'Ukjent';
      const round = msg.round;
      const answer = msg.answer.trim();
      const correct = answer === answers[round];
      const time = new Date().toLocaleTimeString('no-NO');

      const entry = { team, answer, correct, time };
      submissions[round].push(entry);

      ws.send(JSON.stringify({ type: 'result', correct, answer }));
      broadcastAdmin({ type: 'new_submission', round, entry });
    }
  });

  ws.on('close', () => {
    adminClients.delete(ws);
    teamClients.delete(ws);
  });
});

server.listen(8347, () => {
  console.log('Server kjører på port 8347');
});
