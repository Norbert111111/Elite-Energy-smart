const express = require("express");
const cors = require("cors");
const { Resend } = require("resend");
const path = require("path");
const fs = require("fs");
const webpush = require("web-push");

const app = express();
const PORT = Number(process.env.PORT || 3000);

const resend = new Resend(process.env.RESEND_API_KEY || "re_configurez_la_cle");
const EMAIL_DEST = process.env.EMAIL_DEST || "electro.elites22@gmail.com";
const FIREBASE_DATABASE_URL = (process.env.FIREBASE_DATABASE_URL || "https://maison-iot-b0dd6-default-rtdb.firebaseio.com").replace(/\/$/, "");
const DATA_DIR = path.join(__dirname, "data");
const PUSH_CONFIG_FILE = path.join(DATA_DIR, "push-config.json");
const SUBSCRIPTIONS_FILE = path.join(DATA_DIR, "push-subscriptions.json");
fs.mkdirSync(DATA_DIR, { recursive: true });

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (_) { return fallback; }
}
function writeJson(file, value) {
  const temporary = file + ".tmp";
  fs.writeFileSync(temporary, JSON.stringify(value, null, 2));
  fs.renameSync(temporary, file);
}
let pushConfig = readJson(PUSH_CONFIG_FILE, null);
if (!pushConfig || !pushConfig.publicKey || !pushConfig.privateKey) {
  pushConfig = webpush.generateVAPIDKeys();
  writeJson(PUSH_CONFIG_FILE, pushConfig);
}
webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:" + EMAIL_DEST, pushConfig.publicKey, pushConfig.privateKey);
let pushSubscriptions = readJson(SUBSCRIPTIONS_FILE, []);
const activeAnomalies = new Map();
const lastPrediction = new Map();

app.use(cors());
app.use(express.json());
require('./voice-api')(app, express, FIREBASE_DATABASE_URL);
app.use(express.static(path.join(__dirname)));

app.get("/api/push/public-key", (_req, res) => res.json({ publicKey: pushConfig.publicKey }));

app.post("/api/push/subscribe", (req, res) => {
  const { subscription, device, user } = req.body || {};
  if (!subscription || !subscription.endpoint || !device || !user) return res.status(400).json({ error: "Abonnement incomplet." });
  const record = { subscription, device: String(device).toUpperCase(), user: String(user), updatedAt: Date.now() };
  const index = pushSubscriptions.findIndex(item => item.subscription && item.subscription.endpoint === subscription.endpoint);
  if (index >= 0) pushSubscriptions[index] = record; else pushSubscriptions.push(record);
  writeJson(SUBSCRIPTIONS_FILE, pushSubscriptions);
  res.status(201).json({ success: true });
});

async function sendPush(device, payload) {
  const targets = pushSubscriptions.filter(item => item.device === device);
  const expired = new Set();
  await Promise.allSettled(targets.map(async item => {
    try { await webpush.sendNotification(item.subscription, JSON.stringify(payload)); }
    catch (error) { if (error.statusCode === 404 || error.statusCode === 410) expired.add(item.subscription.endpoint); else console.error("Web Push:", error.message); }
  }));
  if (expired.size) {
    pushSubscriptions = pushSubscriptions.filter(item => !expired.has(item.subscription.endpoint));
    writeJson(SUBSCRIPTIONS_FILE, pushSubscriptions);
  }
}

function analyseDevice(device, node) {
  const anomalies = [];
  let totalPower = 0, totalCurrent = 0, totalEnergy = 0, measured = 0;
  for (let number = 1; number <= 6; number++) {
    const data = (node && node["Depart" + number]) || {};
    const current = Number(data["CourantD" + number] || 0);
    const voltage = Number(data["TensionD" + number] || 0);
    const power = Number(data["PuissanceD" + number] || 0);
    const energy = Number(data["EnergieD" + number] || 0);
    if (current || voltage || power || energy) measured++;
    totalCurrent += current; totalPower += power; totalEnergy += energy;
    if (current > 100) anomalies.push(`courant élevé sur le départ ${number} (${current.toFixed(1)} A)`);
    if (voltage > 0 && voltage < 200) anomalies.push(`tension faible sur le départ ${number} (${voltage.toFixed(1)} V)`);
    if (voltage > 250) anomalies.push(`tension élevée sur le départ ${number} (${voltage.toFixed(1)} V)`);
    if (power > 25000) anomalies.push(`puissance élevée sur le départ ${number} (${power.toFixed(0)} W)`);
  }
  return { device, anomalies, totalPower, totalCurrent, totalEnergy, measured };
}

