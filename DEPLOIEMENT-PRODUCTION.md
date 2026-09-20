# Mise en production ELITE ENERGY

## Démarrage

1. Installer Node.js 20 ou supérieur.
2. Exécuter `npm install` dans ce dossier.
3. Définir les variables d'environnement ci-dessous.
4. Démarrer avec `npm start`.

Variables recommandées :

- `RESEND_API_KEY` : clé Resend pour les courriels.
- `EMAIL_DEST` : destinataire et adresse VAPID, par exemple `electro.elites22@gmail.com`.
- `FIREBASE_DATABASE_URL` : URL de Firebase Realtime Database.
- `VAPID_SUBJECT` : facultatif, par exemple `mailto:electro.elites22@gmail.com`.
- `PORT` : facultatif, port HTTP (3000 par défaut).

Les clés Web Push sont créées automatiquement au premier démarrage dans `data/push-config.json`. Conservez ce fichier lors des mises à jour : changer ces clés invalide les abonnements existants. Les abonnements sont enregistrés dans `data/push-subscriptions.json`.

## Conditions mobiles

- En production, le site doit être servi en HTTPS. `localhost` est la seule exception de développement.
- Android : ouvrir l'application avec Chrome/Edge, accepter les notifications puis installer la PWA.
- iPhone/iPad : utiliser Safari, choisir **Sur l'écran d'accueil**, ouvrir l'application installée puis accepter les notifications. Les notifications Web Push iOS nécessitent iOS/iPadOS 16.4 ou supérieur.
- Le premier appui dans l'application déclenche la demande d'autorisation de notification. Une fois acceptée, les anomalies et prédictions sont envoyées par le serveur même si la page est fermée.

## Surveillance

Le serveur vérifie toutes les 30 secondes les appareils ayant au moins un abonnement actif. Il envoie immédiatement une notification lors d'une nouvelle anomalie ou d'un retour à la normale, et une synthèse prédictive au maximum toutes les six heures.
