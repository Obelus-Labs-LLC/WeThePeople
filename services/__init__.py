"""
WeThePeople Services Layer

Organized into four bounded contexts (see ARCHITECTURE.md for full details):

1. Influence  — Network graph, closed-loop detection, money flow
   Files: influence_network.py, closed_loop_detection.py, enrichment/

2. Verification — Claims pipeline, evidence, extraction, LLM
   Files: claims/, evidence/, extraction/, llm/

3. Sync — Data pipeline coordination, circuit breakers, rate limiting
   Files: circuit_breaker.py, budget.py, bill_text.py, rate_limit.py,
          rate_limit_store.py, data_retention.py
   Related: connectors/, jobs/

4. Auth — JWT, RBAC, audit trail, API key management
   Files: auth.py, jwt_auth.py, rbac.py, audit.py
"""
