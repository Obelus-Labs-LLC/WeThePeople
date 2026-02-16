"""
Canonical Text Extraction Module

Single source of truth for HTML text extraction.
Multi-strategy approach to handle different site structures.

Usage:
    from services.extraction.extract_main_text import extract_main_text
    
    soup = BeautifulSoup(html, 'html.parser')
    text = extract_main_text(soup)
"""

import re
from bs4 import BeautifulSoup


def extract_main_text(soup: BeautifulSoup) -> str:
    """
    Extract main text content from HTML.
    Multi-strategy approach to handle different site structures.
    
    Strategies (in order):
    1. Find semantic containers (main, article, .press-release)
    2. Collect substantial paragraphs (>50 chars)
    3. Fallback to body text
    
    Args:
        soup: BeautifulSoup parsed HTML
        
    Returns:
        Extracted text content
    """
    # Remove unwanted tags (including modals which often contain nav menus)
    for tag in soup(['script', 'style', 'nav', 'footer', 'header', 'aside', 'form', 'button']):
        tag.decompose()
    
    # Remove modals specifically (they often match "content" patterns but contain nav/menus)
    for modal in soup.find_all('div', class_=re.compile(r'modal')):
        modal.decompose()
    
    # Strategy 1: Find main content container
    main = soup.find('main') or soup.find('article') or soup.find('div', class_=re.compile(r'article|post|body|press-release'))
    if main:
        text = main.get_text(separator=' ', strip=True)
        if len(text) > 500:  # Increased threshold to avoid nav menus
            return text
    
    # Strategy 2: Collect paragraphs with substantial content (fallback for sites without semantic HTML)
    paragraphs = soup.find_all('p')
    substantial_paragraphs = [p.get_text(strip=True) for p in paragraphs if len(p.get_text(strip=True)) > 50]
    if substantial_paragraphs:
        return ' '.join(substantial_paragraphs)
    
    # Strategy 3: Last resort - body text (usually too noisy)
    body = soup.find('body')
    if body:
        return body.get_text(separator=' ', strip=True)
    
    return soup.get_text(separator=' ', strip=True)
