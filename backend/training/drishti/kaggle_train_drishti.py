"""QLoRA fine-tune of Qwen3-0.6B and Qwen3-1.7B (Apache-2.0) as pramana-drishti, Drishti's question model, on
Kaggle's two T4 GPUs.

Same recipe as training/kaggle_train.py (transformers + PEFT + bitsandbytes, fp16 compute, fp32 LoRA weights,
loss on the JSON answer only), which is proven on Kaggle's T4s. Input: train.jsonl, val.jsonl and test.jsonl from
training/drishti/generate_data.py attached as a Kaggle dataset.

The launcher installs the pinned libraries once, then trains each base model in its own process: on its own GPU
in parallel when two are visible, one after the other otherwise. Output in /kaggle/working/<tag>/: adapter/,
adapter_epoch1/ when there is more than one epoch, train_log.json with a quick intent check on held-out test
rows, and train.log. The adapters are merged and converted to GGUF on the laptop (training/merge_adapter.py).

The text format is written out by hand so it matches training/drishti/Modelfile exactly: system, user, then an
assistant turn with an empty think block.
"""

import glob
import inspect
import json
import os
import shutil
import subprocess
import sys
import time

# PRAMANA_DRYRUN=1 runs the same code paths on CPU with a tiny Qwen3 model and a few steps, to catch library and
# config errors locally before spending GPU time
DRY = os.environ.get("PRAMANA_DRYRUN") == "1"
OUT = os.environ.get("PRAMANA_OUT", "/kaggle/working")
# tag: (base model, epochs). The small model gets a second epoch in the time the large one needs for one; its
# epoch-1 adapter is kept, so the two can also be compared after the same number of epochs
MODELS = {"q06": ("Qwen/Qwen3-0.6B", 2), "q17": ("Qwen/Qwen3-1.7B", 1)}
# Versions the CPU dry run was checked with, pinned so a new release cannot change the run
PINS = ["peft==0.21.2", "trl==1.16.0", "transformers==5.20.2", "accelerate==1.15.0"]
MAX_LEN = 1536
QUICK_TEST = 8 if DRY else 240


def launch() -> None:
    if not DRY:
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", *PINS, "bitsandbytes==0.50.2"], check=False)
        # The image ships an old torchao that newer PEFT rejects when loading adapters; LoRA does not need it
        subprocess.run([sys.executable, "-m", "pip", "uninstall", "-y", "-q", "torchao"], check=False)
    import torch

    gpus = torch.cuda.device_count()
    print("gpus:", [torch.cuda.get_device_name(i) for i in range(gpus)])
    t0 = time.time()
    procs = []
    for i, tag in enumerate(MODELS):
        os.makedirs(f"{OUT}/{tag}", exist_ok=True)
        env = {**os.environ, "PRAMANA_DRISHTI_TAG": tag, "CUDA_VISIBLE_DEVICES": str(i % max(gpus, 1))}
        log = open(f"{OUT}/{tag}/train.log", "w", encoding="utf-8")
        p = subprocess.Popen([sys.executable, os.path.abspath(__file__)], env=env, stdout=log, stderr=subprocess.STDOUT)
        procs.append((tag, p, log))
        # With one GPU or none, train one model at a time
        if gpus < 2:
            p.wait()
    for tag, p, log in procs:
        p.wait()
        log.close()
        print(f"==== {tag}: exit {p.returncode}, {round((time.time() - t0) / 60, 1)} min since start")
        print(open(f"{OUT}/{tag}/train.log", encoding="utf-8").read()[-6000:])
    print("outputs:", {t: sorted(os.listdir(f"{OUT}/{t}")) for t in MODELS})