async function monitorDevices() {
  const devices = [...new Set(pushSubscriptions.map(item => item.device))];
  for (const device of devices) {
    try {
      const response = await fetch(`${FIREBASE_DATABASE_URL}/${encodeURIComponent(device)}/Donnees${encodeURIComponent(device)}.json`);
      if (!response.ok) throw new Error(`Firebase HTTP ${response.status}`);
      const analysis = analyseDevice(device, await response.json());
      const signature = analysis.anomalies.join("|");
      if (signature && activeAnomalies.get(device) !== signature) {
        await sendPush(device, { title: `Anomalie ${device}`, body: analysis.anomalies.join(" • "), tag: `anomaly-${device}`, url: "./index2.html" });
      } else if (!signature && activeAnomalies.get(device)) {
        await sendPush(device, { title: `${device} revenu à la normale`, body: "Les mesures électriques sont de nouveau dans les seuils normaux.", tag: `anomaly-${device}`, url: "./index2.html" });
      }
      activeAnomalies.set(device, signature);
      const predictionDue = Date.now() - (lastPrediction.get(device) || 0) >= 6 * 60 * 60 * 1000;
      if (predictionDue && analysis.measured) {
        const body = signature ? `Risque détecté : ${analysis.anomalies[0]}.` : `Prévision stable : ${analysis.totalPower.toFixed(0)} W, ${analysis.totalCurrent.toFixed(1)} A, aucune anomalie.`;
        await sendPush(device, { title: `Prédiction automatique ${device}`, body, tag: `prediction-${device}`, url: "./index2.html" });
        lastPrediction.set(device, Date.now());
      }
    } catch (error) { console.error(`Surveillance ${device}:`, error.message); }
  }
}
setInterval(monitorDevices, 30000);
setTimeout(monitorDevices, 3000);

// ROUTE 1 : Formulaire de contact
app.post("/api/contact", async (req, res) => {
  const { nom, email, message } = req.body;
  if (!nom || !email || !message) return res.status(400).json({ error: "Champs manquants." });
  try {
    await resend.emails.send({
      from: "Elite Energy <onboarding@resend.dev>",
      to: EMAIL_DEST,
      subject: `Nouveau message de contact - ${nom}`,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#f4f7fa;padding:2rem;border-radius:16px"><div style="background:linear-gradient(135deg,#3b82f6,#1d4ed8);padding:2rem;border-radius:12px;text-align:center;margin-bottom:2rem"><h1 style="color:white;margin:0">Elite Energy</h1><p style="color:rgba(255,255,255,0.8);margin:0.5rem 0 0">Nouveau message de contact</p></div><div style="background:white;padding:2rem;border-radius:12px;border:1px solid #e2e8f0"><p style="color:#64748b;font-size:0.9rem;margin-bottom:1.5rem">Recu le : <strong>${new Date().toLocaleString("fr-FR")}</strong></p><p><strong>Nom :</strong> ${nom}</p><p><strong>Email :</strong> <a href="mailto:${email}">${email}</a></p><div style="margin-top:1.5rem;padding:1.5rem;background:#f8fafc;border-left:4px solid #3b82f6;border-radius:8px"><p style="font-weight:700;color:#0f172a;margin-bottom:0.5rem">Message :</p><p style="color:#334155;line-height:1.7;margin:0">${message}</p></div><div style="margin-top:1.5rem;text-align:center"><a href="mailto:${email}" style="background:#3b82f6;color:white;padding:0.8rem 2rem;border-radius:10px;text-decoration:none;font-weight:700;display:inline-block">Repondre a ${nom}</a></div></div><p style="text-align:center;color:#94a3b8;font-size:0.8rem;margin-top:1.5rem">2026 Elite Energy - @electro-elites</p></div>`,
    });
    res.json({ success: true });
  } catch (err) {
    console.error("Erreur Resend :", err);
    res.status(500).json({ error: "Erreur lors de l envoi." });
  }
});

