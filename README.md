# Cross Collège — V1

Application web/PWA pour iPad : import élèves, dossards Code 128, courses, départs indépendants, arrivée par scanner Bluetooth HID, arrivée manuelle, classements et exports.

## Test rapide
1. Ouvrir l’application.
2. Onglet **Élèves & dossards** > **Charger la démo**.
3. Les faux élèves 101 à 112 sont chargés et deux courses de démonstration sont créées.
4. Onglet **Courses** > lancer **Démo 6e** ou **Démo 5e**.
5. Onglet **Chronométrage** > scanner les faux dossards correspondants.

## Installation sur l'iPad
1. Ouvrir l'URL dans Safari avec Internet une première fois.
2. Attendre quelques secondes pour que le cache hors-ligne se prépare.
3. Safari > Partager > Sur l'écran d'accueil.
4. Réglages iPad > Bluetooth : jumeler le lecteur Inateck en mode HID.
5. Tester d'abord dans Notes : un scan doit écrire le numéro du code-barres puis valider avec Entrée.
6. Ouvrir Cross Collège, onglet Chronométrage > Tester le scanner.

## Fichier élèves
Colonnes supportées : Nom, Prénom, Classe, Niveau, Sexe, Enseignant/PP, Dossard.
Le dossard est attribué automatiquement s'il manque.

## Sécurité des données
Les données sont stockées localement sur l'iPad. Utiliser régulièrement le bouton « Sauvegarde JSON », particulièrement avant le jour du cross.
