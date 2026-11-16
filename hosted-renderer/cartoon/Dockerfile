FROM apify/actor-node-playwright-chrome:22
USER root
# ALIGN=0 builds the slim render-only image (no speech-alignment model), which starts faster on 40 machines.
ARG ALIGN=1
# BLENDER=1 builds the GPU drawing image (:blender) with Blender 4.2 LTS for Advanced Video AI shots.
ARG BLENDER=0
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ffmpeg fonts-dejavu-core mesa-vulkan-drivers libvulkan1 && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv /opt/cartoon/venv && /opt/cartoon/venv/bin/pip install --no-cache-dir numpy==2.2.6 pillow==11.2.1 playwright==1.56.0 && if [ "$ALIGN" = 1 ]; then /opt/cartoon/venv/bin/pip install --no-cache-dir torch==2.7.1+cpu torchaudio==2.7.1+cpu --index-url https://download.pytorch.org/whl/cpu; fi
RUN /opt/cartoon/venv/bin/playwright install --with-deps chromium
RUN if [ "$BLENDER" = 1 ]; then apt-get update && apt-get install -y --no-install-recommends xz-utils libx11-6 libxi6 libxxf86vm1 libxfixes3 libxrender1 libxkbcommon0 libsm6 libice6 libxext6 libgl1 libegl1 libglvnd0 \
      && rm -rf /var/lib/apt/lists/* && curl -fsSL -o /tmp/b.tar.xz https://download.blender.org/release/Blender4.2/blender-4.2.3-linux-x64.tar.xz \
      && echo "3a64efd1982465395abab4259b4091d5c8c56054c7267e9633e4f702a71ea3f4  /tmp/b.tar.xz" | sha256sum -c - \
      && mkdir -p /opt/blender && tar -xJf /tmp/b.tar.xz -C /opt/blender --strip-components=1 && rm /tmp/b.tar.xz; fi
ENV NVIDIA_VISIBLE_DEVICES=all NVIDIA_DRIVER_CAPABILITIES=all
ENV CARTOON_GL=auto
ENV CARTOON_PYTHON=/opt/cartoon/venv/bin/python
ENV CARTOON_WEIGHTS=/opt/cartoon/weights.pth
WORKDIR /usr/src/app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY . ./
RUN /opt/cartoon/venv/bin/python tools/fetch-sounds.py
RUN if [ "$ALIGN" = 1 ]; then curl -fsSL https://download.pytorch.org/torchaudio/models/wav2vec2_fairseq_base_ls960_asr_ls960.pth -o /opt/cartoon/weights.pth && echo '488fd4f16de84438ffc945334278c1b9fb9b7159a806c1080b16111a958c945d  /opt/cartoon/weights.pth' | sha256sum -c -; fi
CMD ["node", "actor.js"]