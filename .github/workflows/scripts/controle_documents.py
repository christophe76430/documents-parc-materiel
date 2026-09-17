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

# Cherche les dates de prochaine vérification dans les pages HTML
for fichier in glob.glob("*.html"):
    with open(fichier, "r", encoding="utf-8") as f:
        contenu = f.read()

    # Recherche une date au format JJ/MM/AAAA
    correspondances = re.findall(
        r"(?:Prochaine vérification|prochaine vérification)[^0-9]{0,100}(\d{2}/\d{2}/\d{4})",
        contenu
    )

    if not correspondances:
        continue

    date_str = correspondances[0]

    try:
        jour, mois, annee = map(int, date_str.split("/"))
        date_expiration = date(annee, mois, jour)
    except ValueError:
        continue

    jours_restants = (date_expiration - aujourd_hui).days

    if jours_restants not in (30, 7, 0):
        continue

    nom_machine = fichier.replace(".html", "").replace("-", " ").upper()

    if jours_restants == 30:
        sujet = f"⚠️ VGP dans 30 jours - {nom_machine}"
        message = f"La vérification périodique de {nom_machine} arrive à échéance dans 30 jours ({date_str})."

    elif jours_restants == 7:
        sujet = f"⚠️ VGP dans 7 jours - {nom_machine}"
        message = f"La vérification périodique de {nom_machine} arrive à échéance dans 7 jours ({date_str})."

    else:
        sujet = f"🚨 VGP arrivée à échéance - {nom_machine}"
        message = f"La vérification périodique de {nom_machine} arrive à échéance aujourd'hui ({date_str})."

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
            print(f"Email envoyé pour {nom_machine} : {reponse.status}")
    except Exception as erreur:
        print(f"Erreur pour {nom_machine} : {erreur}")
