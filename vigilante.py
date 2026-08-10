#!/usr/bin/env python3
# ════════════════════════════════════════════════════════════════
#  VIGILANTE METEOROLÓGICO — Base Prat (Bahía Chile)
#  Lee el CSV público de pronóstico y detecta condiciones de aviso:
#    · Visibilidad  < 1 km   (valor MENOR del rango)
#    · Temperatura  < -10 °C  (MÍNIMA del tramo)
#    · Viento (racha) > 24 kt (RACHA)
#  Si hay alerta, envía notificación push por FCM a los dispositivos
#  registrados en Firestore. Corre en GitHub Actions cada hora.
# ════════════════════════════════════════════════════════════════

import csv
import io
import json
import os
import re
import sys
import urllib.request
from datetime import datetime, timezone

# ── Fuente de datos: hoja pública de Bahía Chile (Prat) ──────────
DOC_ID = "2PACX-1vQRxJhBvpk3JZu0MWpKPZ2PMi2DYfEjxhSTWMbX4i_EHHI6rh9frJuskRuaX-OXJqc_Akz6Dh5qLr72"
GID = "939106272"
CSV_URL = (
    f"https://docs.google.com/spreadsheets/d/e/{DOC_ID}"
    f"/pub?gid={GID}&single=true&output=csv"
)

# ── Umbrales de aviso ────────────────────────────────────────────
VIS_MIN_KM = 1.0     # avisar si visibilidad < 1 km
TEMP_MIN_C = -10.0   # avisar si temperatura < -10 °C
VIENTO_KT = 10       # PRUEBA temporal (normal: 24)

# Evita reenviar el mismo aviso una y otra vez cada hora: se guarda
# una "firma" del último aviso enviado en este archivo.
ESTADO_PATH = "estado_alerta.txt"