def train(tag: str) -> None:
    import peft
    import torch
    import transformers
    import trl
    from datasets import Dataset
    from peft import LoraConfig, prepare_model_for_kbit_training
    from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig, TrainerCallback
    from trl import SFTConfig, SFTTrainer

    base, epochs = MODELS[tag]
    base = "trl-internal-testing/tiny-Qwen3ForCausalLM" if DRY else base
    out = f"{OUT}/{tag}"
    data_dir = os.environ.get("PRAMANA_DATA") or os.path.dirname(
        next(iter(glob.glob("/kaggle/input/**/train.jsonl", recursive=True))))
    print("tag", tag, "base", base, "epochs", epochs, "versions: torch", torch.__version__, "transformers",
          transformers.__version__, "trl", trl.__version__, "peft", peft.__version__, flush=True)

    def to_pc(row):
        m = row["messages"]
        prompt = (f"<|im_start|>system\n{m[0]['content']}<|im_end|>\n<|im_start|>user\n{m[1]['content']}<|im_end|>\n"
                  "<|im_start|>assistant\n<think>\n\n</think>\n\n")
        return {"prompt": prompt, "completion": m[2]["content"] + "<|im_end|>"}

    def load(name):
        return [json.loads(x) for x in open(os.path.join(data_dir, name), encoding="utf-8")]

    train_rows, val_rows, test_rows = load("train.jsonl"), load("val.jsonl"), load("test.jsonl")
    train = Dataset.from_list([to_pc(r) for r in train_rows])
    val = Dataset.from_list([to_pc(r) for r in val_rows])
    if DRY:
        train, val = train.select(range(32)), val.select(range(8))
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print("examples", len(train), len(val), "device", torch.cuda.get_device_name(0) if device == "cuda" else "cpu")

    tok = AutoTokenizer.from_pretrained(base)
    if tok.pad_token is None:
        tok.pad_token = tok.eos_token
    lengths = [len(tok(p + c)["input_ids"]) for p, c in zip(train["prompt"], train["completion"], strict=True)]
    answer = [len(tok(c)["input_ids"]) for c in train["completion"]]
    print("tokens per example: max", max(lengths), "mean", round(sum(lengths) / len(lengths)), "over", MAX_LEN,
          sum(n > MAX_LEN for n in lengths), "| answer tokens: max", max(answer), "mean",
          round(sum(answer) / len(answer)), flush=True)
    if DRY:
        model = AutoModelForCausalLM.from_pretrained(base, dtype=torch.float32)
    else:
        bnb = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_quant_type="nf4", bnb_4bit_use_double_quant=True,
                                 bnb_4bit_compute_dtype=torch.float16)
        model = AutoModelForCausalLM.from_pretrained(base, quantization_config=bnb, dtype=torch.float16,
                                                     device_map={"": 0})
        model = prepare_model_for_kbit_training(model, use_gradient_checkpointing=True)
    lora = LoraConfig(r=16, lora_alpha=32, lora_dropout=0.05, bias="none", task_type="CAUSAL_LM",
                      target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"])

    steps = epochs * (len(train) // (4 * 4))
    cfg = dict(output_dir=f"{out}/ckpt", per_device_train_batch_size=4, gradient_accumulation_steps=4,
               num_train_epochs=epochs, learning_rate=2e-4, warmup_steps=max(1, steps // 20),
               lr_scheduler_type="cosine", logging_steps=1 if DRY else 10, eval_strategy="epoch", save_strategy="no",
               optim="adamw_torch" if DRY else "paged_adamw_8bit", weight_decay=0.01, seed=26261, report_to="none",
               max_length=MAX_LEN, completion_only_loss=True, fp16=not DRY, bf16=False, gradient_checkpointing=True,
               max_grad_norm=1.0, disable_tqdm=True)
    # Library versions on the runner move; keep only arguments this SFTConfig accepts
    accepted = inspect.signature(SFTConfig.__init__).parameters
    print("dropping unsupported SFTConfig args:", [k for k in cfg if k not in accepted])
    args = SFTConfig(**{k: v for k, v in cfg.items() if k in accepted})

    class SaveEachEpoch(TrainerCallback):
        """Keep the adapter after every epoch but the last, so an earlier epoch can be evaluated later."""

        def on_epoch_end(self, args, state, control, model=None, **kwargs):
            epoch = round(state.epoch or 0)
            if model is not None and epoch < epochs:
                model.save_pretrained(f"{out}/adapter_epoch{epoch}")
                print(f"saved adapter_epoch{epoch} at step {state.global_step}, "
                      f"{round((time.time() - t0) / 60, 1)} min", flush=True)

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
    minutes = round((time.time() - t0) / 60, 1)
    trainer.model.save_pretrained(f"{out}/adapter")
    log = {"tag": tag, "base": base, "method": "QLoRA r16 (transformers+peft+bitsandbytes), fp16", "epochs": epochs,
           "train_examples": len(train), "val_examples": len(val), "train_loss": res.training_loss, "eval": ev,
           "eval_loss_per_epoch": [h["eval_loss"] for h in trainer.state.log_history if "eval_loss" in h][:epochs],
           "minutes": minutes, "tokens_per_example_mean": round(sum(lengths) / len(lengths)),
           "log_history": trainer.state.log_history}
    json.dump(log, open(f"{out}/train_log.json", "w"), indent=2)
    print(json.dumps({k: v for k, v in log.items() if k != "log_history"}, indent=2), flush=True)

    # A quick check of the intent on held-out test rows with plain greedy decoding (no schema constraint); the
    # real evaluation runs through Ollama on the laptop
    try:
        trainer.model.eval()
        tok.padding_side = "left"
        rows = test_rows[:QUICK_TEST]
        hits, valid, shown = 0, 0, 0
        for i in range(0, len(rows), 16):
            batch = [to_pc(r)["prompt"] for r in rows[i:i + 16]]
            enc = tok(batch, return_tensors="pt", padding=True).to(device)
            with torch.no_grad():
                gen = trainer.model.generate(**enc, max_new_tokens=8 if DRY else 160, do_sample=False,
                                             pad_token_id=tok.pad_token_id, use_cache=True)
            for r, g in zip(rows[i:i + 16], gen, strict=True):
                text = tok.decode(g[enc["input_ids"].shape[1]:], skip_special_tokens=True).strip()
                want = json.loads(r["messages"][2]["content"])
                try:
                    got = json.loads(text)
                    valid += 1
                    hits += got.get("intent") == want["intent"]
                except ValueError:
                    got = None
                if shown < 4:
                    print("GOT ", text, "\nWANT", r["messages"][2]["content"])
                    shown += 1
        log["quick_test"] = {"rows": len(rows), "valid_json": valid, "intent_correct": hits}
        json.dump(log, open(f"{out}/train_log.json", "w"), indent=2)
        print("quick test:", log["quick_test"], flush=True)
    except Exception as e:
        print("quick test failed:", type(e).__name__, e)
    shutil.rmtree(f"{out}/ckpt", ignore_errors=True)


if __name__ == "__main__":
    tag = os.environ.get("PRAMANA_DRISHTI_TAG")
    if tag:
        train(tag)
    else:
        launch()
