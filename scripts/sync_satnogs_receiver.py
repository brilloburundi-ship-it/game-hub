#!/usr/bin/env python3
import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup

NETWORK = "https://network.satnogs.org"
OUT = Path("games/satellite-signal-receiver/data/remote.json")
SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": "Mozilla/5.0 GameHub-SatelliteReceiver/1.1",
    "Accept": "text/html,application/xhtml+xml",
})

ANTENNA_RE = re.compile(
    r"(Cross Yagi|Yagi|Helical|Quadrafilar|Quadrifilar|Turnstile|Dipole|V-Dipole|Vertical|Discone|Eggbeater|Lindenblad|Patch|Ground Plane|Other Directional|Other Omni-Directional)\s*\(([^)]*)\)",
    re.I,
)
STATION_RE = re.compile(r"/stations/(\d+)/?")


def to_int(text):
    digits = re.sub(r"[^0-9]", "", text or "")
    return int(digits) if digits else 0


def parse_antennas(text):
    found = []
    for kind, band in ANTENNA_RE.findall(text or ""):
        found.append({
            "band": band.strip(),
            "antenna_type_name": kind.strip(),
        })
    if not found and text.strip():
        found.append({"band": "", "antenna_type_name": text.strip()})
    return found


def station_score(st):
    score = 0
    for ant in st.get("antenna", []):
        kind = str(ant.get("antenna_type_name", "")).lower()
        if "cross" in kind and "yagi" in kind:
            score += 38
        elif "yagi" in kind:
            score += 30
        elif "other directional" in kind:
            score += 25
        elif "helical" in kind:
            score += 22
        elif "quadrafilar" in kind or "quadrifilar" in kind:
            score += 20
        elif "lindenblad" in kind:
            score += 18
        elif "turnstile" in kind or "eggbeater" in kind:
            score += 15
        elif "patch" in kind:
            score += 12
        elif "discone" in kind:
            score += 10
        elif "vertical" in kind or "ground plane" in kind:
            score += 8
        elif "dipole" in kind:
            score += 6

    total = st.get("total_observations", 0)
    future = st.get("future_passes", 0)
    score += min(24, int(math.log10(max(1, total))) * 5)
    score += min(25, future)
    return score


def fetch_directory_pages(max_pages=16):
    stations = {}
    for page in range(1, max_pages + 1):
        url = f"{NETWORK}/stations/?page={page}"
        r = SESSION.get(url, timeout=35)
        r.raise_for_status()
        soup = BeautifulSoup(r.text, "html.parser")

        table = None
        for candidate in soup.find_all("table"):
            headers = [th.get_text(" ", strip=True).lower() for th in candidate.find_all("th")]
            if "id" in headers and "antennas" in headers:
                table = candidate
                break
        if table is None:
            continue

        rows = table.find_all("tr")
        found_on_page = 0
        for row in rows:
            cells = row.find_all("td")
            if len(cells) < 6:
                continue
            link = row.find("a", href=STATION_RE)
            if not link:
                continue
            match = STATION_RE.search(link.get("href", ""))
            if not match:
                continue
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

        print(f"page {page}: {found_on_page} stations")
        if found_on_page == 0:
            break

    return list(stations.values())


def fetch_recent_observations(station, limit=6):
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
        if table is None:
            return []

        out = []
        for row in table.find_all("tr"):
            cells = row.find_all("td")
            if len(cells) < 4:
                continue
            obs_link = row.find("a", href=re.compile(r"/observations/\d+/?"))
            if not obs_link:
                continue
            m = re.search(r"/observations/(\d+)/?", obs_link.get("href", ""))
            if not m:
                continue
            obs_id = int(m.group(1))
            texts = [c.get_text(" ", strip=True) for c in cells]
            out.append({
                "id": obs_id,
                "satellite": texts[1] if len(texts) > 1 else "Satellite",
                "frequency_text": texts[2] if len(texts) > 2 else "",
                "transmitter_mode": texts[3] if len(texts) > 3 else "",
                "timeframe_text": texts[4] if len(texts) > 4 else "",
                "observation_url": f"{NETWORK}/observations/{obs_id}/",
                "payload": None,
                "waterfall": None,
                "demoddata": [],
            })
            if len(out) >= limit:
                break
        return out
    except Exception as exc:
        print(f"observations for station {station['id']} failed: {exc}")
        return []


def main():
    stations = fetch_directory_pages(16)
    if not stations:
        raise RuntimeError("SatNOGS public station directory returned no stations")

    stations.sort(key=lambda s: (s.get("score", 0), s.get("future_passes", 0), s.get("total_observations", 0)), reverse=True)
    selected = stations[:80]

    # Fetch recent observation metadata only for the highest-ranked stations.
    for station in selected[:24]:
        station["observations"] = fetch_recent_observations(station, 6)

    payload = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "source": "SatNOGS public ground-station directory",
        "station_count": len(selected),
        "stations": selected,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(selected)} stations to {OUT}")


if __name__ == "__main__":
    main()
