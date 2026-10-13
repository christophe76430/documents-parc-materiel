THN V88 — import complet robuste des gros fichiers

Correction de l’import PARCMAT :
- les fichiers de plus de 3 Mo sont importés par fragments de 3 Mo ;
- cela évite la limite de payload des Netlify Functions (6 Mo / environ 4,5 Mo utiles pour les binaires) ;
- le journal affiche les erreurs HTTP et leur message réel ;
- les photos salariés jusqu’à 5 Mo passent aussi par l’import fragmenté si nécessaire ;
- le remplacement complet ne se finalise que si tous les imports ont réussi ;
- les fichiers de moins de 3 Mo continuent à utiliser l’import normal.

Version affichée : V88.
