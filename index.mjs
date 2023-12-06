import express from 'express';
import { crawData } from './craw-data.mjs';

const app = express();
const PORT = process.env.PORT || 4000;

app.get('/', (req, res) => {
  res.send('Petrol Mate crawler home page...');
});

app.get('/craw-data', (req, res) => {
  crawData(res);
});

app.listen(PORT, (req, res) => {
  console.log(`Listening on port ${PORT}`);
});
