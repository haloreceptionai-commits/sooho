FROM apify/actor-node-playwright-chrome:22
USER root
# ALIGN=0 builds the slim render-only image (no speech-alignment model), which starts faster on 40 machines.
ARG ALIGN=1
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ffmpeg fonts-dejavu-core mesa-vulkan-drivers libvulkan1 && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv /opt/cartoon/venv && /opt/cartoon/venv/bin/pip install --no-cache-dir numpy==2.2.6 pillow==11.2.1 playwright==1.56.0 opencv-python-headless==4.11.0.86 onnxruntime==1.22.0 && if [ "$ALIGN" = 1 ]; then /opt/cartoon/venv/bin/pip install --no-cache-dir torch==2.7.1+cpu torchaudio==2.7.1+cpu --index-url https://download.pytorch.org/whl/cpu; fi
RUN /opt/cartoon/venv/bin/playwright install --with-deps chromium
ENV CARTOON_GL=auto
ENV CARTOON_PYTHON=/opt/cartoon/venv/bin/python
ENV CARTOON_WEIGHTS=/opt/cartoon/weights.pth
WORKDIR /usr/src/app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY . ./
RUN /opt/cartoon/venv/bin/python tools/fetch-sounds.py
# Long-form documentary renderer: Depth Anything V2 Small (Apache-2.0) as ONNX, pinned to one commit and checked by hash. Used only for picture parallax; a missing file just means a flatter camera.
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*  && curl -fsSL -o /opt/cartoon/depth_small.onnx https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/4472b7362082ad9968fee890ca0f1e5aca36b93d/onnx/model.onnx  && echo 'afb6a5c28f3b6bf1618c6e43f02073ef9dfdc70e937502d51603e57b0a1df10c  /opt/cartoon/depth_small.onnx' | sha256sum -c -
ENV DOC_DEPTH_MODEL=/opt/cartoon/depth_small.onnx
RUN if [ "$ALIGN" = 1 ]; then curl -fsSL https://download.pytorch.org/torchaudio/models/wav2vec2_fairseq_base_ls960_asr_ls960.pth -o /opt/cartoon/weights.pth && echo '488fd4f16de84438ffc945334278c1b9fb9b7159a806c1080b16111a958c945d  /opt/cartoon/weights.pth' | sha256sum -c -; fi
CMD ["node", "actor.js"]