// ROUTE 2 : Bienvenue nouvel utilisateur
app.post("/api/welcome", async (req, res) => {
  const { nomComplet, username, role, appareil } = req.body;
  if (!nomComplet || !username) return res.status(400).json({ error: "Champs manquants." });
  try {
    await resend.emails.send({
      from: "Elite Energy Admin <onboarding@resend.dev>",
      to: EMAIL_DEST,
      subject: `Nouvel utilisateur cree - ${nomComplet}`,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#f4f7fa;padding:2rem;border-radius:16px"><div style="background:linear-gradient(135deg,#10b981,#059669);padding:2rem;border-radius:12px;text-align:center;margin-bottom:2rem"><h1 style="color:white;margin:0">Nouvel Utilisateur</h1><p style="color:rgba(255,255,255,0.8);margin:0.5rem 0 0">Elite Energy Smart Grid</p></div><div style="background:white;padding:2rem;border-radius:12px;border:1px solid #e2e8f0"><p>Cree le : <strong>${new Date().toLocaleString("fr-FR")}</strong></p><p><strong>Nom :</strong> ${nomComplet}</p><p><strong>Identifiant :</strong> <code>${username}</code></p><p><strong>Role :</strong> ${role}</p><p><strong>Appareil assigne :</strong> <code>${appareil}</code></p></div><p style="text-align:center;color:#94a3b8;font-size:0.8rem;margin-top:1.5rem">2026 Elite Energy - @electro-elites</p></div>`,
    });
    res.json({ success: true });
  } catch (err) {
    console.error("Erreur Resend :", err);
    res.status(500).json({ error: "Erreur lors de l envoi." });
  }
});

// ROUTE 3 : Appareil IoT connecte
app.post("/api/device-connected", async (req, res) => {
  const { deviceId, description, gps, voltage, power } = req.body;
  try {
    await resend.emails.send({
      from: "Elite Energy Admin <onboarding@resend.dev>",
      to: EMAIL_DEST,
      subject: `Nouvel appareil connecte - ${deviceId}`,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#f4f7fa;padding:2rem;border-radius:16px"><div style="background:linear-gradient(135deg,#0f172a,#1e3a8a);padding:2rem;border-radius:12px;text-align:center;margin-bottom:2rem"><h1 style="color:white;margin:0">Appareil Connecte</h1><p style="color:rgba(255,255,255,0.7);margin:0.5rem 0 0">Smart Grid Elite Energy RDC</p></div><div style="background:white;padding:2rem;border-radius:12px;border:1px solid #e2e8f0"><p>Initialise le : <strong>${new Date().toLocaleString("fr-FR")}</strong></p><p><strong>ID :</strong> <code style="color:#3b82f6">${deviceId}</code></p><p><strong>Description :</strong> ${description}</p><p><strong>GPS :</strong> ${gps || "Non renseigne"}</p><p><strong>Tension :</strong> ${voltage}V</p><p><strong>Puissance max :</strong> ${power} kVA</p></div><p style="text-align:center;color:#94a3b8;font-size:0.8rem;margin-top:1.5rem">2026 Elite Energy - @electro-elites</p></div>`,
    });
    res.json({ success: true });
  } catch (err) {
    console.error("Erreur Resend :", err);
    res.status(500).json({ error: "Erreur lors de l envoi." });
  }
});

app.listen(PORT, () => {
  console.log(`Serveur Elite Energy demarre sur http://localhost:${PORT}`);
  console.log(`Emails envoyes a : ${EMAIL_DEST}`);
});
