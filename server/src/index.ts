import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import healthRouter from './routes/health.js';
import testDbRouter from './routes/test-db.js';
import businessesRouter from './routes/businesses.js';
import workflowsRouter from './routes/workflows.js';
import conversationsRouter from './routes/conversations.js';
import voiceRouter from './routes/voice.js';
import callsRouter from './routes/calls.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

// CORS configuration allowing client request
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, or server-to-server)
      if (!origin) return callback(null, true);
      if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1') || origin === CLIENT_ORIGIN) {
        return callback(null, true);
      }
      return callback(null, true); // Permissive in dev mode for local testing
    },
    credentials: true,
  })
);

app.use(express.json());

// Routes
app.use('/api', healthRouter);
app.use('/api', testDbRouter);
app.use('/api', businessesRouter);
app.use('/api', workflowsRouter);
app.use('/api', conversationsRouter);
app.use('/api', voiceRouter);
app.use('/api', callsRouter);

app.get('/', (_req, res) => {
  res.json({
    message: 'Voice AI Personal Assistant API is running.',
    healthCheck: '/api/health',
  });
});

app.listen(PORT, () => {
  console.log(`[server]: Express server running on port ${PORT}`);
});
