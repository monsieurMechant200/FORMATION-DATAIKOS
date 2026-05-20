// api/stats.js — Vercel Serverless Function
// Tableau de bord admin — lit toutes les données Upstash
// Variables : UPSTASH_REDIS_KV_REST_API_URL, UPSTASH_REDIS_KV_REST_API_TOKEN
// Optionnel  : ADMIN_SECRET (protège l'accès)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ADMIN_SECRET = process.env.ADMIN_SECRET;
  if (ADMIN_SECRET && req.headers['x-admin-key'] !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  const URL   = process.env.UPSTASH_REDIS_KV_REST_API_URL;
  const TOKEN = process.env.UPSTASH_REDIS_KV_REST_API_TOKEN;

  if (!URL || !TOKEN) {
    return res.status(500).json({ error: 'Upstash non configuré' });
  }

  const headers = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

  const redisGet = async (key) => {
    const r = await fetch(`${URL}/get/${encodeURIComponent(key)}`, { headers });
    const d = await r.json();
    return d.result ? JSON.parse(d.result) : null;
  };

  const redisGetInt = async (key) => {
    const r = await fetch(`${URL}/get/${encodeURIComponent(key)}`, { headers });
    const d = await r.json();
    return parseInt(d.result || '0');
  };

  try {
    // 1. Total des passages
    const totalPassages = await redisGetInt('stats:total_passages');

    // 2. Passages par quiz
    const quizIds = ['q1','q2','q3','q4','q5','q6','q7'];
    const quizStats = {};
    for (const qid of quizIds) {
      quizStats[qid] = await redisGetInt(`stats:quiz_${qid}`);
    }

    // 3. Liste des participants
    const participantKeys = await redisGet('index:participants') || [];

    // 4. Profils complets
    const participants = [];
    for (const key of participantKeys) {
      const profile = await redisGet(key);
      if (profile) participants.push(profile);
    }

    return res.status(200).json({
      success: true,
      totalPassages,
      quizStats,
      totalParticipants: participants.length,
      participants
    });

  } catch (err) {
    console.error('Stats error:', err);
    return res.status(500).json({ error: 'Erreur serveur', details: err.message });
  }
}
