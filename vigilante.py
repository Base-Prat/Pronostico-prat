#!/usr/bin/env python3
# ════════════════════════════════════════════════════════════════
#  VIGILANTE METEOROLÓGICO — Base Prat (Bahía Chile)
#  Lee el CSV público de pronóstico y detecta condiciones de aviso:
#    · Visibilidad  < 1 km   (se evalúa el valor MENOR del rango)
#    · Temperatura  < -10 °C  (se evalúa la MÍNIMA del tramo)
#    · Viento (racha) > 25 kt (se evalúa la RACHA)
#  Corre en GitHub Actions cada hora. En esta Etapa 3 solo DETECTA
#  y deja el resultado en 'alerta.json'. El envío real es Etapa 4.
# ════════════════════════════════════════════════════════════════

import csv
import io
import json
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
VIENTO_KT = 10       # avisar si racha > 25 kt


def descargar_csv(url):
    """Descarga el CSV publicado y devuelve la lista de filas (dict)."""
    req = urllib.request.Request(url, headers={"User-Agent": "vigilante-prat"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        texto = resp.read().decode("utf-8")
    return list(csv.DictReader(io.StringIO(texto)))


def parse_visibilidad(txt):
    """'4/8 KM nieve débil' -> 4.0 (valor menor del rango, en km)."""
    m = re.search(r"(\d+(?:\.\d+)?)\s*/\s*(\d+(?:\.\d+)?)", txt or "")
    if m:
        return min(float(m.group(1)), float(m.group(2)))
    m2 = re.search(r"(\d+(?:\.\d+)?)", txt or "")
    return float(m2.group(1)) if m2 else None


def parse_temp_min(txt):
    """'-12°C / -8°C' -> -12.0 (la mínima del tramo)."""
    nums = re.findall(r"-?\d+(?:\.\d+)?", txt or "")
    return min(float(n) for n in nums) if nums else None


def parse_racha(txt):
    """'W/NW 6/12 KT' -> 12 (la racha, segundo número del par)."""
    m = re.search(r"(\d+)\s*/\s*(\d+)\s*KT", (txt or "").upper())
    if m:
        return int(m.group(2))
    return None


def evaluar(filas):
    """Recorre los tramos y junta las condiciones que superan umbral."""
    avisos = []
    for f in filas:
        dia = (f.get("Día") or "").strip()
        tramo = (f.get("Tramo") or "").strip()
        cuando = f"{dia} · {tramo}"

        vis = parse_visibilidad(f.get("Visibilidad"))
        if vis is not None and vis < VIS_MIN_KM:
            avisos.append({
                "tipo": "visibilidad",
                "cuando": cuando,
                "valor": f"{vis:g} km",
                "detalle": (f.get("Visibilidad") or "").strip(),
            })

        tmin = parse_temp_min(f.get("Temp"))
        if tmin is not None and tmin < TEMP_MIN_C:
            avisos.append({
                "tipo": "temperatura",
                "cuando": cuando,
                "valor": f"{tmin:g} °C",
                "detalle": (f.get("Temp") or "").strip(),
            })

        racha = parse_racha(f.get("Viento"))
        if racha is not None and racha > VIENTO_KT:
            avisos.append({
                "tipo": "viento",
                "cuando": cuando,
                "valor": f"{racha} kt (racha)",
                "detalle": (f.get("Viento") or "").strip(),
            })

    return avisos


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
        "umbrales": {
            "visibilidad_km": VIS_MIN_KM,
            "temp_min_c": TEMP_MIN_C,
            "viento_racha_kt": VIENTO_KT,
        },
        "hay_alerta": len(avisos) > 0,
        "avisos": avisos,
    }

    with open("alerta.json", "w", encoding="utf-8") as fh:
        json.dump(resultado, fh, ensure_ascii=False, indent=2)

    # Resumen legible en el log de la Action.
    if avisos:
        print(f"⚠️  {len(avisos)} aviso(s) detectado(s):")
        for a in avisos:
            print(f"   · [{a['tipo']}] {a['cuando']} → {a['valor']}  ({a['detalle']})")
    else:
        print("✅ Sin condiciones de aviso en el pronóstico actual.")


if __name__ == "__main__":
    main()
