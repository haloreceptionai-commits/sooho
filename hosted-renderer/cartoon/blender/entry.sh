#!/bin/sh
# Renders SHOT (a baked shot file name or a JSON string) with each engine in ENGINES and uploads
# the frames' video and timing report to private Blob storage under $OUT_PREFIX.
set -u
SHOT_FILE=/tmp/shot.json
case "${SHOT:-mine-push-in}" in \{*) printf '%s' "$SHOT" > $SHOT_FILE ;; *) cp "/opt/shot/shots/${SHOT:-mine-push-in}.json" $SHOT_FILE ;; esac
SAS=$(printf '%s' "$AZURE_BLOB_SAS" | sed 's/^?//')
put() { curl -fsS -X PUT -H 'x-ms-blob-type: BlockBlob' -H "Content-Type: $3" --data-binary "@$1" "$AZURE_BLOB_BASE/$OUT_PREFIX/$2?$SAS" >/dev/null && echo "uploaded $2"; }
REPORT=/tmp/report.txt; : > $REPORT
(nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader 2>&1 || echo "no nvidia-smi") | sed 's/^/gpu: /' >> $REPORT
echo "cpus: $(nproc)" >> $REPORT
for ENG in ${ENGINES:-eevee cycles}; do
  rm -rf /tmp/f; mkdir -p /tmp/f; START=$(date +%s)
  if [ "$ENG" = cycles ]; then DEV=GPU; else DEV=CPU; fi
  SHOT_ENGINE=$ENG CYCLES_DEVICE=$DEV timeout 3000 /opt/blender/blender -b --factory-startup --python-exit-code 1 --python /opt/shot/render_shot.py -- $SHOT_FILE /tmp/f > /tmp/$ENG.log 2>&1
  CODE=$?; END=$(date +%s)
  N=$(ls /tmp/f | wc -l)
  echo "$ENG exit=$CODE frames=$N wall=$((END-START))s $(grep -o '{"frames.*}' /tmp/$ENG.log | tail -1)" >> $REPORT
  grep -iE 'gpu|egl|opengl|optix|cuda|device|error' /tmp/$ENG.log | grep -v '^Fra:' | head -25 | sed "s/^/  $ENG: /" >> $REPORT
  if [ "$N" -gt 0 ]; then
    ffmpeg -loglevel error -y -framerate 30 -i /tmp/f/f_%05d.png -c:v libx264 -crf 16 -pix_fmt yuv420p /tmp/$ENG.mp4 && put /tmp/$ENG.mp4 $ENG.mp4 video/mp4
    put /tmp/f/f_00001.png $ENG-first.png image/png
  fi
  tail -c 20000 /tmp/$ENG.log > /tmp/$ENG.tail; put /tmp/$ENG.tail $ENG.log text/plain
done
cat $REPORT; put $REPORT report.txt text/plain
