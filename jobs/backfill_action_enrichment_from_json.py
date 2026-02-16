import json
import sqlite3
from typing import Any, Dict, Optional

DB_PATH = "wethepeople.db"


def extract_enriched(meta: Any) -> Dict[str, Optional[str]]:
    """
    Your metadata_json shape (based on earlier code) usually looks like:
    {
      "enriched": {
        "policy_area": "...",
        "latest_action": {"text": "...", "action_date": "..."},
        ...
      }
    }
    OR it might be flat with camelCase:
    {
      "policyArea": {"name": "..."},
      "latestAction": {"text": "...", "actionDate": "..."},
      ...
    }
    We handle both variations safely.
    """
    if not meta:
        return {"policy_area": None, "latest_action_text": None, "latest_action_date": None}

    if isinstance(meta, str):
        try:
            meta = json.loads(meta)
        except Exception:
            return {"policy_area": None, "latest_action_text": None, "latest_action_date": None}

    if not isinstance(meta, dict):
        return {"policy_area": None, "latest_action_text": None, "latest_action_date": None}

    # Try enriched wrapper first
    enriched = meta.get("enriched") if isinstance(meta.get("enriched"), dict) else None
    
    if enriched:
        # Enriched structure (snake_case)
        policy_area = enriched.get("policy_area")
        latest_action = enriched.get("latest_action") if isinstance(enriched.get("latest_action"), dict) else {}
        latest_action_text = latest_action.get("text") or latest_action.get("action_text") or latest_action.get("description")
        latest_action_date = latest_action.get("action_date") or latest_action.get("date")
    else:
        # Flat structure (camelCase from Congress API)
        policy_area_obj = meta.get("policyArea")
        policy_area = policy_area_obj.get("name") if isinstance(policy_area_obj, dict) else None
        
        latest_action = meta.get("latestAction") if isinstance(meta.get("latestAction"), dict) else {}
        latest_action_text = latest_action.get("text")
        latest_action_date = latest_action.get("actionDate")

    return {
        "policy_area": policy_area,
        "latest_action_text": latest_action_text,
        "latest_action_date": latest_action_date,
    }


def main():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    rows = cur.execute("SELECT id, metadata_json FROM actions").fetchall()
    updated = 0

    for action_id, meta in rows:
        data = extract_enriched(meta)

        if not (data["policy_area"] or data["latest_action_text"] or data["latest_action_date"]):
            continue

        cur.execute(
            """
            UPDATE actions
            SET policy_area = ?, latest_action_text = ?, latest_action_date = ?
            WHERE id = ?
            """,
            (data["policy_area"], data["latest_action_text"], data["latest_action_date"], action_id),
        )
        updated += 1

    conn.commit()
    conn.close()

    print(f"Backfill complete. Updated {updated} actions.")


if __name__ == "__main__":
    main()
