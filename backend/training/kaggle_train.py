"""QLoRA fine-tune of Qwen3-1.7B (Apache-2.0) as Pramana's grounded field extractor, for a Kaggle T4 GPU.

Uses plain transformers + PEFT + bitsandbytes (fp16 compute, fp32 LoRA weights), which behave predictably
on T4s that lack bf16. Input: train.jsonl and val.jsonl from training/make_dataset.py attached as a Kaggle
dataset. Output in /kaggle/working: adapter/ (final LoRA weights), adapter_epoch1/ and train_log.json.

The adapter is merged and converted to GGUF on the laptop with training/merge_adapter.py, because the
runner's library set broke the merge step in version 1.

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

# PRAMANA_DRYRUN=1 runs the same code path on CPU with a tiny Qwen3 model and a few steps over two epochs,
# to catch library and config errors locally before spending GPU time
DRY = os.environ.get("PRAMANA_DRYRUN") == "1"
# One process, one GPU: SFTTrainer refuses nn.DataParallel when two T4s are visible
os.environ["CUDA_VISIBLE_DEVICES"] = "0"
# Versions the CPU dry run was checked with, pinned so a new release cannot change the run
PINS = ["peft==0.21.2", "trl==1.16.0", "transformers==5.20.2", "accelerate==1.15.0"]
if not DRY:
    subprocess.run([sys.executable, "-m", "pip", "install", "-q", *PINS, "bitsandbytes==0.50.2"], check=False)
    # The image ships an old torchao that newer PEFT rejects when loading adapters; LoRA does not need it
    subprocess.run([sys.executable, "-m", "pip", "uninstall", "-y", "-q", "torchao"], check=False)

import peft  # noqa: E402
import torch  # noqa: E402
import transformers  # noqa: E402
import trl  # noqa: E402
from datasets import Dataset  # noqa: E402
from peft import LoraConfig, prepare_model_for_kbit_training  # noqa: E402
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig, TrainerCallback  # noqa: E402
from trl import SFTConfig, SFTTrainer  # noqa: E402

BASE = "trl-internal-testing/tiny-Qwen3ForCausalLM" if DRY else "Qwen/Qwen3-1.7B"
MAX_LEN = 1536
EPOCHS = 2
OUT = os.environ.get("PRAMANA_OUT", "/kaggle/working")
data_dir = os.environ.get("PRAMANA_DATA") or os.path.dirname(
    next(iter(glob.glob("/kaggle/input/**/train.jsonl", recursive=True))))
print("versions: torch", torch.__version__, "transformers", transformers.__version__, "trl", trl.__version__,
      "peft", peft.__version__)


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
lengths = [len(tok(p + c)["input_ids"]) for p, c in zip(train["prompt"], train["completion"], strict=True)]
print("tokens per example: max", max(lengths), "mean", round(sum(lengths) / len(lengths)), "over", MAX_LEN,
      sum(n > MAX_LEN for n in lengths))
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

steps = EPOCHS * (len(train) // (4 * 4))
cfg = dict(output_dir=f"{OUT}/ckpt", per_device_train_batch_size=4, gradient_accumulation_steps=4,
           num_train_epochs=EPOCHS, learning_rate=2e-4, warmup_steps=max(1, steps // 20), lr_scheduler_type="cosine",
           logging_steps=1 if DRY else 10, eval_strategy="epoch", save_strategy="no",
           optim="adamw_torch" if DRY else "paged_adamw_8bit", weight_decay=0.01, seed=26261, report_to="none",
           max_length=MAX_LEN, completion_only_loss=True, fp16=not DRY, bf16=False,
           gradient_checkpointing=True, max_grad_norm=1.0)
# Library versions on the runner move; keep only arguments this SFTConfig accepts
accepted = inspect.signature(SFTConfig.__init__).parameters
print("dropping unsupported SFTConfig args:", [k for k in cfg if k not in accepted])
args = SFTConfig(**{k: v for k, v in cfg.items() if k in accepted})


class SaveEachEpoch(TrainerCallback):
    """Keep the adapter after every epoch but the last, so an earlier epoch can be inspected later."""

    def on_epoch_end(self, args, state, control, model=None, **kwargs):
        epoch = round(state.epoch or 0)
        if model is not None and epoch < EPOCHS:
            model.save_pretrained(f"{OUT}/adapter_epoch{epoch}")
            print(f"saved adapter_epoch{epoch} at step {state.global_step}, {round((time.time() - t0) / 60, 1)} min")


trainer = SFTTrainer(model=model, processing_class=tok, train_dataset=train, eval_dataset=val, args=args,
                     peft_config=lora, callbacks=[SaveEachEpoch()])
# The fp16 grad scaler needs fp32 trainable weights
for _, prm in trainer.model.named_parameters():
    if prm.requires_grad and prm.dtype != torch.float32:
        prm.data = prm.data.float()
print("trainable dtypes:", sorted({str(p.dtype) for p in trainer.model.parameters() if p.requires_grad}))

t0 = time.time()
res = trainer.train()
ev = trainer.evaluate()
log = {"base": BASE, "method": "QLoRA r16 (transformers+peft+bitsandbytes), fp16", "epochs": EPOCHS,
       "train_examples": len(train), "val_examples": len(val), "train_loss": res.training_loss, "eval": ev,
       "eval_loss_per_epoch": [h["eval_loss"] for h in trainer.state.log_history if "eval_loss" in h][:EPOCHS],
       "minutes": round((time.time() - t0) / 60, 1), "log_history": trainer.state.log_history}
adapter = f"{OUT}/adapter"
trainer.model.save_pretrained(adapter)
json.dump(log, open(f"{OUT}/train_log.json", "w"), indent=2)
print(json.dumps({k: v for k, v in log.items() if k != "log_history"}, indent=2))

trainer.model.eval()
for i in range(3):
    ids = tok(val[i]["prompt"], return_tensors="pt").to(DEVICE)
    with torch.no_grad():
        out = trainer.model.generate(**ids, max_new_tokens=20 if DRY else 300, do_sample=False)
    print("GOT ", tok.decode(out[0][ids["input_ids"].shape[1]:], skip_special_tokens=True))
    print("WANT", val[i]["completion"])
shutil.rmtree(f"{OUT}/ckpt", ignore_errors=True)
print("outputs:", sorted(os.listdir(OUT)))
