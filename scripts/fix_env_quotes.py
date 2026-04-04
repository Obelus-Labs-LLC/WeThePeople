"""Fix .env prompt values by wrapping them in single quotes for shell compatibility."""
import sys
from pathlib import Path

env_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/home/dshon/wethepeople-backend/.env")

with open(env_path, "r") as f:
    lines = f.readlines()

fixed = []
count = 0
for line in lines:
    stripped = line.strip()
    if "PROMPT=" in stripped and not stripped.startswith("#"):
        eq_idx = line.index("=")
        key = line[:eq_idx]
        value = line[eq_idx + 1:].strip()
        # Remove existing quotes
        for q in ['"', "'"]:
            if value.startswith(q) and value.endswith(q):
                value = value[1:-1]
        # Escape single quotes within value
        value = value.replace("'", "'\"'\"'")
        fixed.append(f"{key}='{value}'\n")
        count += 1
    else:
        fixed.append(line)

with open(env_path, "w") as f:
    f.writelines(fixed)

print(f"Fixed {count} prompt lines in {env_path}")
