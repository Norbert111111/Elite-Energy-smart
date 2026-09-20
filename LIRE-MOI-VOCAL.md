# Correction de la commande vocale

Seule la fonction de commande vocale a été modifiée. Les pages, les styles, les commandes manuelles, les prédictions, les notifications et les chemins Firebase sont conservés.

## Installation

1. Extraire toute cette archive dans le dossier du site (conserver une sauvegarde de la version précédente).
2. Utiliser Node.js 22 ou plus récent. Dans ce dossier, exécuter `npm install` si nécessaire.
3. Sans clé API, `npm start` conserve la reconnaissance du navigateur, corrigée et réglée en français. Le navigateur doit prendre en charge SpeechRecognition.
4. Pour activer la transcription IA, définir la variable d'environnement **OPENAI_API_KEY** sur le serveur, avec une vraie clé de votre compte OpenAI disposant de crédit API, puis redémarrer le serveur. Aucun secret n'est fourni dans cette archive. Ne mettez jamais cette clé dans HTML, JavaScript public ou dans un fichier servi par le site.

Exemple PowerShell (remplacer le texte d'exemple par votre clé, uniquement sur votre ordinateur/serveur) :

```powershell
$env:OPENAI_API_KEY = 'VOTRE_CLE_API_OPENAI'
npm start
```

En production, utiliser le gestionnaire de secrets/variables d'environnement de l'hébergeur. Il faut un serveur Node, pas uniquement un hébergement de fichiers statiques. Le navigateur doit accéder aux routes `/api/voice/` sur le même domaine. Le serveur doit pouvoir joindre OpenAI et la base Firebase déjà configurée.

Ouvrir le site en **HTTPS** (ou `http://localhost:3000` sur le serveur local), puis recharger la page. Cliquer sur le microphone et autoriser son accès. En mode IA, une boîte demande votre mot de passe ELITE actuel et indique que l'audio sera transmis à OpenAI. Cette vérification protège l'accès à l'API payante ; elle ne modifie pas votre compte. Le mot de passe n'est conservé ni dans le stockage du navigateur ni dans les journaux de ce module. La session vocale expire après 15 minutes ; réactiver le microphone pour se reconnecter.

## Utilisation

- « Allume le départ deux », « active le deuxième départ », « mets le numéro deux en marche ».
- « Éteins le départ 2 », « coupe le départ deux », « mets le deuxième hors tension ».
- « Allume les départs 2 et 3 », « coupe tous les départs ».
- En mode IA : parler, puis laisser environ une seconde de silence. Attendre la réponse avant la commande suivante. Les phrases sont limitées à 12 secondes. Une phrase qui dépasse cette durée en pleine parole est rejetée.
- Pour couper le microphone, recliquer sur son bouton. L'écoute s'arrête aussi quand la page est masquée ou quittée.

La transcription IA utilise `gpt-4o-transcribe`, avec contexte spécialisé sur les six départs. Le microphone demande la réduction du bruit, l'annulation d'écho et le gain automatique lorsque le navigateur les prend en charge. La détection de parole tient compte du bruit de fond. Les phrases négatives, conditionnelles ou contenant des actions opposées doivent être reformulées pour éviter une commande involontaire. Les variantes de transcription qui désignent des départs différents sont rejetées en mode navigateur.

Les retours vocaux sont exclus de l'écoute. Une confirmation « demandée » signifie que l'écriture Firebase a réussi, pas que l'appareil a physiquement commuté. Le départ 2 écrit exclusivement `Commande2` dans le chemin de commande existant.

## Vérifications et limites

34 tests automatisés réussis : formulations du départ 2, autres départs, groupes, ambiguïtés, alternatives, arrêt avant exécution, chemin Firebase et API simulée (authentification, format, erreur fournisseur). Vérification syntaxique des fichiers JavaScript modifiés et des fichiers déjà couverts par `npm test`.

Les essais utilisent une base et des réponses API simulées : aucun ordre n'a été envoyé aux appareils. Aucun test réel du microphone, d'accent, de voix basse ou d'appel OpenAI n'a été réalisé, faute de clé API et d'accès au matériel. Tester sur votre téléphone et votre appareil avant de compter sur le résultat. Une voix trop faible ou un environnement très bruyant peut encore nécessiter de répéter ; une précision de 100 % n'est pas garantie. Ce mode intègre la transcription OpenAI, sans reproduire intégralement le mode vocal de ChatGPT.

Documentation officielle : https://developers.openai.com/api/docs/guides/speech-to-text

Fichiers existants modifiés : `live-features.js` (section vocale seulement), `server.js` (ajout du branchement vocal). Fichiers ajoutés : `voice-api.js`, ce guide. Tous les autres fichiers de l'archive d'origine sont identiques.

## Dernière modification : autorisations et affichage

Aucune phrase reconnue ni zone de texte ne s'affiche sous le microphone. Les erreurs sont accessibles dans le titre de l'icône. L'écoute du navigateur reste ouverte pendant les réponses vocales, sans redémarrage systématique après chaque commande. Les résultats reçus pendant la synthèse vocale sont ignorés.

La session IA valide est réutilisée dans le même onglet, y compris après rechargement, sans conserver le mot de passe. Son expiration ou un redémarrage du serveur peut nécessiter une nouvelle identification : il s'agit du compte ELITE, distinct de l'autorisation microphone.

Le navigateur reste seul responsable de mémoriser l'autorisation microphone. Utiliser le même site HTTPS et une autorisation persistante dans les paramètres du site lorsque le navigateur la propose. Une permission temporaire, révoquée ou effacée peut être demandée à nouveau ; le code du site ne peut pas garantir une autorisation permanente. Référence : https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
