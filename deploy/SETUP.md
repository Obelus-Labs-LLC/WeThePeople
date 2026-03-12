# Deploying WeThePeople API with systemd

## Install the service

```bash
# Copy service file
sudo cp deploy/wethepeople.service /etc/systemd/system/

# Reload systemd, enable on boot, start
sudo systemctl daemon-reload
sudo systemctl enable wethepeople
sudo systemctl start wethepeople
```

## Common commands

```bash
sudo systemctl status wethepeople    # Check status
sudo systemctl restart wethepeople   # Restart after deploy
sudo journalctl -u wethepeople -f    # Tail logs
sudo journalctl -u wethepeople --since "1 hour ago"  # Recent logs
```

## Deploy workflow

```bash
# On the GCP VM:
cd ~/wethepeople-backend
git pull  # or scp new files
pip install -r requirements.txt
sudo systemctl restart wethepeople
```
