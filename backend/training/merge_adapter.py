"""Merge a trained LoRA adapter into fp16 Qwen3-1.7B weights on CPU and write an Ollama Modelfile.

    python training/merge_adapter.py <adapter_dir> <out_dir> [gguf_name]
    python <llama.cpp>/convert_hf_to_gguf.py <out_dir>/merged --outtype q8_0 --outfile <out_dir>/<gguf_name>
    ollama create pramana-extract -f <out_dir>/Modelfile

gguf_name defaults to pramana-extract-q8_0.gguf; version 2 uses pramana-extract-v2-q8_0.gguf and registers
as pramana-extract-v2. The Modelfile keeps training/Modelfile's template and parameters; only the FROM line
changes. The converter writes Q8_0 directly, so no llama.cpp build is needed. Ollama's own quantiser for
safetensors imports needs the MLX runtime, which is not available on Windows.

PRAMANA_DRYRUN=1 merges onto the tiny Qwen3 test model instead, to check an adapter from a dry run.
"""

import os
import sys
from pathlib import Path

import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer

DRY = os.environ.get("PRAMANA_DRYRUN") == "1"
BASE = "trl-internal-testing/tiny-Qwen3ForCausalLM" if DRY else "Qwen/Qwen3-1.7B"


def main(adapter: str, out: str, gguf: str = "pramana-extract-q8_0.gguf") -> None:
    out_dir = Path(out)
    merged = out_dir / "merged"
    tok = AutoTokenizer.from_pretrained(BASE)
    base = AutoModelForCausalLM.from_pretrained(BASE, dtype=torch.float16)
    model = PeftModel.from_pretrained(base, adapter).merge_and_unload()
    model.save_pretrained(merged, safe_serialization=True)
    tok.save_pretrained(merged)
    template = (Path(__file__).parent / "Modelfile").read_text(encoding="utf-8")
    template = template.replace("FROM ./pramana-extract-q4_k_m.gguf", f"FROM ./{gguf}")
    (out_dir / "Modelfile").write_text(template, encoding="utf-8")
    print("merged to", merged)


if __name__ == "__main__":
    main(*sys.argv[1:4])
