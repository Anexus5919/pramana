"""Merge a trained LoRA adapter into fp16 Qwen3-1.7B weights on CPU and write an Ollama Modelfile.

    python training/merge_adapter.py <adapter_dir> <out_dir>
    ollama create pramana-extract -f <out_dir>/Modelfile -q q4_K_M

Ollama quantises safetensors imports itself, so no llama.cpp build is needed.
"""

import sys
from pathlib import Path

import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer

BASE = "Qwen/Qwen3-1.7B"


def main(adapter: str, out: str) -> None:
    out_dir = Path(out)
    merged = out_dir / "merged"
    tok = AutoTokenizer.from_pretrained(BASE)
    base = AutoModelForCausalLM.from_pretrained(BASE, dtype=torch.float16)
    model = PeftModel.from_pretrained(base, adapter).merge_and_unload()
    model.save_pretrained(merged, safe_serialization=True)
    tok.save_pretrained(merged)
    template = (Path(__file__).parent / "Modelfile").read_text(encoding="utf-8")
    template = template.replace("FROM ./pramana-extract-q4_k_m.gguf", "FROM ./merged")
    (out_dir / "Modelfile").write_text(template, encoding="utf-8")
    print("merged to", merged)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
