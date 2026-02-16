import requests
from bs4 import BeautifulSoup

r = requests.get('https://www.schumer.senate.gov/newsroom/press-releases')
soup = BeautifulSoup(r.content, 'html.parser')

print("=== Form elements ===")
for form in soup.find_all('form'):
    print(f"Form: {form.get('action', 'no action')}")
    for inp in form.find_all(['input', 'select']):
        print(f"  {inp.name}: {inp.get('name', 'unnamed')}")

print("\n=== Select dropdowns ===")
for sel in soup.find_all('select'):
    print(f"Select: {sel.get('name', 'unnamed')}")
    for opt in sel.find_all('option'):
        if opt.text.strip():
            print(f"  - {opt.text.strip()}: {opt.get('value')}")
