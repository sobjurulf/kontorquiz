const express = require('express');
const cors = require('cors');
const path = require('path');

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

app.get('/api/state', (req, res) => {
  res.json({ currentRound });
});

app.get('/api/submissions', (req, res) => {
  res.json({ submissions, answers, currentRound });
});

app.post('/api/submit', (req, res) => {
  const { team, round, answer } = req.body;
  if (!team || !round || !answer) return res.status(400).json({ error: 'Mangler data' });

  const correct = answer.trim() === answers[round];
  const time = new Date().toLocaleTimeString('no-NO');
  const entry = { team, answer: answer.trim(), correct, time };

  submissions[round].push(entry);
  res.json({ correct, answer: answer.trim() });
});

app.post('/api/set-round', (req, res) => {
  const { round } = req.body;
  if (!round) return res.status(400).json({ error: 'Mangler runde' });
  currentRound = round;
  res.json({ ok: true, currentRound });
});

app.post('/api/set-answer', (req, res) => {
  const { round, answer } = req.body;
  if (!round || !answer) return res.status(400).json({ error: 'Mangler data' });
  answers[round] = answer.trim();
  res.json({ ok: true });
});

const PORT = process.env.PORT || 8347;
app.listen(PORT, () => {
  console.log(`Server kjører på port ${PORT}`);
});
