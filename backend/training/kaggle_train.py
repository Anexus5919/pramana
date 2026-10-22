"""QLoRA fine-tune of Qwen3-1.7B (Apache-2.0) as Pramana's grounded field extractor, for a Kaggle T4 GPU.

Uses plain transformers + PEFT + bitsandbytes (fp16 compute, fp32 LoRA weights), which behave predictably
on T4s that lack bf16. Input: train.jsonl and val.jsonl from training/make_dataset.py attached as a Kaggle
dataset. Output in /kaggle/working: pramana-extract-q4_k_m.gguf (or pramana-extract-f16.gguf when the
quantiser cannot be built) and train_log.json.

The text format is written out by hand so it matches training/Modelfile exactly: system, user, then an
assistant turn with an empty think block; loss is computed on the JSON answer only.
"""

import glob
import inspect
import json
import os
import shutil
import subprocess
import sys
import time

# PRAMANA_DRYRUN=1 runs the same code path on CPU with a tiny Qwen3 model and two steps, to catch
# library and config errors locally before spending GPU time
DRY = os.environ.get("PRAMANA_DRYRUN") == "1"
# One process, one GPU: SFTTrainer refuses nn.DataParallel when two T4s are visible
os.environ["CUDA_VISIBLE_DEVICES"] = "0"
if not DRY:
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", "-U", "peft", "trl", "bitsandbytes", "accelerate"],
                   check=False)
    # The image ships an old torchao that newer PEFT rejects when merging; LoRA does not need it
    subprocess.run([sys.executable, "-m", "pip", "uninstall", "-y", "-q", "torchao"], check=False)

import torch  # noqa: E402
from datasets import Dataset  # noqa: E402
from peft import LoraConfig, PeftModel, prepare_model_for_kbit_training  # noqa: E402
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig  # noqa: E402
from trl import SFTConfig, SFTTrainer  # noqa: E402

BASE = "trl-internal-testing/tiny-Qwen3ForCausalLM" if DRY else "Qwen/Qwen3-1.7B"
MAX_LEN = 1536
OUT = os.environ.get("PRAMANA_OUT", "/kaggle/working")
TMP = os.environ.get("PRAMANA_TMP", "/tmp")
data_dir = os.environ.get("PRAMANA_DATA") or os.path.dirname(
    next(iter(glob.glob("/kaggle/input/**/train.jsonl", recursive=True))))


def to_pc(row):
    m = row["messages"]
    prompt = (f"<|im_start|>system\n{m[0]['content']}<|im_end|>\n<|im_start|>user\n{m[1]['content']}<|im_end|>\n"
              "<|im_start|>assistant\n<think>\n\n</think>\n\n")
    return {"prompt": prompt, "completion": m[2]["content"] + "<|im_end|>"}


def load(name):
    rows = [json.loads(x) for x in open(os.path.join(data_dir, name), encoding="utf-8")]
    return Dataset.from_list([to_pc(r) for r in rows])


train, val = load("train.jsonl"), load("val.jsonl")
if DRY:
    train, val = train.select(range(32)), val.select(range(8))
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
print("examples", len(train), len(val), "device", torch.cuda.get_device_name(0) if DEVICE == "cuda" else "cpu")

tok = AutoTokenizer.from_pretrained(BASE)
if tok.pad_token is None:
    tok.pad_token = tok.eos_token
bnb = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4", bnb_4bit_use_double_quant=True,
                         bnb_4bit_compute_dtype=torch.float16)
if DRY:
    model = AutoModelForCausalLM.from_pretrained(BASE, dtype=torch.float32)
else:
    model = AutoModelForCausalLM.from_pretrained(BASE, quantization_config=bnb, dtype=torch.float16,
                                                 device_map={"": 0})
    model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=True)
