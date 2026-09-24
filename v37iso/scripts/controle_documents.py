import os
import json
import urllib.request
from datetime import date, datetime

BREVO_API_KEY = os.environ["BREVO_API_KEY"]

EMAIL_DESTINATAIRE = "christophe.dellacasa@gmail.com"
EMAIL_EXPEDITEUR = "christophe.dellacasa@gmail.com"

aujourd_hui = date.today()

print(f"Date du contrôle : {aujourd_hui}")
print("Lecture du fichier dates_vgp.json...")

with open("dates_vgp.json", "r", encoding="utf-8") as f:
    dates = json.load(f)

print(f"{len(dates)} matériels enregistrés.")

for machine, date_str in dates.items():

    if not date_str:
        print(f"{machine} : aucune date renseignée")
        continue

    try:
        date_expiration = datetime.strptime(date_str, "%d/%m/%Y").date()
    except ValueError:
        print(f"{machine} : date invalide ({date_str})")
        continue

    jours_restants = (date_expiration - aujourd_hui).days

    print(
        f"{machine} : échéance {date_str} → "
        f"{jours_restants} jour(s)"
    )

    # Déclenchement de l'alerte :
    # J-30, J-7, jour J, et chaque jour après expiration
    if jours_restants == 30:
        sujet = f"⚠️ VGP dans 30 jours - {machine.upper()}"
        message = (
            f"La vérification périodique de {machine.upper()} "
            f"arrive à échéance dans 30 jours ({date_str})."
        )

    elif jours_restants == 7:
        sujet = f"⚠️ VGP dans 7 jours - {machine.upper()}"
        message = (
            f"La vérification périodique de {machine.upper()} "
            f"arrive à échéance dans 7 jours ({date_str})."
        )

    elif jours_restants == 0:
        sujet = f"🚨 VGP aujourd'hui - {machine.upper()}"
        message = (
            f"La vérification périodique de {machine.upper()} "
            f"arrive à échéance aujourd'hui ({date_str})."
        )

    elif jours_restants < 0:
        sujet = f"🚨 VGP EXPIRÉE - {machine.upper()}"
        message = (
            f"ATTENTION : la vérification périodique de "
            f"{machine.upper()} est expirée depuis "
            f"{abs(jours_restants)} jour(s). "
            f"Date d'échéance : {date_str}."
        )

    else:
        continue

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
                f"✅ Email envoyé pour {machine.upper()} "
                f"(Brevo : {reponse.status})"
            )
    except Exception as erreur:
        print(f"❌ Erreur Brevo pour {machine.upper()} : {erreur}")
