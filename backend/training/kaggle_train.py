"""QLoRA fine-tune of Qwen3-1.7B (Apache-2.0) as Pramana's grounded field extractor, for a Kaggle GPU.

Input: train.jsonl and val.jsonl from training/make_dataset.py, attached as a Kaggle dataset.
Output (/kaggle/working): pramana-extract-q4_k_m.gguf (or an F16 GGUF if quantisation is unavailable),
train_log.json with losses and settings.

The text format is written out by hand so it matches training/Modelfile exactly:
system, user, then an assistant turn with an empty think block, and loss on the JSON answer only.
"""

import glob
import json
import os
import shutil
import subprocess
import sys
import time

subprocess.run([sys.executable, "-m", "pip", "install", "-q", "unsloth"], check=False)

import torch  # noqa: E402
from datasets import Dataset  # noqa: E402

BASE = "unsloth/Qwen3-1.7B"
MAX_LEN = 1536
OUT = "/kaggle/working"
data_dir = next(p for p in glob.glob("/kaggle/input/**/train.jsonl", recursive=True))
data_dir = os.path.dirname(data_dir)


def to_pc(row):
    m = row["messages"]
    prompt = (f"<|im_start|>system\n{m[0]['content']}<|im_end|>\n<|im_start|>user\n{m[1]['content']}<|im_end|>\n"
              "<|im_start|>assistant\n<think>\n\n</think>\n\n")
    return {"prompt": prompt, "completion": m[2]["content"] + "<|im_end|>"}


def load(name):
    rows = [json.loads(x) for x in open(os.path.join(data_dir, name), encoding="utf-8")]
    return Dataset.from_list([to_pc(r) for r in rows])


train, val = load("train.jsonl"), load("val.jsonl")
print("examples", len(train), len(val), "gpu", torch.cuda.get_device_name(0))

from trl import SFTConfig, SFTTrainer  # noqa: E402
from unsloth import FastLanguageModel  # noqa: E402

# T4 (compute 7.5) emulates bf16 but its AMP path needs fp16; use bf16 only on Ampere or newer
USE_BF16 = torch.cuda.get_device_capability(0)[0] >= 8
DTYPE = torch.bfloat16 if USE_BF16 else torch.float16
model, tok = FastLanguageModel.from_pretrained(BASE, max_seq_length=MAX_LEN, load_in_4bit=True, dtype=DTYPE)
model = FastLanguageModel.get_peft_model(
    model, r=16, lora_alpha=32, lora_dropout=0, bias="none",
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    use_gradient_checkpointing="unsloth", random_state=26261)

steps = 2 * len(train) // (8 * 2)
cfg = dict(output_dir=f"{OUT}/ckpt", per_device_train_batch_size=8, gradient_accumulation_steps=2,
           num_train_epochs=2, learning_rate=2e-4, warmup_steps=max(1, steps // 20), lr_scheduler_type="cosine",
           logging_steps=10, eval_strategy="epoch", save_strategy="no", optim="adamw_8bit",
           weight_decay=0.01, seed=26261, report_to="none", max_length=MAX_LEN,
           completion_only_loss=True, fp16=not USE_BF16, bf16=USE_BF16)
# Library versions on the runner move; keep only arguments this SFTConfig accepts
import inspect  # noqa: E402

accepted = inspect.signature(SFTConfig.__init__).parameters
print("dropping unsupported SFTConfig args:", [k for k in cfg if k not in accepted])
args = SFTConfig(**{k: v for k, v in cfg.items() if k in accepted})
trainer = SFTTrainer(model=model, processing_class=tok, train_dataset=train, eval_dataset=val, args=args)
t0 = time.time()
res = trainer.train()
ev = trainer.evaluate()
log = {"base": BASE, "train_examples": len(train), "val_examples": len(val), "train_loss": res.training_loss,
       "eval": ev, "minutes": round((time.time() - t0) / 60, 1), "log_history": trainer.state.log_history}
json.dump(log, open(f"{OUT}/train_log.json", "w"), indent=2)
print(json.dumps({k: v for k, v in log.items() if k != "log_history"}, indent=2))

# Sanity check on three validation prompts
FastLanguageModel.for_inference(model)
for i in range(3):
    p = val[i]["prompt"]
    ids = tok(p, return_tensors="pt").to("cuda")
    out = model.generate(**ids, max_new_tokens=200, do_sample=False)
    print("GOT ", tok.decode(out[0][ids["input_ids"].shape[1]:], skip_special_tokens=True))
    print("WANT", val[i]["completion"])

gguf = None
try:
    model.save_pretrained_gguf(f"{OUT}/gguf", tok, quantization_method="q4_k_m")
    cands = sorted(glob.glob(f"{OUT}/gguf*/**/*.gguf", recursive=True) + glob.glob(f"{OUT}/*.gguf"))
    q = [c for c in cands if "q4_k_m" in c.lower()] or cands
    if q:
        gguf = f"{OUT}/pramana-extract-q4_k_m.gguf"
        shutil.copy(q[-1], gguf)
except Exception as e:  # noqa: BLE001
    print("unsloth gguf export failed:", e)
if gguf is None:
    # Fallback: merged 16-bit weights converted with llama.cpp's converter; Ollama quantises on import
    model.save_pretrained_merged(f"{OUT}/merged", tok, save_method="merged_16bit")
    subprocess.run(["git", "clone", "--depth", "1", "https://github.com/ggml-org/llama.cpp", "/tmp/llama.cpp"],
                   check=True)
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", "gguf", "sentencepiece"], check=True)
    subprocess.run([sys.executable, "/tmp/llama.cpp/convert_hf_to_gguf.py", f"{OUT}/merged", "--outtype", "f16",
                    "--outfile", f"{OUT}/pramana-extract-f16.gguf"], check=True)
    shutil.rmtree(f"{OUT}/merged", ignore_errors=True)
for d in ("ckpt", "gguf"):
    shutil.rmtree(f"{OUT}/{d}", ignore_errors=True)
print("outputs:", os.listdir(OUT))
