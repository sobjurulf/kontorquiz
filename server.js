const express = require('express');
const cors = require('cors');
const path = require('path');
const { WebSocketServer } = require('ws'); // Henter WebSocket-støtte

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(process.cwd(), 'public')));

app.get('/admin', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'admin.html'));
});

// --- State ---
let answers = {
  1: '123456789',
  2: '987654321',
  3: '789654321',
  4: '135792468',
  5: '321654987'
};

let currentRound = 1;
let submissions = { 1: [], 2: [], 3: [], 4: [], 5: [] };

// Lagring av aktive WebSocket-tilkoblinger
let adminClients = new Set();
let teamClients = new Map(); // teamName -> ws

// Standard HTTP API (Beholdes i tilfelle du trenger dem senere)
app.get('/api/state', (req, res) => {
  res.json({ currentRound });
});

app.get('/api/submissions', (req, res) => {
  res.json({ submissions, answers, currentRound });
});

// Start HTTP-serveren først
const PORT = process.env.PORT || 8347;
const server = app.listen(PORT, () => {
  console.log(`Server kjører på port ${PORT}`);
});

// Start WebSocket-serveren på toppen av HTTP-serveren
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  let registeredTeam = null;

  ws.on('message', (message) => {
    try {
      const msg = JSON.parse(message);

      // 1. Registrer Admin
      if (msg.type === 'register_admin') {
        adminClients.add(ws);
        // Send start-tilstand til admin
        ws.send(JSON.stringify({
          type: 'init',
          answers,
          submissions,
          currentRound
        }));
      }

      // 2. Registrer Lag
      if (msg.type === 'register_team') {
        registeredTeam = msg.teamName;
        teamClients.set(registeredTeam, ws);
        // Send nåværende runde til laget med en gang de blir med
        ws.send(JSON.stringify({ type: 'round', round: currentRound }));
      }

      // 3. Lag sender inn svar
      if (msg.type === 'submit') {
        const { round, answer } = msg;
        if (!registeredTeam || !round || !answer) return;

        const correct = answer.trim() === answers[round];
        const time = new Date().toLocaleTimeString('no-NO');
        const entry = { team: registeredTeam, answer: answer.trim(), correct, time };

        submissions[round].push(entry);

        // Gi tilbakemelding til laget
        ws.send(JSON.stringify({ type: 'result', correct, answer: answer.trim() }));

        // Oppdater alle admin-sider live
        const adminMsg = JSON.stringify({ type: 'new_submission', round, entry });
        adminClients.forEach(admin => {
          if (admin.readyState === 1) admin.send(adminMsg);
        });
      }

      // 4. Admin endrer runde
      if (msg.type === 'set_round') {
        currentRound = msg.round;
        // Beskjed til alle lag
        const roundMsg = JSON.stringify({ type: 'round', round: currentRound });
        teamClients.forEach(client => {
          if (client.readyState === 1) client.send(roundMsg);
        });
        // Beskjed til alle admins
        const adminRoundMsg = JSON.stringify({ type: 'round_changed', round: currentRound });
        adminClients.forEach(admin => {
          if (admin.readyState === 1) admin.send(adminRoundMsg);
        });
      }

      // 5. Admin oppdaterer fasit
      if (msg.type === 'update_answer') {
        answers[msg.round] = msg.answer.trim();
        const updateMsg = JSON.stringify({ type: 'answers_updated', answers });
        adminClients.forEach(admin => {
          if (admin.readyState === 1) admin.send(updateMsg);
        });
      }

    } catch (err) {
      console.error('Feil ved prosessering av WS-melding:', err);
    }
  });

  ws.on('close', () => {
    adminClients.delete(ws);
    if (registeredTeam) {
      teamClients.delete(registeredTeam);
    }
  });
});
