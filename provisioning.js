/* Structure commune à tous les appareils, compatible avec les pages existantes. */
(function (root) {
  'use strict';
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  function complete(existing, defaults) {
    if (existing === null || existing === undefined) return defaults;
    if (typeof existing !== 'object' || Array.isArray(existing)) return existing;
    const result = { ...existing };
    for (const key of Object.keys(defaults)) {
      result[key] = own(existing, key) ? complete(existing[key], defaults[key]) : defaults[key];
    }
    return result;
  }
  function validate(input) {
    if (!input.fullName || !input.username || !input.password || !input.description || !input.gps)
      throw new Error('Complétez toutes les coordonnées demandées.');
    if (!/^ELITE[1-9]\d*$/.test(input.device))
      throw new Error("Le numéro de l'appareil doit être ELITE1, ELITE2, ELITE3, etc.");
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(input.username))
      throw new Error("Identifiant : utilisez des lettres, chiffres, tirets ou underscores (64 caractères maximum).");
    if (!['Administrateur', 'Superviseur', 'Technicien'].includes(input.role))
      throw new Error('Rôle invalide.');
    const gps = input.gps.split(',').map(value => value.trim());
    if (gps.length !== 2 || gps.some(value => !value || !Number.isFinite(Number(value))) ||
        Math.abs(Number(gps[0])) > 90 || Math.abs(Number(gps[1])) > 180)
      throw new Error('GPS : indiquez latitude, longitude valides.');
    if (![220, 380].includes(input.voltage) || !Number.isFinite(input.power) || input.power <= 0)
      throw new Error('Indiquez une tension et une puissance nominales valides.');
  }
  function build(input, date) {
    const data = {}, commands = {};
    for (let i = 1; i <= 6; i++) {
      data['Depart' + i] = {
        ['CourantD' + i]: 0, ['TensionD' + i]: 0,
        ['PuissanceD' + i]: 0, ['EnergieD' + i]: 0,
        ['FrequenceD' + i]: 0, ['CosRhoD' + i]: 0,
        Historique: { DerniereMiseAJour: 'En attente ESP32' }
      };
      commands['Commande' + i] = 0;
    }
    return {
      ['Donnees' + input.device]: data,
      ['Commande' + input.device]: commands,
      ['Dashboard' + input.device]: {
        TotalCourant: 0, TensionUnique: 0, TotalPuissance: 0, TotalEnergie: 0,
        DerniereMiseAJour: 'En attente ESP32', ConsommationHoraire: [0, 0, 0, 0, 0, 0]
      },
      Info: {
        numeroAppareil: input.device, description: input.description,
        coordonneesGPS: input.gps, tensionNominale: input.voltage,
        puissanceMaxKVA: input.power, dateConnexion: date
      }
    };
  }
  async function create(database, input) {
    validate(input);
    const date = new Date().toISOString();
    // La transaction inclut le compte et l'appareil : aucune création partielle.
    // La recherche globale conserve l'unicité requise par login.html.
    const result = await database.ref('/').transaction(current => {
      const state = current || {};
      for (const device of Object.keys(state)) {
        const users = state[device] && state[device]['users' + device];
        if (users && own(users, input.username)) return;
      }
      const device = complete(state[input.device], build(input, date));
      if (!device || typeof device !== 'object' || Array.isArray(device)) return;
      const usersKey = 'users' + input.device;
      return { ...state, [input.device]: {
        ...device,
        [usersKey]: { ...(device[usersKey] || {}), [input.username]: {
          nomComplet: input.fullName, role: input.role, appareilAssigne: input.device,
          password: input.password, dateCreation: date,
          pages: { accueil: 'index.html', commande: 'index1.html', analyse: 'index2.html' }
        } }
      } };
    }, undefined, false);
    if (!result.committed)
      throw new Error("Identifiant déjà utilisé ou structure de l'appareil incompatible. Aucune modification effectuée.");
    return result;
  }
  async function initialize(database, input) {
    validate(input);
    const date = new Date().toISOString();
    const result = await database.ref('/').transaction(current => {
      const state = current || {};
      const previous = state[input.device];
      if (previous && previous['users' + input.device]) {
        const users = Object.values(previous['users' + input.device]);
        if (users.some(user => user && user.active !== false)) return;
      }
      for (const [id, node] of Object.entries(state)) {
        if (id !== input.device && node && node['users' + id] && own(node['users' + id], input.username)) return;
      }
      const device = build(input, date);
      device['users' + input.device] = {
        [input.username]: {
          nomComplet: input.fullName, role: input.role, appareilAssigne: input.device,
          password: input.password, active: true, dateCreation: date,
          pages: { accueil: 'index.html', commande: 'index1.html', analyse: 'index2.html' }
        }
      };
      return { ...state, [input.device]: device };
    }, undefined, false);
    if (!result.committed) throw new Error('Appareil encore actif ou identifiant déjà utilisé. Désactivez ses utilisateurs avant initialisation.');
    return result;
  }
  const api = { validate, build, complete, create, initialize };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EliteProvisioning = api;
})(typeof window !== 'undefined' ? window : globalThis);
