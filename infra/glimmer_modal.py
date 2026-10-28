"""Serve Muse Glimmer 30B (open weights, Apache 2.0) on Modal with llama.cpp.

llama.cpp is the path Meta's cookbook verifies for Glimmer's image input. The 17 GB Q4_K_M build plus its
vision projector fits a 24 GB L4. Weights live on a Modal Volume so a cold start doesn't re-download them.

    modal secret create glimmer-api-key GLIMMER_API_KEY=<long random string>
    modal run infra/glimmer_modal.py::download      # once: pulls ~18 GB into the volume
    modal deploy infra/glimmer_modal.py             # prints the endpoint URL

Then set GLIMMER_BASE_URL (the URL) and GLIMMER_API_KEY in web/.env.local.
"""

import os
import subprocess

import modal

REPO = "meta-models/Muse-Glimmer-30B-GGUF"
MODEL = "Muse-Glimmer-30B-KQuant-17GB-Q4_K_M.gguf"
MMPROJ = "mmproj-Muse-Glimmer-30B-Q4_K_M.gguf"

app = modal.App("wireproof-glimmer")
weights = modal.Volume.from_name("glimmer-weights", create_if_missing=True)

image = (
    # Upstream llama.cpp server built for CUDA; Muse Glimmer support landed in release b10353.
    modal.Image.from_registry("ghcr.io/ggml-org/llama.cpp:server-cuda", add_python="3.12")
    .entrypoint([])
    .pip_install("huggingface_hub[hf_transfer]==0.36.0")
    .env({"HF_HUB_ENABLE_HF_TRANSFER": "1"})
)


@app.function(image=image, volumes={"/models": weights}, timeout=3600)
def download():
    from huggingface_hub import hf_hub_download

    for name in (MODEL, MMPROJ):
        hf_hub_download(REPO, name, local_dir="/models")
    weights.commit()
    print(sorted(os.listdir("/models")))


@app.function(
    image=image,
    gpu="L4",
    volumes={"/models": weights},
    secrets=[modal.Secret.from_name("glimmer-api-key")],
    # Scale to zero after 5 idle minutes: the gate only runs while someone is capturing photos.
    scaledown_window=300,
    max_containers=1,
    timeout=3600,
)
@modal.concurrent(max_inputs=4)
@modal.web_server(port=8080, startup_timeout=900)
def serve():
    subprocess.Popen([
        "/app/llama-server",
        "-m", f"/models/{MODEL}",
        "--mmproj", f"/models/{MMPROJ}",
        "-a", "muse-glimmer",
        "--host", "0.0.0.0", "--port", "8080",
        "-ngl", "99",
        # Two slots of 8K each: a gate request is one photo plus a short prompt and a short answer.
        "-c", "16384", "-np", "2",
        "--jinja",
        "--chat-template-kwargs", '{"reasoning_strength":"low"}',
        "--api-key", os.environ["GLIMMER_API_KEY"],
    ])
