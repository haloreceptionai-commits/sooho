FROM apify/actor-node-playwright-chrome:22
USER root
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ffmpeg curl && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv /opt/ink/venv && /opt/ink/venv/bin/pip install --no-cache-dir numpy==2.2.6 && /opt/ink/venv/bin/pip install --no-cache-dir torch==2.7.1+cpu torchaudio==2.7.1+cpu --index-url https://download.pytorch.org/whl/cpu
RUN curl -fsSL https://download.pytorch.org/torchaudio/models/wav2vec2_fairseq_base_ls960_asr_ls960.pth -o /opt/ink/weights.pth && echo '488fd4f16de84438ffc945334278c1b9fb9b7159a806c1080b16111a958c945d  /opt/ink/weights.pth' | sha256sum -c -
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY . ./
CMD ["node", "main.js"]