lora = LoraConfig(r=16, lora_alpha=32, lora_dropout=0.05, bias="none", task_type="CAUSAL_LM",
                  target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"])

steps = len(train) // (4 * 4)
cfg = dict(output_dir=f"{OUT}/ckpt", per_device_train_batch_size=4, gradient_accumulation_steps=4,
           num_train_epochs=1, learning_rate=2e-4, warmup_steps=max(1, steps // 20), lr_scheduler_type="cosine",
           logging_steps=1 if DRY else 10, eval_strategy="epoch", save_strategy="no",
           optim="adamw_torch" if DRY else "paged_adamw_8bit", weight_decay=0.01, seed=26261, report_to="none",
           max_length=MAX_LEN, completion_only_loss=True, fp16=not DRY, bf16=False,
           gradient_checkpointing=True, max_grad_norm=1.0, **({"max_steps": 2} if DRY else {}))
# Library versions on the runner move; keep only arguments this SFTConfig accepts
accepted = inspect.signature(SFTConfig.__init__).parameters
print("dropping unsupported SFTConfig args:", [k for k in cfg if k not in accepted])
args = SFTConfig(**{k: v for k, v in cfg.items() if k in accepted})
trainer = SFTTrainer(model=model, processing_class=tok, train_dataset=train, eval_dataset=val, args=args,
                     peft_config=lora)
# The fp16 grad scaler needs fp32 trainable weights
for _, prm in trainer.model.named_parameters():
    if prm.requires_grad and prm.dtype != torch.float32:
        prm.data = prm.data.float()
print("trainable dtypes:", sorted({str(p.dtype) for p in trainer.model.parameters() if p.requires_grad}))

t0 = time.time()
res = trainer.train()
ev = trainer.evaluate()
log = {"base": BASE, "method": "QLoRA r16 (transformers+peft+bitsandbytes), fp16", "train_examples": len(train),
       "val_examples": len(val), "train_loss": res.training_loss, "eval": ev,
       "minutes": round((time.time() - t0) / 60, 1), "log_history": trainer.state.log_history}
json.dump(log, open(f"{OUT}/train_log.json", "w"), indent=2)
print(json.dumps({k: v for k, v in log.items() if k != "log_history"}, indent=2))

trainer.model.eval()
for i in range(3):
    ids = tok(val[i]["prompt"], return_tensors="pt").to(DEVICE)
    with torch.no_grad():
        out = trainer.model.generate(**ids, max_new_tokens=20 if DRY else 200, do_sample=False)
    print("GOT ", tok.decode(out[0][ids["input_ids"].shape[1]:], skip_special_tokens=True))
    print("WANT", val[i]["completion"])

adapter = f"{OUT}/adapter"
trainer.model.save_pretrained(adapter)
del trainer, model
torch.cuda.empty_cache()

# Merge the adapter into fp16 base weights, convert with llama.cpp, quantise if the tool builds
base = AutoModelForCausalLM.from_pretrained(BASE, dtype=torch.float16, device_map={"": "cpu"})
merged = PeftModel.from_pretrained(base, adapter).merge_and_unload()
merged.save_pretrained(f"{OUT}/merged", safe_serialization=True)
tok.save_pretrained(f"{OUT}/merged")
del base, merged

if not os.path.exists(f"{TMP}/llama.cpp"):
    subprocess.run(["git", "clone", "--depth", "1", "https://github.com/ggml-org/llama.cpp", f"{TMP}/llama.cpp"],
                   check=True)
subprocess.run([sys.executable, "-m", "pip", "install", "-q", "gguf", "sentencepiece", "protobuf"], check=True)
f16 = f"{OUT}/pramana-extract-f16.gguf"
subprocess.run([sys.executable, f"{TMP}/llama.cpp/convert_hf_to_gguf.py", f"{OUT}/merged", "--outtype", "f16",
                "--outfile", f16], check=True)
shutil.rmtree(f"{OUT}/merged", ignore_errors=True)
try:
    subprocess.run(["cmake", "-S", f"{TMP}/llama.cpp", "-B", f"{TMP}/llama.cpp/build", "-DGGML_CUDA=OFF",
                    "-DLLAMA_CURL=OFF"], check=True)
    subprocess.run(["cmake", "--build", f"{TMP}/llama.cpp/build", "--target", "llama-quantize", "-j", "4"], check=True)
    qbin = next(iter(glob.glob(f"{TMP}/llama.cpp/build/bin/**/llama-quantize*", recursive=True)))
    subprocess.run([qbin, f16, f"{OUT}/pramana-extract-q4_k_m.gguf", "Q4_K_M"], check=True)
    os.remove(f16)
except Exception as e:  # noqa: BLE001
    print("quantise step failed, keeping F16 GGUF:", e)
shutil.rmtree(f"{OUT}/ckpt", ignore_errors=True)
print("outputs:", sorted(os.listdir(OUT)))
