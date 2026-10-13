THN V86 — Import complet parc + salariés

Cette version ajoute un import complet depuis le dossier PARCMAT décompressé.

Fonctionnement :
- Reconnaît automatiquement 01 - CAMIONS, 02 - PELLES, 03 - VL et 04 - SALARIES.
- Reconnaît les camions, remorques, pelles, remorques rail-route et véhicules à partir des noms de dossiers.
- Importe les salariés et leurs sous-catégories issues de l'arborescence simplifiée.
- Les photos de salariés présentes dans un sous-dossier "photo" sont importées comme photos de profil.
- Les dates présentes dans les noms de fichiers des rubriques à échéance sont reprises comme dates d'expiration.
- Les salariés existants portant le même nom conservent leur code personnel et leur date de visite médicale.
- Les nouveaux salariés reçoivent automatiquement un code personnel à 6 chiffres affiché dans le journal d'import.
- L'option "Remplacer" supprime d'abord les documents des matériels présents dans le dossier importé, puis synchronise les salariés.
- Les salariés absents du dossier importé sont supprimés à la finalisation du remplacement.
- Les rubriques matériel avec échéance restent à un seul document actif ; les anciens sont archivés par le fonctionnement existant.

Pour utiliser l'import :
1. Décompresser le dossier PARCMAT.
2. Ouvrir Administration.
3. Dans "Import complet du parc et des salariés", sélectionner le dossier PARCMAT décompressé.
4. Cocher "Remplacer les données actuelles du dossier importé" pour remplacer le contenu existant.
5. Lancer l'import et conserver le journal affiché à l'écran, notamment les codes des nouveaux salariés.

Le dossier source fourni par l'utilisateur contient 4 grandes sections et 12 dossiers salariés.
