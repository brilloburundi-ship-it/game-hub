#!/usr/bin/env python3
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin

import requests

NETWORK = "https://network.satnogs.org"
API = NETWORK + "/api"
OUT = Path("games/satellite-signal-receiver/data/remote.json")
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "GameHub-SatelliteReceiver/1.0", "Accept": "application/json"})


def fetch_pages(endpoint: str, max_pages: int):
    out = []
    url = f"{API}/{endpoint}/?format=json"
    seen = set()
    for _ in range(max_pages):
        if not url or url in seen:
            break
        seen.add(url)
        r = SESSION.get(url, timeout=30)
        if r.status_code in (400, 404):
            break
        r.raise_for_status()
        data = r.json()
        if isinstance(data, list):
            rows = data
        else:
            rows = data.get("results", [])
        if not rows:
            break
        out.extend(rows)

        # SatNOGS Network uses cursor pagination exposed in the HTTP Link header.
        next_url = (r.links.get("next") or {}).get("url")
        if not next_url and isinstance(data, dict):
            next_url = data.get("next")
        url = next_url
    return out


def antennas(st):
    value = st.get("antenna") or st.get("antennas") or []
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except Exception:
            value = []
    return value if isinstance(value, list) else []


def station_score(st):
    score = 0
    status = str(st.get("status", "")).lower()
    if "online" in status:
        score += 40
    elif "testing" in status or "experimental" in status:
        score += 15
    for a in antennas(st):
        kind = str(a.get("antenna_type_name") or a.get("antenna_type") or "").lower()
        if "cross" in kind and "yagi" in kind:
            score += 35
        elif "yagi" in kind:
            score += 28
        elif "helical" in kind:
            score += 22
        elif "qfh" in kind or "quadrafilar" in kind or "quadrifilar" in kind:
            score += 20
        elif "turnstile" in kind:
            score += 15
        elif "dipole" in kind:
            score += 8
    return score


def absolute_url(value):
    if not value or not isinstance(value, str):
        return None
    return value if value.startswith("http") else urljoin(NETWORK + "/", value.lstrip("/"))


def compact_observation(o):
    return {
        "id": o.get("id"),
        "ground_station": o.get("ground_station") or o.get("station_id"),
        "station_name": o.get("station_name"),
        "norad_cat_id": o.get("norad_cat_id"),
        "start": o.get("start"),
        "status": o.get("status") or o.get("vetted_status"),
        "vetted_status": o.get("vetted_status"),
        "max_altitude": o.get("max_altitude"),
        "transmitter_mode": o.get("transmitter_mode"),
        "transmitter_description": o.get("transmitter_description"),
        "transmitter_downlink_low": o.get("transmitter_downlink_low"),
        "transmitter_downlink_high": o.get("transmitter_downlink_high"),
        "observation_frequency": o.get("observation_frequency"),
        "payload": absolute_url(o.get("payload")),
        "waterfall": absolute_url(o.get("waterfall")),
        "demoddata": o.get("demoddata") or [],
    }


def main():
    stations = fetch_pages("stations", 12)
    observations = fetch_pages("observations", 12)

    by_station = {}
    for raw in observations:
        obs = compact_observation(raw)
        sid = obs.get("ground_station")
        if sid is None:
            continue
        if not (obs.get("payload") or obs.get("waterfall") or obs.get("demoddata")):
            continue
        by_station.setdefault(str(sid), []).append(obs)

    selected = []
    for st in stations:
        sid = st.get("id")
        obs = by_station.get(str(sid), [])[:12]
        if not obs:
            continue
        selected.append({
            "id": sid,
            "name": st.get("name"),
            "status": st.get("status"),
            "last_seen": st.get("last_seen"),
            "latitude": st.get("lat") if st.get("lat") is not None else st.get("latitude"),
            "longitude": st.get("lng") if st.get("lng") is not None else st.get("longitude"),
            "antenna": antennas(st),
            "score": station_score(st),
            "observations": obs,
        })

    selected.sort(key=lambda x: (x.get("score", 0), x.get("last_seen") or ""), reverse=True)
    selected = selected[:80]

    payload = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "source": "SatNOGS Network",
        "station_count": len(selected),
        "stations": selected,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Fetched {len(stations)} stations and {len(observations)} observations")
    print(f"Wrote {len(selected)} stations to {OUT}")


if __name__ == "__main__":
    main()
