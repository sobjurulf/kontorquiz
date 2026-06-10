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
// Runde 'Test' og 1-4 har standard 9-sifrede koder som fasit (kan endres i admin)
let answers = {
  'Test': '123456789',
  1: '987654321',
  2: '789654321',
  3: '135792468',
  4: '321654987'
};

let currentRound = 'Test'; // Quizen starter på testrunden
let submissions = { 'Test': [], 1: [], 2: [], 3: [], 4: [] };

// Lagring av aktive WebSocket-tilkoblinger
let adminClients = new Set();
let teamClients = new Map(); // teamName -> ws

// Standard HTTP API
app.get('/api/state', (req, res) => {
  res.json({ currentRound });
});

app.get('/api/submissions', (req, res) => {
  res.json({ submissions, answers, currentRound });
});

// --- Generer Poengtavle ---
app.get('/api/scoreboard', (req, res) => {
  let teamScores = {}; // { lagnavn: { runder: [0,0,0,0], total: 0 } }

  // Vi går KUN gjennom konkurranserundene (1 til 4). Testrunden hoppes over (gir 0 poeng).
  for (let round = 1; round <= 4; round++) {
    const roundSubs = submissions[round] || [];
    const correctSubs = roundSubs.filter(s => s.correct);

    correctSubs.forEach((sub, index) => {
      const team = sub.team;
      
      if (!teamScores[team]) {
        teamScores[team] = {
          team: team,
          rounds: { 1: 0, 2: 0, 3: 0, 4: 0 },
          total: 0
        };
      }

      // Poengfordeling etter dine regler
      let points = 5; 
      if (index === 0) points = 10;      // 1. plass
      else if (index === 1) points = 9;  // 2. plass
      else if (index === 2) points = 8;  // 3. plass
      else if (index === 3) points = 7;  // 4. plass
      else if (index === 4) points = 6;  // 5. plass

      teamScores[team].rounds[round] = points;
    });
  }

  // Sørg for at alle registrerte lag vises, selv om de har 0 poeng
  teamClients.forEach((ws, teamName) => {
    if (!teamScores[teamName]) {
      teamScores[teamName] = {
        team: teamName,
        rounds: { 1: 0, 2: 0, 3: 0, 4: 0 },
        total: 0
      };
    }
  });

  const scoreboardArray = Object.values(teamScores).map(teamData => {
    const total = Object.values(teamData.rounds).reduce((sum, p) => sum + p, 0);
    return {
      ...teamData,
      total: total
    };
  });

  scoreboardArray.sort((a, b) => b.total - a.total);
  res.json(scoreboardArray);
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
