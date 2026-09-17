import os
import re
import glob
import json
import urllib.request
from datetime import date

BREVO_API_KEY = os.environ["BREVO_API_KEY"]

EMAIL_DESTINATAIRE = "christophe.dellacasa@gmail.com"
EMAIL_EXPEDITEUR = "christophe.dellacasa@gmail.com"

aujourd_hui = date.today()

print(f"Date du contrôle : {aujourd_hui}")
print("Recherche des dates de vérification...")

# Recherche dans tous les fichiers HTML du dépôt
fichiers = glob.glob("**/*.html", recursive=True)

print(f"{len(fichiers)} fichier(s) HTML trouvé(s).")

for fichier in fichiers:

    # Ignore les fichiers situés dans .github
    if fichier.startswith(".github/"):
        continue

    with open(fichier, "r", encoding="utf-8") as f:
        contenu = f.read()

    # Recherche une date précédée de "Prochaine vérification"
    correspondances = re.findall(
        r"Prochaine vérification[^0-9]{0,150}(\d{2}/\d{2}/\d{4})",
        contenu,
        re.IGNORECASE
    )

    if not correspondances:
        print(f"Aucune date trouvée dans : {fichier}")
        continue

    date_str = correspondances[0]

    try:
        jour, mois, annee = map(int, date_str.split("/"))
        date_expiration = date(annee, mois, jour)
    except ValueError:
        print(f"Date invalide dans : {fichier}")
        continue

    jours_restants = (date_expiration - aujourd_hui).days

    print(
        f"{fichier} → échéance {date_str} → "
        f"{jours_restants} jour(s) restant(s)"
    )

    # Envoi uniquement à J-30, J-7 et le jour de l'échéance
    if jours_restants not in (30, 7, 0):
        continue

    nom_machine = (
        os.path.basename(fichier)
        .replace(".html", "")
        .replace("-", " ")
        .upper()
    )

    if jours_restants == 30:
        sujet = f"⚠️ VGP dans 30 jours - {nom_machine}"
        message = (
            f"La vérification périodique de {nom_machine} "
            f"arrive à échéance dans 30 jours ({date_str})."
        )

    elif jours_restants == 7:
        sujet = f"⚠️ VGP dans 7 jours - {nom_machine}"
        message = (
            f"La vérification périodique de {nom_machine} "
            f"arrive à échéance dans 7 jours ({date_str})."
        )

    else:
        sujet = f"🚨 VGP arrivée à échéance - {nom_machine}"
        message = (
            f"La vérification périodique de {nom_machine} "
            f"arrive à échéance aujourd'hui ({date_str})."
        )

    donnees = {
        "sender": {
            "name": "Parc matériel",
            "email": EMAIL_EXPEDITEUR
        },
        "to": [
            {
                "email": EMAIL_DESTINATAIRE
            }
        ],
        "subject": sujet,
        "textContent": message
    }

    requete = urllib.request.Request(
        "https://api.brevo.com/v3/smtp/email",
        data=json.dumps(donnees).encode("utf-8"),
        headers={
            "accept": "application/json",
            "api-key": BREVO_API_KEY,
            "content-type": "application/json"
        },
        method="POST"
    )

    try:
        with urllib.request.urlopen(requete) as reponse:
            print(
                f"✅ Email envoyé pour {nom_machine} "
                f"(réponse Brevo : {reponse.status})"
            )
    except Exception as erreur:
        print(f"❌ Erreur Brevo pour {nom_machine} : {erreur}")