def descargar_csv(url):
    req = urllib.request.Request(url, headers={"User-Agent": "vigilante-prat"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        texto = resp.read().decode("utf-8")
    return list(csv.DictReader(io.StringIO(texto)))


def parse_visibilidad(txt):
    m = re.search(r"(\d+(?:\.\d+)?)\s*/\s*(\d+(?:\.\d+)?)", txt or "")
    if m:
        return min(float(m.group(1)), float(m.group(2)))
    m2 = re.search(r"(\d+(?:\.\d+)?)", txt or "")
    return float(m2.group(1)) if m2 else None


def parse_temp_min(txt):
    nums = re.findall(r"-?\d+(?:\.\d+)?", txt or "")
    return min(float(n) for n in nums) if nums else None


def parse_racha(txt):
    m = re.search(r"(\d+)\s*/\s*(\d+)\s*KT", (txt or "").upper())
    if m:
        return int(m.group(2))
    return None


def evaluar(filas):
    avisos = []
    for f in filas:
        cuando = f"{(f.get('Día') or '').strip()} · {(f.get('Tramo') or '').strip()}"

        vis = parse_visibilidad(f.get("Visibilidad"))
        if vis is not None and vis < VIS_MIN_KM:
            avisos.append({"tipo": "visibilidad", "cuando": cuando,
                           "valor": f"{vis:g} km", "detalle": (f.get("Visibilidad") or "").strip()})

        tmin = parse_temp_min(f.get("Temp"))
        if tmin is not None and tmin < TEMP_MIN_C:
            avisos.append({"tipo": "temperatura", "cuando": cuando,
                           "valor": f"{tmin:g} °C", "detalle": (f.get("Temp") or "").strip()})

        racha = parse_racha(f.get("Viento"))
        if racha is not None and racha > VIENTO_KT:
            avisos.append({"tipo": "viento", "cuando": cuando,
                           "valor": f"{racha} kt (racha)", "detalle": (f.get("Viento") or "").strip()})

    return avisos


def construir_mensaje(avisos):
    """Arma el título y cuerpo de la notificación a partir de los avisos."""
    tipos = sorted(set(a["tipo"] for a in avisos))
    iconos = {"viento": "💨 Viento", "temperatura": "🥶 Frío extremo", "visibilidad": "🌫️ Visibilidad"}
    titulo = "⚠️ Aviso meteorológico — Base Prat"
    partes = [iconos.get(t, t) for t in tipos]
    # Toma el primer aviso de cada tipo para el detalle
    detalles = []
    for t in tipos:
        primero = next(a for a in avisos if a["tipo"] == t)
        detalles.append(f"{iconos.get(t, t)}: {primero['valor']} ({primero['cuando']})")
    cuerpo = " | ".join(detalles)
    return titulo, cuerpo


def enviar_notificaciones(titulo, cuerpo):
    """Lee tokens de Firestore y envía la notificación por FCM."""
    import firebase_admin
    from firebase_admin import credentials, firestore, messaging

    cred_json = os.environ.get("FIREBASE_CREDENTIALS")
    if not cred_json:
        print("ERROR: falta FIREBASE_CREDENTIALS en el entorno.", file=sys.stderr)
        return 0

    print("Conectando con Firebase...")
    try:
        cred = credentials.Certificate(json.loads(cred_json))
        firebase_admin.initialize_app(cred)
        db = firestore.client()
        print("Conexion con Firebase OK.")
    except Exception as e:
        print(f"ERROR al conectar con Firebase: {e}", file=sys.stderr)
        return 0

    try:
        tokens = [d.id for d in db.collection("tokens").stream()]
    except Exception as e:
        print(f"ERROR al leer tokens de Firestore: {e}", file=sys.stderr)
        return 0

    print(f"Dispositivos encontrados en Firestore: {len(tokens)}")
    if not tokens:
        print("No hay dispositivos registrados.")
        return 0

    enviados = 0
    invalidos = []
    for tk in tokens:
        try:
            msg = messaging.Message(
                notification=messaging.Notification(title=titulo, body=cuerpo),
                token=tk,
            )
            messaging.send(msg)
            enviados += 1
            print(f"  -> Enviado a token ...{tk[-10:]}")
        except Exception as e:
            print(f"  -> Token invalido ...{tk[-10:]}: {e}")
            invalidos.append(tk)

    for tk in invalidos:
        try:
            db.collection("tokens").document(tk).delete()
        except Exception:
            pass

    print(f"Notificaciones enviadas: {enviados} de {len(tokens)}.")
    return enviados


def firma_avisos(avisos):
    """Firma única del conjunto de avisos, para no repetir envíos."""
    return "|".join(sorted(f"{a['tipo']}:{a['cuando']}:{a['valor']}" for a in avisos))


def main():
    try:
        filas = descargar_csv(CSV_URL)
    except Exception as e:
        print(f"ERROR al descargar el CSV: {e}", file=sys.stderr)
        sys.exit(1)

    avisos = evaluar(filas)

    resultado = {
        "generado": datetime.now(timezone.utc).isoformat(),
        "sector": "Bahía Chile - Puerto Soberanía (Base Prat)",
        "umbrales": {"visibilidad_km": VIS_MIN_KM, "temp_min_c": TEMP_MIN_C, "viento_racha_kt": VIENTO_KT},
        "hay_alerta": len(avisos) > 0,
        "avisos": avisos,
    }
    with open("alerta.json", "w", encoding="utf-8") as fh:
        json.dump(resultado, fh, ensure_ascii=False, indent=2)

    if not avisos:
        print("✅ Sin condiciones de aviso en el pronóstico actual.")
        return

    print(f"⚠️  {len(avisos)} aviso(s) detectado(s):")
    for a in avisos:
        print(f"   · [{a['tipo']}] {a['cuando']} → {a['valor']}")

    # ── Anti-repetición: no reenviar si el aviso es idéntico al anterior ──
    firma = firma_avisos(avisos)
    anterior = ""
    if os.path.exists(ESTADO_PATH):
        with open(ESTADO_PATH, encoding="utf-8") as fh:
            anterior = fh.read().strip()

    if firma == anterior:
        print("El mismo aviso ya fue enviado antes; no se reenvía.")
        return

    titulo, cuerpo = construir_mensaje(avisos)
    print(f"Enviando: {titulo} — {cuerpo}")
    enviar_notificaciones(titulo, cuerpo)

    with open(ESTADO_PATH, "w", encoding="utf-8") as fh:
        fh.write(firma)


if __name__ == "__main__":
    main()
