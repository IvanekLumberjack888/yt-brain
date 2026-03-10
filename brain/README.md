# 🧠 YT Brain — Python Pipeline

## Jak to funguje

```
YouTube playlist (veřejný, druhý účet)
    ↓ GitHub Actions (každý den 08:00 UTC)
check_playlist.py → data/queue.json
    ↓ lokálně na Windows (ručně)
process_queue.py → transcripts/YYYY/nazev--videoId.md
    ↓
Claude Project (GitHub sync) → ptáš se na obsah
```

---

## Klíče (ulož do Bitwardenu)

| Položka | Kde použít |
|---|---|
| `YT_API_KEY` | GitHub Secrets + lokální spuštění |
| `YT_PLAYLIST_ID` | `PLWbMLATNJNHanT3hlAoTLZEZrHzhU0mpn` |

**GitHub Secrets** (jednou, už nastaveno):
`github.com/IvanekLumberjack888/yt-brain → Settings → Secrets → Actions`

---

## Příkazy (Windows PowerShell)

### Instalace závislostí (jednou)
```powershell
cd C:\Users\ivi_divi_whiskery\PROJECTS\yt-brain
pip install -r brain/requirements.txt
```

### Test lokálně — check playlist
```powershell
cd C:\Users\ivi_divi_whiskery\PROJECTS\yt-brain
$env:YT_API_KEY = "sem_vlož_klíč_z_bitwardenu"
$env:YT_PLAYLIST_ID = "PLWbMLATNJNHanT3hlAoTLZEZrHzhU0mpn"
python3.13 brain/check_playlist.py
```

### Zpracovat frontu — stáhnout transkripty (lokálně)
```powershell
cd C:\Users\ivi_divi_whiskery\PROJECTS\yt-brain
python3.13 brain/process_queue.py
```

### Po zpracování — push do GitHubu
```powershell
git add .
git commit -m "transcripts: nová videa"
git push
```

### Stáhnout změny z GitHubu (po Actions runu)
```powershell
git pull
```

---

## Workflow (týdenní rutina)

1. GitHub Actions běží automaticky každý den v 08:00 UTC
2. Když přidáš video do playlistu → Actions to zachytí do 24h → zapíše do `queue.json`
3. Ty spustíš `process_queue.py` lokálně → stáhne transkript → uloží jako `.md`
4. `git push` → soubory jsou v repo → Claude Project to vidí

---

## Struktura
```
data/
  queue.json              # Videa čekající na transcript
  processed_videos.json   # Již zpracované video IDs
transcripts/
  2026/
    nazev-videa--abc123.md
brain/
  check_playlist.py       # GitHub Actions stage
  process_queue.py        # Lokální stage
  requirements.txt
```
