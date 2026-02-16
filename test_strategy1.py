import requests
from bs4 import BeautifulSoup
import re

url = 'https://www.warren.senate.gov/newsroom/press-releases/warren-blumenthal-goldman-and-27-members-of-congress-urge-agency-watchdogs-to-investigate-trump-administrations-retreat-from-white-collar-crime-enforcement'
r = requests.get(url, timeout=10)
soup = BeautifulSoup(r.content, 'html.parser')

# Remove unwanted
for tag in soup(['script', 'style', 'nav', 'footer', 'header', 'aside', 'form', 'button']):
    tag.decompose()

print("=== Strategy 1: Find main content container ===")

main = soup.find('main')
print(f"<main> tag: {main is not None}")

article = soup.find('article')
print(f"<article> tag: {article is not None}")

content_div = soup.find('div', class_=re.compile(r'content|article|post|body|press-release'))
print(f"<div class='content|article|post|body|press-release'> : {content_div is not None}")

if content_div:
    print(f"\nFound div with class: {content_div.get('class')}")
    text = content_div.get_text(separator=' ', strip=True)
    print(f"Text length: {len(text)}")
    print(f"Text preview: {text[:300]}")
    print(f"\nThis is > 200 chars so Strategy 1 returns this!")
