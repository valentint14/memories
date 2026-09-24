# Fixture-uri media

Fișiere **sintetice** (nu conțin imagini ale unor persoane), generate cu `generate.sh`:

```bash
docker run --rm -v "$PWD/fixtures/media:/out" node:24.21.0-trixie-slim sh /out/generate.sh
```

| Fișier | Conținut | Taguri de locație așteptate |
| --- | --- | --- |
| `android.jpg` | JPEG 1600×1200, `Orientation = 6`, serial de dispozitiv | `GPSLatitude`, `GPSLongitude`, `GPSAltitude` |
| `iphone.heic` | HEIC (HEVC) 1200×1600 | `GPSLatitude`, `GPSLongitude`, `GPSAltitude` |
| `iphone-hevc.mov` | MOV HEVC `hvc1` + AAC, 3 s, 720p | `Keys:GPSCoordinates`, `UserData:GPSCoordinates` |
| `clip.mp4` | MP4 H.264 + AAC, 2 s | niciunul |
| `fake.jpg` | text cu extensia `.jpg` | — |
| `corrupt.jpg` | primii 4 KB din `android.jpg` | — |
| `big-50mb.jpg` | generat la rulare de teste (JPEG valid + 51 MB de umplutură); ignorat de git | — |

Limitare: fișierele sunt produse de ffmpeg/libheif, nu de un telefon real. Înainte de producție,
scenariul 10 din quickstart se rulează și cu poze și video filmate pe un iPhone și un Android
reale.
