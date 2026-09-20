# Création automatique d'un utilisateur et de son appareil

Le projet conserve son interface, sa connexion, ses rôles et ses pages existantes.

## Installation

1. Sauvegardez votre projet actuel.
2. Décompressez ce ZIP et utilisez le dossier SITE WEB ELITE ENERGIE complet. Vous pouvez aussi remplacer seulement admin.html, index1.html, index2.html et service-worker.js, puis ajouter provisioning.js et device-labels.js à côté des pages HTML.
3. Démarrez le serveur avec DEMARRER_SERVEUR.bat comme auparavant, puis ouvrez /admin.html. La clé d'accès existante reste la même.
4. Après mise à jour, fermez les anciens onglets et rechargez l'application pour que le nouveau service worker soit utilisé.

## Utilisation

Dans « Créer un Utilisateur », complétez le nom, l'identifiant, le rôle, l'appareil (ELITE1, ELITE2, ELITE3, etc.), le mot de passe, la description, le GPS, la tension nominale et la puissance maximale. Cliquez sur le bouton de création et attendez la confirmation.

Pour un appareil ELITE3, la même opération crée :

```text
ELITE3/
  usersELITE3/<identifiant>/
    nomComplet, role, appareilAssigne, password, dateCreation
    pages/accueil, commande, analyse
  Info/
    numeroAppareil, description, coordonneesGPS
    tensionNominale, puissanceMaxKVA, dateConnexion
  DonneesELITE3/
    Depart1 ... Depart6/
      CourantDn, TensionDn, PuissanceDn, EnergieDn, FrequenceDn, CosRhoDn
      Historique/DerniereMiseAJour
  CommandeELITE3/
    Commande1 ... Commande6
  DashboardELITE3/
    TotalCourant, TensionUnique, TotalPuissance, TotalEnergie
    DerniereMiseAJour, ConsommationHoraire
```

Les mesures initiales sont à zéro en attente de l'ESP32, et les commandes initiales sont à zéro (arrêt). La tension nominale est une information de configuration, pas une mesure simulée. Les historiques réels du tableau de bord se remplissent selon le fonctionnement existant lorsque cette page est utilisée.

Si l'appareil existe déjà, seuls ses champs absents sont ajoutés. Ses informations, ses mesures, ses historiques, ses commandes et ses autres utilisateurs sont conservés. Les coordonnées saisies ne remplacent donc pas celles d'un appareil déjà configuré.

L'utilisateur se connecte via login.html avec son identifiant et son mot de passe. La connexion sélectionne son appareil automatiquement et ouvre index2.html pour un technicien, index1.html pour les autres rôles, comme auparavant. Les deux pages sont partagées entre tous les appareils et personnalisées à la connexion : aucune copie physique de pages ni nouveau projet Firebase n'est nécessaire. Le champ pages enregistre leurs adresses.

L'identifiant doit être unique parmi tous les appareils, car la connexion existante recherche globalement les utilisateurs. La création refuse de remplacer un compte existant.

## Firebase et vérifications

La création du compte et de la structure est une transaction unique à la racine de la Realtime Database. Elle nécessite que les règles Firebase existantes autorisent la lecture et l'écriture à cet emplacement pour le client admin. Aucune règle Firebase n'est modifiée dans ce ZIP. En cas de refus, le formulaire affiche l'erreur et conserve les valeurs pour réessayer. Documentation : https://firebase.google.com/docs/database/web/read-and-write#save_data_as_transactions

Cette transaction globale assure l'unicité des identifiants avec l'architecture existante ; elle lit l'ensemble de la base et peut être coûteuse sur une base volumineuse. Une architecture serveur avec authentification serait un chantier distinct.

Vérifications locales effectuées avec une simulation de Firebase : création d'un nouvel appareil avec six départs, ajout sur appareil existant, préservation des données et des commandes actives, refus des doublons entre appareils, validation des champs, refus de permissions et syntaxe des scripts HTML. Aucun compte n'a été créé et aucune écriture n'a été effectuée dans la base Firebase réelle. Le ZIP doit être testé sur votre environnement Firebase avant mise en service.

Le formulaire indépendant « Initialiser l'Appareil » garde son comportement existant : il réinitialise les mesures. Il n'est pas nécessaire de l'utiliser après la création automatique d'un utilisateur.
