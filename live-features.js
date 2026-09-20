(function () {
  'use strict';
  const device = sessionStorage.getItem('currentDevice');
  const user = sessionStorage.getItem('currentUser');
  if (!device || !user || typeof database === 'undefined') return;

  const account = database.ref(device + '/users' + device + '/' + user);
  const presence = database.ref('presence/' + device + '/' + user);
  account.on('value', snapshot => {
    if (!snapshot.exists() || snapshot.val().active === false) {
      presence.update({ online: false, lastSeen: Date.now() });
      sessionStorage.clear();
      location.replace('login.html');
    }
  });
  function heartbeat(activity) {
    presence.update({ online: true, lastSeen: Date.now(), activity: activity || document.title });
  }
  presence.onDisconnect().update({ online: false, lastSeen: firebase.database.ServerValue.TIMESTAMP });
  heartbeat();
  setInterval(() => heartbeat(), 30000);
  document.addEventListener('click', event => {
    const label = event.target.closest('button, a');
    if (label) heartbeat((label.textContent || label.title || 'Action').trim().slice(0, 80));
  });
  window.addEventListener('pagehide', () => presence.update({ online: false, lastSeen: Date.now() }));

  const adminIcon = document.getElementById('adminNavIcon');
  if (adminIcon && device === 'ELITE1') adminIcon.style.display = '';

  let pushSetupStarted = false;
  async function setupPushNotifications() {
    if (pushSetupStarted || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
    pushSetupStarted = true;
    try {
      const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
      if (permission !== 'granted') return;
      const registration = await navigator.serviceWorker.register('service-worker.js');
      const keyResponse = await fetch('/api/push/public-key');
      if (!keyResponse.ok) throw new Error('Serveur push indisponible');
      const { publicKey } = await keyResponse.json();
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      });
      await fetch('/api/push/subscribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription, device, user })
      });
    } catch (error) {
      console.warn('Notifications push non activées :', error.message);
      pushSetupStarted = false;
    }
  }
  function urlBase64ToUint8Array(value) {
    const padding = '='.repeat((4 - value.length % 4) % 4);
    const raw = atob((value + padding).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from([...raw].map(char => char.charCodeAt(0)));
  }
  document.addEventListener('pointerdown', setupPushNotifications, { once: true, passive: true });
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') setupPushNotifications();

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const voiceButton = document.getElementById('voiceCommandButton');
  let recognition, restartTimer, stream, audioContext, recorder, audioTimer, request;
  let recognitionRunning = false;
  let voiceActive = false, generation = 0, speaking = false, token = '', mode = 'browser';
  let commandQueue = Promise.resolve();
  const voiceSessionKey = 'eliteVoiceSession:' + device + ':' + user;
  let tokenExpires = 0;
  try {
    const saved = JSON.parse(sessionStorage.getItem(voiceSessionKey) || 'null');
    if (saved && saved.expires > Date.now()) { token = saved.token; tokenExpires = saved.expires; }
  } catch (_) { /* Storage can be unavailable in private browsing. */ }
  if (voiceButton) {
    voiceButton.addEventListener('click', () => voiceActive ? stopVoice() : startVoice());
  }
  // No transcript or status text is rendered below the microphone.
  // Errors remain available on the icon without displaying recognized speech.
  function show(message) {
    if (!voiceButton || message.startsWith('Entendu :')) return;
    voiceButton.title = message;
  }
  function forgetVoiceSession() {
    token = ''; tokenExpires = 0;
    try { sessionStorage.removeItem(voiceSessionKey); } catch (_) {}
  }
  function normalize(raw) {
    return String(raw || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/d[ée]?part\s*([1-6])/g, 'depart $1').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
      .replace(/\b(de part|des parts|des par|de par|departement)\b/g, 'depart')
      .replace(/\b(depart|circuit|sortie|ligne|numero) (?:numero )?(de|d eux|d oeufs)\b(?=\s*$|\s+(?:s il|sil|svp|maintenant|en marche|en service))/g, '$1 deux');
  }
  function extractIntent(words) {
    // Negation, exclusions and mixed actions require a new, unambiguous command.
    if (/\b(pas|jamais|sauf|except|excepté|sans|ne|n|don t|dont|not|annule|annuler|si|quand|demain|dans|pourquoi|comment)\b/.test(words)) return null;
    const off = /\b(eteins?|eteindre|eteidre|eteignez|eteint|coupe|couper|coupez|coupure|arrete|arreter|arretez|arret|desactive|desactiver|desactivez|debranche|debrancher|declenche|declencher|ferme|fermer|hors service|hors tension|stop|stops|stopping|disable|disabled|deactivate|deactivated|disconnect|shutdown|shut down|power down|switch off|switch of|turn off|turn of|off|zimisha|zinusha|zima|izima|funga|ondoa|toa)\b/.test(words);
    const on = /\b(allume|allumer|allumez|allumage|active|activer|activez|activation|demarre|demarrer|demarrez|marche|en service|sous tension|branche|brancher|enclenche|enclencher|alimente|alimenter|ouvre|ouvrir|start|starts|enable|enabled|activate|activated|connect|launch|power up|power on|light up|energize|switch on|turn on|on|akisha|wakisha|washa|fungua|waka)\b/.test(words);
    return on === off ? null : { on };
  }
  function extractDepartures(words) {
    const mapped = { un:1, une:1, premier:1, premiere:1, one:1, first:1, moja:1, kwanza:1,
      deux:2, second:2, seconde:2, deuxieme:2, two:2, mbili:2, pili:2,
      trois:3, troisieme:3, three:3, third:3, tatu:3, quatre:4, quatrieme:4, four:4, fourth:4, nne:4,
      cinq:5, cinquieme:5, five:5, fifth:5, tano:5, six:6, sixieme:6, sixth:6, sita:6 };
    if (/\b(tous|toutes|tout|ensemble|all|every|each|zote|wote|vyote)\b/.test(words)) return [1,2,3,4,5,6];
    if (/\b([7-9]|\d{2,}|zero|sept|huit|neuf|dix)\b/.test(words)) return [];
    const result = new Set(), tokens = words.split(' ');
    tokens.forEach((value, index) => {
      const number = /^[1-6]$/.test(value) ? Number(value) : mapped[value];
      if (!number) return;
      // Articles and quantities are not circuit identifiers: "mets en marche le départ deux".
      if (/^(departs|sorties|circuits|lignes|feeders|lines)$/.test(tokens[index + 1] || '')) return;
      if (/^(un|une)$/.test(value) && /^(depart|sortie|circuit|ligne)$/.test(tokens[index + 1] || '')) return;
      result.add(number);
    });
    return [...result].sort();
  }
  function parse(raw) {
    const words = normalize(raw), intent = extractIntent(words), departures = extractDepartures(words);
    return { understood: Boolean(intent && departures.length), on: intent ? intent.on : null, departures };
  }
  window.EliteVoiceParser = { parse };
  function selectAlternative(alternatives) {
    const first = parse(alternatives[0]);
    // Never use an alternate to turn an explicit negation into an action.
    if (!extractIntent(normalize(alternatives[0]))) return null;
    const valid = alternatives.map(raw => ({ raw, parsed: parse(raw) })).filter(item => item.parsed.understood);
    if (!valid.length) return null;
    const signature = item => JSON.stringify([item.parsed.on, item.parsed.departures]);
    if (new Set(valid.map(signature)).size !== 1) return null;
    return first.understood ? alternatives[0] : valid[0].raw;
  }
  function enqueue(raw, session) {
    commandQueue = commandQueue.then(async () => {
      if (!voiceActive || session !== generation) return;
      const parsed = parse(raw);
      show('Entendu : « ' + raw + ' »');
      if (!parsed.understood) { await speak('Précisez une action et un départ. Par exemple : allume le départ deux.'); return; }
      const updates = Object.fromEntries(parsed.departures.map(number => ['Commande' + number, parsed.on ? 1 : 0]));
      try {
        await database.ref(device + '/Commande' + device).update(updates);
        if (!voiceActive || session !== generation) return;
        const message = (parsed.on ? 'Activation' : 'Désactivation') + ' demandée pour le départ ' + parsed.departures.join(', ') + '.';
        heartbeat('Vocal : ' + message);
        await speak(message);
      } catch (_) { if (voiceActive && session === generation) show('Commande non envoyée. Vérifiez la connexion.'); }
    }).catch(() => show('Commande vocale interrompue. Réessayez.'));
    return commandQueue;
  }
  async function startVoice() {
    const session = ++generation;
    voiceActive = true;
    voiceButton.classList.add('voice-active');
    voiceButton.setAttribute('aria-pressed', 'true');
    voiceButton.title = 'Arrêter la commande vocale';
    show('Préparation du microphone…');
    try {
      // Read the browser's real permission; never use a local flag to fake it.
      let permission;
      try { permission = await navigator.permissions?.query({ name: 'microphone' }); } catch (_) {}
      if (!voiceActive || session !== generation) return;
      if (permission?.state === 'denied') throw new Error('Microphone bloqué : autorisez-le dans les paramètres du site de votre navigateur.');
      let config = { enabled: false };
      try {
        const response = await fetch('/api/voice/config', { signal: AbortSignal.timeout(5000) });
        if (response.ok) config = await response.json();
      } catch (_) { /* Static hosting retains browser recognition. */ }
      if (!voiceActive || session !== generation) return;
      if (config.enabled && navigator.mediaDevices && window.MediaRecorder && (window.AudioContext || window.webkitAudioContext)) {
        mode = 'ai';
        if (!token || tokenExpires <= Date.now()) {
        forgetVoiceSession();
        const password = await askPassword();
        if (!voiceActive || session !== generation) return;
        if (password === null) { stopVoice(); return; }
        const response = await fetch('/api/voice/session', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ device, user, password }), signal: AbortSignal.timeout(15000)
        });
        const data = await response.json();
        if (!voiceActive || session !== generation) return;
        if (!response.ok) throw new Error(data.error || 'Connexion vocale impossible.');
        token = data.token;
        // Reuse the existing 15-minute server session, with an expiry margin.
        tokenExpires = Date.now() + 14 * 60000;
        try { sessionStorage.setItem(voiceSessionKey, JSON.stringify({ token, expires: tokenExpires })); } catch (_) {}
        }
        const acquired = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
        if (!voiceActive || session !== generation) { acquired.getTracks().forEach(track => track.stop()); return; }
        stream = acquired;
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        await audioContext.resume();
        if (!voiceActive || session !== generation) return;
        listenAudio(session);
      } else {
        mode = 'browser';
        if (!SpeechRecognition) throw new Error('Reconnaissance indisponible. Configurez la transcription IA ou utilisez Chrome/Edge avec HTTPS.');
        startBrowser(session);
      }
    } catch (error) {
      if (session !== generation) return;
      stopVoice();
      show(error.name === 'NotAllowedError' ? 'Autorisez le microphone dans votre navigateur.' : error.message);
    }
  }
  function askPassword() {
    return new Promise(resolve => {
      const dialog = document.createElement('dialog');
      dialog.innerHTML = '<form method="dialog"><p>Commande vocale IA : votre audio sera envoyé à OpenAI pour transcription.</p><label>Confirmez votre mot de passe ELITE <input type="password" autocomplete="current-password" required></label><p><button value="ok">Activer</button> <button value="cancel" formnovalidate>Annuler</button></p></form>';
      document.body.appendChild(dialog);
      dialog.addEventListener('close', () => { const value = dialog.returnValue === 'ok' ? dialog.querySelector('input').value : null; dialog.remove(); resolve(value); }, { once: true });
      dialog.showModal();
    });
  }
  function startBrowser(session) {
    recognition = new SpeechRecognition();
    recognition.lang = 'fr-FR';
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.maxAlternatives = 5;
    recognition.onresult = event => {
      if (!voiceActive || session !== generation || speaking || window.speechSynthesis?.speaking) return;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (!event.results[i].isFinal) continue;
        const alternatives = Array.from(event.results[i], item => item.transcript);
        const raw = selectAlternative(alternatives);
        if (raw) enqueue(raw, session);
        else show('Entendu : « ' + alternatives[0] + ' » — Précisez une action et un départ, par exemple « allume le départ deux ».');
      }
    };
    recognition.onerror = event => {
      if (session !== generation) return;
      if (['not-allowed', 'service-not-allowed', 'audio-capture', 'network'].includes(event.error)) {
        stopVoice(); show('Écoute interrompue : ' + event.error + '. Vérifiez le microphone et la connexion, puis réactivez le vocal.');
      }
    };
    recognition.onend = () => { recognitionRunning = false; if (voiceActive && session === generation) restartTimer = setTimeout(safeStartRecognition, 350); };
    safeStartRecognition();
    show('Écoute en français — mode navigateur. Exemple : « allume le départ deux ».');
  }
  function safeStartRecognition() {
    if (!voiceActive || mode !== 'browser' || !recognition || recognitionRunning) return;
    if (speaking || window.speechSynthesis?.speaking) { restartTimer = setTimeout(safeStartRecognition, 350); return; }
    try { recognition.start(); recognitionRunning = true; } catch (_) { /* Already started: onend handles restarting. */ }
  }
  function listenAudio(session) {
    if (!voiceActive || session !== generation) return;
    show('Écoute IA — dites votre commande, puis faites une courte pause.');
    const source = audioContext.createMediaStreamSource(stream), analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048; source.connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type));
    if (!mimeType) { source.disconnect(); stopVoice(); show('Format microphone non pris en charge par ce navigateur.'); return; }
    const current = new MediaRecorder(stream, { mimeType }), chunks = [];
    recorder = current;
    let heard = false, voiced = 0, lastSound = 0, started = Date.now(), noise = 0.002, contaminated = false, tooLong = false;
    current.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    current.onerror = () => { if (session === generation) { stopVoice(); show('Enregistrement interrompu. Réactivez le microphone.'); } };
    current.onstop = async () => {
      source.disconnect();
      if (!voiceActive || session !== generation) return;
      try {
        if (contaminated) {
          restartTimer = setTimeout(() => {
            if (!voiceActive || session !== generation) return;
            if (window.speechSynthesis?.speaking || speaking) { restartTimer = setTimeout(() => listenAfterSpeech(session), 350); }
            else listenAudio(session);
          }, 400);
          return;
        }
        if (tooLong) { show('Commande trop longue. Dites une action et un départ.'); }
        if (heard && voiced >= 200 && !tooLong) {
          show('Compréhension de la commande…');
          const pending = new AbortController(); request = pending;
          const timeout = setTimeout(() => pending.abort(), 30000);
          let response;
          try {
            response = await fetch('/api/voice/transcribe', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': mimeType }, body: new Blob(chunks, { type: mimeType }), signal: pending.signal });
          } finally { clearTimeout(timeout); if (request === pending) request = null; }
          const data = await response.json();
          if (!voiceActive || session !== generation) return;
          if (response.status === 401) forgetVoiceSession();
          if (!response.ok) throw new Error(data.error || 'Transcription indisponible.');
          if (data.text?.trim()) await enqueue(data.text, session);
        }
        if (voiceActive && session === generation) listenAudio(session);
      } catch (error) {
        if (session === generation) { stopVoice(); show(error.name === 'AbortError' ? 'Transcription trop lente. Réactivez le microphone.' : error.message); }
      }
    };
    current.start();
    audioTimer = setInterval(() => {
      if (!voiceActive || session !== generation) return;
      analyser.getFloatTimeDomainData(samples);
      const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
      const now = Date.now();
      if (window.speechSynthesis?.speaking || speaking) {
        contaminated = true; clearInterval(audioTimer); current.stop(); return;
      }
      if (rms > Math.max(0.004, Math.min(noise * 2.5, 0.025))) { heard = true; voiced += 50; lastSound = now; }
      else if (!heard) noise = noise * 0.95 + rms * 0.05;
      if ((heard && now - lastSound > 1000) || now - started > 12000) {
        tooLong = heard && now - lastSound <= 1000;
        clearInterval(audioTimer);
        if (current.state !== 'inactive') current.stop();
      }
    }, 50);
  }
  function listenAfterSpeech(session) {
    if (!voiceActive || session !== generation) return;
    if (window.speechSynthesis?.speaking || speaking) restartTimer = setTimeout(() => listenAfterSpeech(session), 350);
    else listenAudio(session);
  }
  function stopVoice() {
    voiceActive = false; generation++;
    recognitionRunning = false;
    clearTimeout(restartTimer); clearInterval(audioTimer);
    request?.abort(); request = null;
    if (recognition) { recognition.onend = null; recognition.onresult = null; try { recognition.abort(); } catch (_) {} recognition = null; }
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    stream?.getTracks().forEach(track => track.stop()); stream = null;
    audioContext?.close().catch(() => {}); audioContext = null;
    voiceButton?.classList.remove('voice-active');
    voiceButton?.setAttribute('aria-pressed', 'false');
    if (voiceButton) voiceButton.title = 'Activer la commande vocale';
    show('Commande vocale arrêtée.');
  }
  function speak(message) {
    if (!('speechSynthesis' in window) || !voiceActive) return Promise.resolve();
    speaking = true;
    // Keep recognition open during feedback: results are ignored while speaking.
    // Aborting after every command caused unnecessary microphone restarts.
    return new Promise(resolve => {
      const utterance = new SpeechSynthesisUtterance(message);
      utterance.lang = 'fr-FR';
      let finished = false;
      const finish = () => {
        if (finished) return; finished = true; clearTimeout(timeout);
        setTimeout(() => { speaking = false; safeStartRecognition(); resolve(); }, 400);
      };
      const timeout = setTimeout(finish, 10000);
      utterance.onend = finish; utterance.onerror = finish;
      speechSynthesis.speak(utterance);
    });
  }
  window.addEventListener('pagehide', stopVoice);
  document.addEventListener('visibilitychange', () => { if (document.hidden && voiceActive) stopVoice(); });
})();
