#!/bin/sh
# Renders SHOT (a baked shot file name or a JSON string) with each engine in ENGINES and uploads
# the video and a timing report to private Blob storage under $OUT_PREFIX. Each engine first
# renders a 3-frame probe (reported immediately) so a slow engine is visible within minutes.
set -u
if [ "${SHOT#plan-}" != "${SHOT:-}" ] || [ "${SHOT:-}" = suite ] || [ "${SHOT:-}" = faces ] || [ "${SHOT:-}" = objects ] || [ "${SHOT:-}" = recognition ] || [ "${SHOT:-}" = mechanisms ]; then
  SAS=$(printf '%s' "$AZURE_BLOB_SAS" | sed 's/^?//')
  FAILED=0
  if [ "${SHOT#plan-}" != "$SHOT" ]; then FILES="/opt/shot/shots/$SHOT-*.json"; elif [ "$SHOT" = mechanisms ]; then FILES="/opt/shot/shots/mechanism-*.json"; elif [ "$SHOT" = recognition ]; then FILES="/opt/shot/shots/recognition-*.json"; elif [ "$SHOT" = faces ]; then FILES="/opt/shot/shots/face-*.json"; elif [ "$SHOT" = objects ]; then FILES="/opt/shot/shots/object-*.json"; else FILES="/opt/shot/shots/set-*.json /opt/shot/shots/look-*.json"; fi
  for FILE in $FILES; do
    [ -f "$FILE" ] || continue
    NAME=$(basename "$FILE" .json)
    mkdir -p "/tmp/$NAME"
    SHOT_ENGINE=cycles CYCLES_DEVICE=GPU timeout 600 /opt/blender/blender -b --factory-startup --python-exit-code 1 --python /opt/shot/render_shot.py -- "$FILE" "/tmp/$NAME" > "/tmp/$NAME.log" 2>&1
    CODE=$?
    tail -c 18000 "/tmp/$NAME.log" > "/tmp/$NAME.tail"
    curl -fsS --retry 6 --retry-all-errors --retry-delay 2 -X PUT -H 'x-ms-blob-type: BlockBlob' --data-binary "@/tmp/$NAME.tail" "$AZURE_BLOB_BASE/$OUT_PREFIX/$NAME.log?$SAS" >/dev/null
    EXPECTED=$(python3 -c "import json;s=json.load(open('$FILE'));print(len(s['frames']) if s.get('frames') else round(s['duration']*s.get('fps',30)))")
    ACTUAL=$(ls "/tmp/$NAME"/f_*.png 2>/dev/null | wc -l)
    if [ -f "/tmp/$NAME/object-qa.json" ]; then
      curl -fsS --retry 6 --retry-all-errors --retry-delay 2 -X PUT -H 'x-ms-blob-type: BlockBlob' -H 'Content-Type: application/json' --data-binary "@/tmp/$NAME/object-qa.json" "$AZURE_BLOB_BASE/$OUT_PREFIX/$NAME-qa.json?$SAS" >/dev/null || FAILED=1
    fi
    if [ "$CODE" = 0 ] && [ "$ACTUAL" = "$EXPECTED" ]; then
      if [ "$SHOT" = mechanisms ]; then
        for IMAGE in "/tmp/$NAME"/f_*.png; do
          curl -fsS --retry 6 --retry-all-errors --retry-delay 2 -X PUT -H 'x-ms-blob-type: BlockBlob' -H 'Content-Type: image/png' --data-binary "@$IMAGE" "$AZURE_BLOB_BASE/$OUT_PREFIX/$NAME-$(basename "$IMAGE")?$SAS" >/dev/null || FAILED=1
        done
      else
        curl -fsS --retry 6 --retry-all-errors --retry-delay 2 -X PUT -H 'x-ms-blob-type: BlockBlob' -H 'Content-Type: image/png' --data-binary "@/tmp/$NAME/f_00001.png" "$AZURE_BLOB_BASE/$OUT_PREFIX/$NAME.png?$SAS" >/dev/null || FAILED=1
      fi
      echo "$NAME rendered"
    else
      echo "$NAME failed code=$CODE"; FAILED=1
    fi
  done
  exit "$FAILED"
