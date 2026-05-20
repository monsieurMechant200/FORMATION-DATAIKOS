// api/track.js — Vercel Serverless Function
// Enregistre le score d'un participant dans Upstash Redis
// Variables : UPSTASH_REDIS_KV_REST_API_URL, UPSTASH_REDIS_KV_REST_API_TOKEN

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { nom, prenom, quizId, quizTitre, score, total, pct, timestamp } = req.body;

  if (!nom || !prenom || !quizId || score === undefined) {
    return res.status(400).json({ error: 'Données manquantes' });
  }

  const URL   = process.env.UPSTASH_REDIS_KV_REST_API_URL;
  const TOKEN = process.env.UPSTASH_REDIS_KV_REST_API_TOKEN;

  if (!URL || !TOKEN) {
    return res.status(500).json({ error: 'Upstash non configuré', vars: {
      url: !!process.env.UPSTASH_REDIS_KV_REST_API_URL,
      token: !!process.env.UPSTASH_REDIS_KV_REST_API_TOKEN
    }});
  }

  const headers = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

  // GET une clé
  const redisGet = async (key) => {
    const r = await fetch(`${URL}/get/${encodeURIComponent(key)}`, { headers });
    const d = await r.json();
    return d.result ? JSON.parse(d.result) : null;
  };

  // SET une clé (valeur sérialisée en JSON string)
  const redisSet = async (key, value) => {
    await fetch(`${URL}/set/${encodeURIComponent(key)}/${encodeURIComponent(JSON.stringify(value))}`, {
      method: 'POST',
      headers
    });
  };

  // INCR un compteur
  const redisIncr = async (key) => {
    await fetch(`${URL}/incr/${encodeURIComponent(key)}`, { method: 'POST', headers });
  };

  // GET un entier
  const redisGetInt = async (key) => {
    const r = await fetch(`${URL}/get/${encodeURIComponent(key)}`, { headers });
    const d = await r.json();
    return parseInt(d.result || '0');
  };

  try {
    const ts = timestamp || new Date().toISOString();
    const participantKey = `participant:${prenom.toLowerCase().trim()}_${nom.toLowerCase().trim()}`;

    // 1. Récupérer le profil existant
    let profile = await redisGet(participantKey);
    if (!profile) profile = { nom, prenom, quizzes: {} };

    // 2. Initialiser le quiz si absent
    if (!profile.quizzes[quizId]) {
      profile.quizzes[quizId] = { quizId, quizTitre, tentatives: [] };
    }

    const q = profile.quizzes[quizId];
    const tentativeNum = q.tentatives.length + 1;

    // Limiter à 2 tentatives enregistrées
    if (q.tentatives.length < 2) {
      q.tentatives.push({ score, total, pct, timestamp: ts });
    }

    // 3. Sauvegarder le profil
    await redisSet(participantKey, profile);

    // 4. Compteur global
    await redisIncr('stats:total_passages');

    // 5. Compteur par quiz
    await redisIncr(`stats:quiz_${quizId}`);

    // 6. Index des participants
    let index = await redisGet('index:participants');
    if (!index) index = [];
    if (!index.includes(participantKey)) {
      index.push(participantKey);
      await redisSet('index:participants', index);
    }

    const numEnregistre = Math.min(tentativeNum, 2);
    return res.status(200).json({
      success: true,
      tentativeNum: numEnregistre,
      message: tentativeNum > 2
        ? 'Score non enregistré (2 tentatives max atteintes)'
        : `Score enregistré (tentative ${numEnregistre})`
    });

  } catch (err) {
    console.error('Upstash error:', err);
    return res.status(500).json({ error: 'Erreur serveur', details: err.message });
  }
}
