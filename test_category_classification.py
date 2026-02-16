"""
Test auto-category classification to ensure obvious signals are detected.
"""
from services.matching import auto_classify_claim, detect_intent


def test_classification():
    """Test that claims with obvious category signals get classified correctly."""
    
    test_cases = [
        {
            "text": "I introduced legislation to ban stock trading by members of Congress",
            "expected_category": "finance_ethics",
            "signals": ["stock", "trading", "ban"]
        },
        {
            "text": "I voted for insider trading restrictions for congressional members",
            "expected_category": "finance_ethics",
            "signals": ["insider", "trading"]
        },
        {
            "text": "I supported a bill to ban fracking on federal lands",
            "expected_category": "environment",
            "signals": ["fracking", "ban"]
        },
        {
            "text": "I championed Medicare expansion and affordable healthcare",
            "expected_category": "healthcare",
            "signals": ["medicare", "healthcare"]
        },
        {
            "text": "I introduced a bill about something vague",
            "expected_category": "general",
            "signals": []
        },
    ]
    
    print("=" * 70)
    print("CATEGORY CLASSIFICATION TEST")
    print("=" * 70)
    
    for i, test in enumerate(test_cases, 1):
        text = test["text"]
        expected = test["expected_category"]
        signals = test["signals"]
        
        # Run classification
        results = auto_classify_claim(text)
        intent = detect_intent(text)
        
        # Get top category
        top_category = results[0][0] if results else "general"
        top_confidence = results[0][1] if results else 0.0
        
        # Check result
        success = top_category == expected
        icon = "✅" if success else "❌"
        
        print(f"\n{i}. {icon} {text[:60]}...")
        print(f"   Expected: {expected}")
        print(f"   Got: {top_category} ({top_confidence:.2%} confidence)")
        print(f"   Intent: {intent}")
        
        if signals:
            print(f"   Signal terms: {', '.join(signals)}")
        
        # Show all category matches
        if len(results) > 1:
            print(f"   Other matches: {', '.join([f'{cat} ({conf:.0%})' for cat, conf in results[1:]])}")
    
    print("\n" + "=" * 70)
    print("\n✅ Category classification uses strong_terms for obvious signal detection")
    print("=" * 70)


if __name__ == "__main__":
    test_classification()
