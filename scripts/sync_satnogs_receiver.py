#!/usr/bin/env python3
import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

NETWORK = "https://network.satnogs.org"
API = NETWORK + "/api"
OUT = Path("games/satellite-signal-receiver/data/remote.json")
SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": "Mozilla/5.0 GameHub-SatelliteReceiver/2.0",
    "Accept": "text/html,application/xhtml+xml,application/json",
})

ANTENNA_RE = re.compile(
    r"(Cross Yagi|Yagi|Helical|Quadrafilar|Quadrifilar|Turnstile|Dipole|V-Dipole|Vertical|Discone|Eggbeater|Lindenblad|Patch|Ground Plane|Other Directional|Other Omni-Directional|Parabolic)\s*\(([^)]*)\)",
    re.I,
)
STATION_RE = re.compile(r"/stations/(\d+)/?")
OBS_RE = re.compile(r"/observations/(\d+)/?")


def to_int(text):
    digits = re.sub(r"[^0-9]", "", text or "")
    return int(digits) if digits else 0


def parse_antennas(text):
    found = []
    for kind, band in ANTENNA_RE.findall(text or ""):
        found.append({"band": band.strip(), "antenna_type_name": kind.strip()})
    if not found and (text or "").strip():
        found.append({"band": "", "antenna_type_name": text.strip()})
    return found


def station_score(st):
    score = 0
    for ant in st.get("antenna", []):
        kind = str(ant.get("antenna_type_name", "")).lower()
        if "cross" in kind and "yagi" in kind: score += 38
        elif "yagi" in kind: score += 30
        elif "other directional" in kind: score += 27
        elif "parabolic" in kind: score += 25
        elif "helical" in kind: score += 22
        elif "quadrafilar" in kind or "quadrifilar" in kind: score += 20
        elif "lindenblad" in kind: score += 18
        elif "turnstile" in kind or "eggbeater" in kind: score += 15
        elif "patch" in kind: score += 12
        elif "discone" in kind: score += 10
        elif "vertical" in kind or "ground plane" in kind: score += 8
        elif "dipole" in kind: score += 6
    total = st.get("total_observations", 0)
    future = st.get("future_passes", 0)
    score += min(24, int(math.log10(max(1, total))) * 5)
    score += min(25, future)
    if st.get("observations"): score += 25
    return score


def fetch_directory_pages(max_pages=18):
    stations = {}
    for page in range(1, max_pages + 1):
        r = SESSION.get(f"{NETWORK}/stations/?page={page}", timeout=35)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, "html.parser")
        table = None
        for candidate in soup.find_all("table"):
            headers = [th.get_text(" ", strip=True).lower() for th in candidate.find_all("th")]
            if "id" in headers and "antennas" in headers:
                table = candidate
                break
        if table is None: continue
        found_on_page = 0
        for row in table.find_all("tr"):
            cells = row.find_all("td")
            if len(cells) < 6: continue
            link = row.find("a", href=STATION_RE)
            if not link: continue
            match = STATION_RE.search(link.get("href", ""))
            if not match: continue
            sid = int(match.group(1))
            texts = [c.get_text(" ", strip=True) for c in cells]
            station = {
                "id": sid,
                "name": texts[1] if len(texts) > 1 else link.get_text(" ", strip=True),
                "status": "directory",
                "location": texts[2] if len(texts) > 2 else "",
                "total_observations": to_int(texts[3] if len(texts) > 3 else "0"),
                "future_passes": to_int(texts[4] if len(texts) > 4 else "0"),
                "antenna": parse_antennas(texts[5] if len(texts) > 5 else ""),
                "station_url": f"{NETWORK}/stations/{sid}/",
                "observations_url": f"{NETWORK}/observations/?station={sid}",
                "observations": [],
            }
            station["score"] = station_score(station)
            stations[sid] = station
            found_on_page += 1
        print(f"directory page {page}: {found_on_page} stations")
        if found_on_page == 0: break
    return list(stations.values())


def compact_api_observation(o):
    oid = o.get("id")
    return {
        "id": oid,
        "satellite": o.get("satellite_name") or o.get("tle0") or None,
        "sat_id": o.get("sat_id"),
        "norad_cat_id": o.get("norad_cat_id"),
        "start": o.get("start"),
        "end": o.get("end"),
        "status": o.get("status"),
        "vetted_status": o.get("vetted_status"),
        "max_altitude": o.get("max_altitude"),
        "transmitter_mode": o.get("transmitter_mode") or o.get("mode"),
        "transmitter_description": o.get("transmitter_description"),
        "transmitter_downlink_low": o.get("transmitter_downlink_low"),
        "transmitter_downlink_high": o.get("transmitter_downlink_high"),
        "observation_frequency": o.get("observation_frequency") or o.get("frequency"),
        "observation_url": f"{NETWORK}/observations/{oid}/" if oid else None,
        "payload": o.get("payload"),
        "waterfall": o.get("waterfall"),
        "demoddata": o.get("demoddata") or [],
    }


