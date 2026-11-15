# Blender shot renderer for Advanced Video AI. Runs on scale-to-zero Azure Container Apps Jobs,
# on T4 graphics machines (Eevee through the NVIDIA driver, or Cycles on CUDA/OptiX) with a
# software (Mesa) fallback so the same image also renders on ordinary CPU machines.
FROM debian:bookworm-slim
ARG BLENDER=4.2.3
ARG BLENDER_SHA256=3a64efd1982465395abab4259b4091d5c8c56054c7267e9633e4f702a71ea3f4
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl xz-utils ffmpeg python3 \
      libx11-6 libxi6 libxxf86vm1 libxfixes3 libxrender1 libxkbcommon0 libsm6 libice6 libxext6 \
      libgl1 libegl1 libglvnd0 libgl1-mesa-dri libegl-mesa0 mesa-vulkan-drivers libvulkan1 \
    && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL -o /tmp/b.tar.xz https://download.blender.org/release/Blender4.2/blender-${BLENDER}-linux-x64.tar.xz \
    && echo "${BLENDER_SHA256}  /tmp/b.tar.xz" | sha256sum -c - \
    && mkdir -p /opt/blender && tar -xJf /tmp/b.tar.xz -C /opt/blender --strip-components=1 && rm /tmp/b.tar.xz
# Expose the NVIDIA graphics (EGL/OpenGL) and compute libraries when the machine has a T4.
ENV NVIDIA_VISIBLE_DEVICES=all NVIDIA_DRIVER_CAPABILITIES=all
WORKDIR /opt/shot
COPY render_shot.py shot_schema.py set_library.py set_detail.py set-kits.json entry.sh ./
COPY assets ./assets
COPY shots ./shots
RUN chmod +x entry.sh
CMD ["/opt/shot/entry.sh"]
