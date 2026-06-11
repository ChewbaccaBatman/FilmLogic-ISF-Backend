import express from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';
import { fileISF } from './ace-filer.js';

const app = express();
const PORT = process.env.PORT || 3001;
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(cors());
app.use(express.json({ limit: '20mb' }));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'Film Logic ISF Backend' });
});

app.post('/extract-isf', async (req, res) => {
  const { text, pdfBase64 } = req.body;
  if (!text && !pdfBase64) return res.status(400).json({ error: 'Provide text or pdfBase64' });

  const system = `You are an expert ISF clerk for Film Logic. Extract the 10+2 ISF fields from shipment documents. If a field is absent, set it to null. Respond ONLY with valid JSON (no markdown, no preamble) with exactly these keys: seller, buyer, importer_of_record, consignee, manufacturer, ship_to_party, country_of_origin, hts_codes, container_stuffing_location, consolidator, vessel_voyage, bill_of_lading. For hts_codes return a comma-separated string if multiple.`;

  const userContent = [];
  if (pdfBase64) userContent.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } });
  userContent.push({ type: 'text', text: text ? `Extract ISF fields:\n\n${text}` : 'Extract all ISF fields from the uploaded document.' });

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1000,
      system,
      messages: [{ role: 'user', content: userContent }],
    });
    const raw = message.content.map(b => b.text || '').join('');
    const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
    res.json({ success: true, isf: parsed });
  } catch (err) {
    console.error('Extraction error:', err);
    res.status(500).json({ error: err.message || 'Extraction failed' });
  }
});

app.post('/file-isf', async (req, res) => {
  const { credentials, isf } = req.body;
  if (!credentials?.username || !credentials?.password) return res.status(400).json({ error: 'ACE credentials required' });
  if (!isf || typeof isf !== 'object') return res.status(400).json({ error: 'ISF data required' });

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
