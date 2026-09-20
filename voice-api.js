'use strict';
const crypto = require('node:crypto');

// Only audio transcription lives here; commands still use the existing Firebase path.
module.exports = function installVoiceApi(app, express, databaseUrl) {
  const sessions = new Map(), limits = new Map();
  function limited(key, max) {
    const now = Date.now();
    for (const [k, v] of limits) if (v.until < now) limits.delete(k);
    const entry = limits.get(key) || { count: 0, until: now + 60000 };
    entry.count++; limits.set(key, entry);
    return entry.count > max;
  }
  app.get('/api/voice/config', (_req, res) => {
    res.set('Cache-Control', 'no-store').json({ enabled: Boolean(process.env.OPENAI_API_KEY) });
  });
  app.post('/api/voice/session', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: 'Transcription IA non configurée.' });
    if (limited('login:' + req.ip, 10)) return res.status(429).json({ error: 'Trop de tentatives. Réessayez dans une minute.' });
    const { device, user, password } = req.body || {};
    if (typeof device !== 'string' || !/^ELITE\d+$/.test(device) || typeof user !== 'string' || !user || user.length > 128 || /[.#$\[\]/]/.test(user) || typeof password !== 'string' || password.length > 256) {
      return res.status(400).json({ error: 'Identifiants invalides.' });
    }
    try {
      const response = await fetch(`${databaseUrl}/${device}/users${device}/${encodeURIComponent(user)}.json`, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('account');
      const account = await response.json();
      if (!account || account.active === false || account.password !== password) return res.status(401).json({ error: 'Mot de passe incorrect ou compte inactif.' });
      for (const [token, value] of sessions) if (value.expires < Date.now()) sessions.delete(token);
      if (sessions.size >= 1000) return res.status(503).json({ error: 'Service occupé.' });
      const token = crypto.randomBytes(32).toString('hex');
      sessions.set(token, { expires: Date.now() + 15 * 60000, busy: false, device, user });
      res.json({ token });
    } catch (_) { res.status(503).json({ error: 'Vérification du compte indisponible.' }); }
  });
  app.post('/api/voice/transcribe', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const token = (req.get('Authorization') || '').replace(/^Bearer /, '');
    const session = sessions.get(token);
    if (!session || session.expires < Date.now()) { sessions.delete(token); return res.status(401).json({ error: 'Session vocale expirée. Réactivez le microphone.' }); }
    if (session.busy || limited('audio:' + session.device + ':' + session.user, 20)) return res.status(429).json({ error: 'Trop de demandes vocales. Patientez un instant.' });
    if (!/^audio\/(webm|mp4|ogg|wav)(;|$)/i.test(req.get('Content-Type') || '')) return res.status(415).json({ error: 'Format audio non pris en charge.' });
    session.busy = true;
    res.on('finish', () => { session.busy = false; });
    res.on('close', () => { session.busy = false; });
    next();
  }, express.raw({ type: 'audio/*', limit: '2mb' }), async (req, res) => {
    if (!Buffer.isBuffer(req.body) || req.body.length < 100) return res.status(400).json({ error: 'Audio vide.' });
    try {
      const mime = req.get('Content-Type').split(';')[0];
      const extension = { 'audio/mp4': 'mp4', 'audio/ogg': 'ogg', 'audio/wav': 'wav' }[mime] || 'webm';
      const form = new FormData();
      form.append('file', new Blob([req.body], { type: mime }), 'commande.' + extension);
      form.append('model', 'gpt-4o-transcribe');
      form.append('language', 'fr');
      form.append('response_format', 'json');
      form.append('prompt', 'Commande vocale pour ELITE ÉNERGIE. Vocabulaire : départ 1, départ 2, départ 3, départ 4, départ 5, départ 6, deuxième départ, allumer, éteindre, activer, désactiver, mettre en marche, couper.');
      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST', headers: { Authorization: 'Bearer ' + process.env.OPENAI_API_KEY }, body: form, signal: AbortSignal.timeout(25000)
      });
      if (!response.ok) return res.status(502).json({ error: 'Transcription IA indisponible. Vérifiez la clé API et le crédit du compte sur le serveur.' });
      const result = await response.json();
      res.json({ text: typeof result.text === 'string' ? result.text : '' });
    } catch (_) { res.status(503).json({ error: 'La transcription a échoué. Réessayez.' }); }
  });
  app.use('/api/voice', (err, _req, res, _next) => {
    res.status(err.type === 'entity.too.large' ? 413 : 400).json({ error: 'Enregistrement audio invalide ou trop long.' });
  });
};
