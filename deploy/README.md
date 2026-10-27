# Public demo deployment

One Azure VM (Ubuntu 24.04, 2 vCPU, 4 GB) serves the demo over HTTPS at `https://<label>.<region>.cloudapp.azure.com`.
The only language model on the server is Drishti's question model (`pramana-drishti-0.6b`, about 0.9 GB in memory,
kept loaded and warmed after every reset). On this VM it read 166 of 167 hand-written questions correctly, in 1.65 s
median and 2.27 s at the 90th percentile (`training/drishti/eval_drishti.py --cpu --threads 2`). Everything else is
lite mode: the fields our fine-tuned extraction model reads are produced on a machine with that model and shipped in
the demo snapshot, and Ask why answers from its evidence templates.

To install the question model, copy `Modelfile` and the GGUF from `training/drishti` output to the VM and run setup
with `DRISHTI_MODEL_DIR=<that folder>`. Without it Drishti answers from its rules alone.

| File | Purpose |
|---|---|
| `azure/main.bicep` | VM, public IP with a DNS label, network and firewall (HTTPS from anywhere, SSH from one address) |
| `make_snapshot.py` | Builds the demo data for the public address with the model, and packs it |
| `server/setup.sh` | Installs the app, models, Caddy for HTTPS, the service and the nightly reset |
| `server/reset.sh` | Restores the snapshot; `pramana-reset.timer` runs it every night at 03:00 IST |

## Steps

```bash
# 1. Infrastructure (Azure CLI, signed in)
az group create -n pramana-demo-rg -l indiasouthcentral
az deployment group create -g pramana-demo-rg -f deploy/azure/main.bicep \
  -p sshPublicKey="$(cat ~/.ssh/pramana_azure.pub)" sshSourceCidr=<your ip>/32

# 2. Demo data, in a spare checkout with Ollama serving pramana-extract-v2
backend/.venv/Scripts/python deploy/make_snapshot.py https://pramana-demo.indiasouthcentral.cloudapp.azure.com snapshot.tar.gz

# 3. Server
scp -i ~/.ssh/pramana_azure snapshot.tar.gz deploy/server/* pramana@<host>:/tmp/pramana-deploy/
ssh -i ~/.ssh/pramana_azure pramana@<host> "sudo bash /tmp/pramana-deploy/setup.sh <host> /tmp/pramana-deploy/snapshot.tar.gz"
```

To update the app later: `ssh ... "cd /opt/pramana && sudo -u pramana git pull"`, rebuild the UI if it changed, then
`sudo systemctl restart pramana`. To change the demo data, build a new snapshot, copy it to
`/opt/pramana-snapshot/snapshot.tar.gz` and run `sudo pramana-reset`.

## Public-demo settings

- The demo password is shown on the sign-in page, so anyone with the link can change data. The nightly reset undoes it.
- Wrong passwords no longer lock a demo account; the per-address sign-in limit still applies.
- Session cookies are `__Host-` and HTTPS-only, with HSTS.
- Uploaded files are parsed in the sandbox with the usual size and page limits.