fi
SHOT_FILE=/tmp/shot.json
case "${SHOT:-mine-push-in}" in \{*) printf '%s' "$SHOT" > $SHOT_FILE ;; *) cp "/opt/shot/shots/${SHOT:-mine-push-in}.json" $SHOT_FILE ;; esac
SAS=$(printf '%s' "$AZURE_BLOB_SAS" | sed 's/^?//')
put() { curl -fsS --retry 6 --retry-all-errors --retry-delay 2 -X PUT -H 'x-ms-blob-type: BlockBlob' -H "Content-Type: $3" --data-binary "@$1" "$AZURE_BLOB_BASE/$OUT_PREFIX/$2?$SAS" >/dev/null && echo "uploaded $2"; }
B="/opt/blender/blender -b --factory-startup --python-exit-code 1"
REPORT=/tmp/report.txt; : > $REPORT
(nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader 2>&1 || echo "no nvidia-smi") | sed 's/^/gpu: /' >> $REPORT
echo "cpus: $(nproc)" >> $REPORT
echo "egl vendors: $(ls /usr/share/glvnd/egl_vendor.d /etc/glvnd/egl_vendor.d 2>/dev/null | tr '\n' ' ') nvidia libs: $(ls /usr/lib/x86_64-linux-gnu/ 2>/dev/null | grep -E 'nvidia|libcuda' | tr '\n' ' ' | cut -c1-600)" >> $REPORT
NVJSON=$(ls /usr/share/glvnd/egl_vendor.d/*nvidia*.json /etc/glvnd/egl_vendor.d/*nvidia*.json 2>/dev/null | head -1)
if [ -z "$NVJSON" ] && ls /usr/lib/x86_64-linux-gnu/libEGL_nvidia.so.0 >/dev/null 2>&1; then
  mkdir -p /usr/share/glvnd/egl_vendor.d; NVJSON=/usr/share/glvnd/egl_vendor.d/10_nvidia.json
  printf '{"file_format_version":"1.0.0","ICD":{"library_path":"libEGL_nvidia.so.0"}}' > $NVJSON
fi
[ -n "$NVJSON" ] && export __EGL_VENDOR_LIBRARY_FILENAMES=$NVJSON && echo "egl forced: $NVJSON" >> $REPORT
put $REPORT report.txt text/plain
for ENG in ${ENGINES:-eevee cycles}; do
  if [ "$ENG" = cycles ]; then DEV=GPU; else DEV=CPU; fi
  python3 -c "import json,sys;s=json.load(open('$SHOT_FILE'));s['frames']=[1,2,3];json.dump(s,open('/tmp/probe.json','w'))"
  rm -rf /tmp/p; START=$(date +%s)
  SHOT_ENGINE=$ENG CYCLES_DEVICE=$DEV timeout 900 $B --python /opt/shot/render_shot.py -- /tmp/probe.json /tmp/p > /tmp/$ENG-probe.log 2>&1
  echo "$ENG probe exit=$? wall=$(( $(date +%s)-START ))s $(grep -o 'Saved.*\|Time: [0-9:.]*' /tmp/$ENG-probe.log | tr '\n' ' ')" >> $REPORT
  grep -iE 'optix|cuda|CYCLES_DEVICES|error' /tmp/$ENG-probe.log | grep -v '^Fra:' | head -12 | sed "s/^/  $ENG: /" >> $REPORT
  put $REPORT report.txt text/plain
  [ "${PROBE_ONLY:-0}" = 1 ] && continue
  rm -rf /tmp/f; mkdir -p /tmp/f; START=$(date +%s)
  SHOT_ENGINE=$ENG CYCLES_DEVICE=$DEV timeout 2400 $B --python /opt/shot/render_shot.py -- $SHOT_FILE /tmp/f > /tmp/$ENG.log 2>&1
  CODE=$?; N=$(ls /tmp/f/f_*.png 2>/dev/null | wc -l)
  for IMAGE in /tmp/f/f_*.png; do
    [ -f "$IMAGE" ] || continue
    [ -n "$(python3 -c "import json;print('yes' if json.load(open('$SHOT_FILE')).get('frames') else '')")" ] || break
    put "$IMAGE" "$(basename "$IMAGE")" image/png
  done
  echo "$ENG full exit=$CODE frames=$N wall=$(( $(date +%s)-START ))s $(grep -o '{"frames.*}' /tmp/$ENG.log | tail -1)" >> $REPORT
  EXPECTED=$(python3 -c "import json;s=json.load(open('$SHOT_FILE'));print(len(s['frames']) if s.get('frames') else round(s['duration']*s.get('fps',30)))")
  FPS=$(python3 -c "import json;print(json.load(open('$SHOT_FILE')).get('fps',30))")
  if [ "$CODE" = 0 ] && [ "$N" = "$EXPECTED" ]; then
    if [ -z "$(python3 -c "import json;print('yes' if json.load(open('$SHOT_FILE')).get('frames') else '')")" ]; then
      ffmpeg -loglevel error -y -framerate "$FPS" -i /tmp/f/f_%05d.png -c:v libx264 -crf 16 -pix_fmt yuv420p /tmp/$ENG.mp4 && put /tmp/$ENG.mp4 $ENG.mp4 video/mp4
    fi
    put /tmp/f/f_00001.png $ENG-first.png image/png
  fi
  tail -c 20000 /tmp/$ENG.log > /tmp/$ENG.tail; put /tmp/$ENG.tail $ENG.log text/plain
  put $REPORT report.txt text/plain
  [ "$CODE" = 0 ] && [ "$N" = "$EXPECTED" ] || exit 1
done
cat $REPORT
