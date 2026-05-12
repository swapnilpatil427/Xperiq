require('dotenv').config();
const functions = require('firebase-functions/v2');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// Routes
app.use('/api/public', require('./routes/public'));
app.use('/api/surveys', require('./routes/surveys'));
app.use('/api/surveys/:surveyId/responses', require('./routes/responses'));
app.use('/api/surveys/:surveyId/insights', require('./routes/insights'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/workflows', require('./routes/workflows'));

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', version: '1.0.0' }));

// Export as Cloud Function
exports.api = functions.https.onRequest({ region: 'us-central1', memory: '256MiB' }, app);

// Firestore triggers
const { onNewResponse } = require('./triggers/onNewResponse');
exports.onNewResponse = onNewResponse;