def _parse_iso(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace('Z', '+00:00'))
    except Exception:
        return None


def fetch_api_observations(station_id, limit=8):
    try:
        r = SESSION.get(f"{API}/observations/", params={"ground_station": station_id, "format": "json"}, timeout=30)
        r.raise_for_status()
        data = r.json()
        rows = data if isinstance(data, list) else data.get("results", [])
        now = datetime.now(timezone.utc)
        out = []
        for x in rows:
            if not x.get('id'):
                continue
            end = _parse_iso(x.get('end'))
            start = _parse_iso(x.get('start'))
            if (end and end > now) or (not end and start and start > now):
                continue
            out.append(compact_api_observation(x))
        out.sort(key=lambda x: x.get("start") or "", reverse=True)
        return out[:limit]
    except Exception as exc:
        print(f"API observations station {station_id} failed: {exc}")
        return []


def fetch_html_observations(station, limit=8):
    try:
        r = SESSION.get(station["observations_url"], timeout=25)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, "html.parser")
        table = None
        for candidate in soup.find_all("table"):
            headers = [th.get_text(" ", strip=True).lower() for th in candidate.find_all("th")]
            if "id" in headers and "satellite" in headers:
                table = candidate
                break
        if table is None: return []
        out = []
        for row in table.find_all("tr"):
            cells = row.find_all("td")
            if len(cells) < 4: continue
            obs_link = row.find("a", href=OBS_RE)
            if not obs_link: continue
            m = OBS_RE.search(obs_link.get("href", ""))
            if not m: continue
            obs_id = int(m.group(1))
            texts = [c.get_text(" ", strip=True) for c in cells]
            timeframe = texts[4] if len(texts) > 4 else ""
            stamps = re.findall(r'\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}', timeframe)
            if stamps:
                try:
                    end_text = stamps[1] if len(stamps) > 1 else stamps[0]
                    end_dt = datetime.strptime(end_text, '%Y-%m-%d %H:%M:%S').replace(tzinfo=timezone.utc)
                    if end_dt > datetime.now(timezone.utc):
                        continue
                except Exception:
                    pass
            out.append({
                "id": obs_id,
                "satellite": texts[1] if len(texts) > 1 else "Satellite",
                "frequency_text": texts[2] if len(texts) > 2 else "",
                "transmitter_mode": texts[3] if len(texts) > 3 else "",
                "timeframe_text": timeframe,
                "observation_url": f"{NETWORK}/observations/{obs_id}/",
                "payload": None,
                "waterfall": None,
                "demoddata": [],
            })
            if len(out) >= limit: break
        return out
    except Exception as exc:
        print(f"HTML observations station {station['id']} failed: {exc}")
        return []


def absolute(value):
    if not value or not isinstance(value, str): return None
    return value if value.startswith("http") else urljoin(NETWORK + "/", value)


def enrich_media(obs):
    if not obs.get("observation_url"): return obs
    try:
        r = SESSION.get(obs["observation_url"], timeout=22)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, "html.parser")
        if not obs.get("payload"):
            for tag in soup.find_all(["source", "a", "audio"]):
                u = tag.get("src") or tag.get("href")
                if u and (".ogg" in u.lower() or ".wav" in u.lower() or "audio" in u.lower()):
                    obs["payload"] = absolute(u); break
        if not obs.get("waterfall"):
            for tag in soup.find_all(["img", "a"]):
                u = tag.get("src") or tag.get("href")
                if u and "waterfall" in u.lower():
                    obs["waterfall"] = absolute(u); break
    except Exception as exc:
        print(f"media enrich observation {obs.get('id')} failed: {exc}")
    return obs


def main():
    stations = fetch_directory_pages(18)
    if not stations: raise RuntimeError("SatNOGS public station directory returned no stations")
    stations.sort(key=lambda s: (s.get("score", 0), s.get("future_passes", 0), s.get("total_observations", 0)), reverse=True)
    selected = stations[:80]

    # AUTO RX needs recent observations already in cache. Use the official read-only
    # observations API first, then fall back to the public HTML list.
    for station in selected[:36]:
        obs = fetch_api_observations(station["id"], 8)
        if not obs: obs = fetch_html_observations(station, 8)
        station["observations"] = obs
        station["score"] = station_score(station)

    # Enrich only a small number of top observations with media links to keep sync light.
    selected.sort(key=lambda s: (s.get("score", 0), s.get("future_passes", 0), s.get("total_observations", 0)), reverse=True)
    enriched = 0
    for station in selected:
        if enriched >= 16: break
        for i, obs in enumerate(station.get("observations", [])[:2]):
            if enriched >= 16: break
            station["observations"][i] = enrich_media(obs)
            enriched += 1

    payload = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "source": "SatNOGS public ground-station directory + observations API",
        "station_count": len(selected),
        "auto_rx": True,
        "stations": selected,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(selected)} stations; enriched {enriched} observation pages")

if __name__ == "__main__":
    main()
