#!/bin/sh
# Generează fixture-urile media sintetice (fără fișiere personale) într-un container Debian:
#   docker run --rm -v "$PWD/fixtures/media:/out" node:24.21.0-trixie-slim sh /out/generate.sh
set -eu
apt-get update -qq
apt-get install -y -qq --no-install-recommends ffmpeg libheif-examples libheif-plugin-x265 libimage-exiftool-perl >/dev/null
cd /out
GPS="-GPSLatitude=44.4268 -GPSLatitudeRef=N -GPSLongitude=26.1025 -GPSLongitudeRef=E -GPSAltitude=80"

# JPEG Android cu GPS și orientare 6 (rotit 90°)
ffmpeg -loglevel error -y -f lavfi -i testsrc2=size=1600x1200 -frames:v 1 -q:v 3 android.jpg
exiftool -q -overwrite_original $GPS -Make=Google -Model="Pixel 7" -Orientation#=6 -SerialNumber=ABC123 android.jpg

# HEIC iPhone cu GPS
ffmpeg -loglevel error -y -f lavfi -i testsrc2=size=1200x1600 -frames:v 1 /tmp/iphone.png
heif-enc -q 60 -o iphone.heic /tmp/iphone.png >/dev/null
exiftool -q -overwrite_original $GPS -Make=Apple -Model="iPhone 15" iphone.heic

# MOV HEVC (ca pe iPhone) cu locație QuickTime
ffmpeg -loglevel error -y -f lavfi -i testsrc2=size=1280x720:rate=30 -f lavfi -i sine=frequency=440 \
  -t 3 -c:v libx265 -tag:v hvc1 -pix_fmt yuv420p -c:a aac -movflags +faststart iphone-hevc.mov
exiftool -q -overwrite_original "-Keys:GPSCoordinates=44.4268 N, 26.1025 E, 80 m" "-UserData:GPSCoordinates=44.4268 N, 26.1025 E, 80 m" -Keys:Make=Apple iphone-hevc.mov

# MP4 H.264 fără locație
ffmpeg -loglevel error -y -f lavfi -i testsrc2=size=640x360:rate=25 -f lavfi -i sine=frequency=660 \
  -t 2 -c:v libx264 -pix_fmt yuv420p -c:a aac -movflags +faststart clip.mp4

# Text redenumit .jpg (tipul real nu corespunde)
printf 'acesta nu este un JPEG\n' > fake.jpg

# JPEG trunchiat: antet valid, date incomplete
head -c 4096 android.jpg > corrupt.jpg

echo "Verificare locație:"
exiftool -s -G1 -gps:all -Keys:GPSCoordinates -UserData:GPSCoordinates android.jpg iphone.heic iphone-hevc.mov
