import express from 'express';
import cors from 'cors';
import { fileISF } from './ace-filer.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'Film Logic ISF Backend' });
});

// Main filing endpoint — streams progress back as newline-delimited JSON
app.post('/file-isf', async (req, res) => {
  const { credentials, isf } = req.body;

  if (!credentials?.username || !credentials?.password) {
    return res.status(400).json({ error: 'ACE credentials required' });
  }
  if (!isf || typeof isf !== 'object') {
    return res.status(400).json({ error: 'ISF data required' });
  }

  // Stream logs back to client
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const sendEvent = (type, message, data = {}) => {
    res.write(`data: ${JSON.stringify({ type, message, ...data })}\n\n`);
  };

  try {
    const confirmation = await fileISF({ credentials, isf, onLog: sendEvent });
    sendEvent('done', 'ISF filed successfully', { confirmation });
  } catch (err) {
    sendEvent('error', err.message || 'Filing failed');
  } finally {
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`Film Logic ISF backend running on port ${PORT}`);
});
