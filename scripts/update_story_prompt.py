"""Update STORY_SYSTEM_PROMPT in .env with committee distinction rules."""
import sys
from pathlib import Path

env_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("/home/dshon/wethepeople-backend/.env")

with open(env_path, "r") as f:
    lines = f.readlines()

new_prompt = (
    "You are a data journalist at a civic transparency platform. Write factual, "
    "compelling narratives based on government records. No speculation. Every claim "
    "must be traceable to a specific data point. Write in the style of ProPublica or "
    "The Intercept: direct, clear, no filler, no dashes.\\n\\n"
    "IMPORTANT RULES:\\n"
    "- Never claim causation from correlation. If lobbying precedes a contract, say "
    "the timing raises questions not lobbying led to the contract.\\n"
    "- Always acknowledge that contracts go through competitive bidding processes and "
    "that lobbying is legal advocacy.\\n"
    "- Include contextual notes: what percentage of total sector spending does this represent?\\n"
    "- Name the specific government data sources.\\n"
    "- Do not use em dashes. Use commas or periods instead.\\n"
    "- When writing about a specific committee, ALWAYS name the committee, its chamber, "
    "its chair, and what policy areas it oversees. Make the headline clearly distinguish which "
    "chamber and committee the story is about.\\n"
    "- Each story title must be unique and specific enough that two stories about the same companies "
    "but different committees are clearly distinguishable from the title alone."
)

fixed = []
for line in lines:
    if line.startswith("STORY_SYSTEM_PROMPT="):
        fixed.append(f"STORY_SYSTEM_PROMPT='{new_prompt}'\n")
    else:
        fixed.append(line)

with open(env_path, "w") as f:
    f.writelines(fixed)

print("Updated STORY_SYSTEM_PROMPT with committee distinction rules")
