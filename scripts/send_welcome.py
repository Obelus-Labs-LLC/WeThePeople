"""Send simple thank-you email to first subscriber."""
import os
import sys
import requests
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")

resend_key = os.getenv("RESEND_API_KEY")
if not resend_key:
    print("ERROR: RESEND_API_KEY not set")
    sys.exit(1)

html = """
<div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #F1F5F9; background: #0A0F1A;">
    <h2 style="color: #C5A044; margin-bottom: 24px;">WeThePeople</h2>
    <p>Hey John,</p>
    <p>You are literally our first subscriber outside of the team. That means a lot.</p>
    <p>We are building this platform to make corporate influence on government transparent and accessible to everyone. Your support early on helps us know we are on the right track.</p>
    <p>If there is anything you want to see built, any data you wish was easier to find, or any feedback at all, just reply to this email. I read everything.</p>
    <p style="margin-top: 24px;">Thanks for believing in what we are building.</p>
    <p>D'Shon Smith<br>Founder, WeThePeople<br><a href="https://wethepeopleforus.com" style="color: #C5A044;">wethepeopleforus.com</a></p>
</div>
"""

from services.email import RESEND_API_URL
r = requests.post(
    RESEND_API_URL,
    headers={"Authorization": f"Bearer {resend_key}", "Content-Type": "application/json"},
    json={
        "from": "WeThePeople <digest@wethepeopleforus.com>",
        "to": ["john.bojtos@gmail.com"],
        "subject": "You are subscriber #1",
        "html": html,
        "reply_to": "wethepeopleforus@gmail.com"
    }
)
print(f"Status: {r.status_code}")
print(f"Response: {r.text[:200]}")
