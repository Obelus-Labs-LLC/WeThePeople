-- Tenet-style duplicate-company merges, 2026-04-24.
-- Every pair was audited for dedupe_hash overlap first — all zero, so the
-- UPDATEs below cannot collide on UNIQUE(entity_id, dedupe_hash).
--
-- Canonical ID in each pair is the seed-file ID from
-- jobs/seed_tracked_companies.py. See the accompanying commit message
-- for the full rationale.

BEGIN;

-- ── TECH: 7 merges ─────────────────────────────────────────────────────

UPDATE sec_tech_filings         SET company_id='dell' WHERE company_id='dell-technologies';
UPDATE tech_patents             SET company_id='dell' WHERE company_id='dell-technologies';
UPDATE government_contracts     SET company_id='dell' WHERE company_id='dell-technologies';
UPDATE lobbying_records         SET company_id='dell' WHERE company_id='dell-technologies';
UPDATE ftc_enforcement_actions  SET company_id='dell' WHERE company_id='dell-technologies';
UPDATE company_donations        SET entity_id='dell'  WHERE entity_type='tech' AND entity_id='dell-technologies';
UPDATE stock_fundamentals       SET entity_id='dell'  WHERE entity_type='tech_company' AND entity_id='dell-technologies';
DELETE FROM tracked_tech_companies WHERE company_id='dell-technologies';

UPDATE sec_tech_filings         SET company_id='klac' WHERE company_id='kla-corp';
UPDATE tech_patents             SET company_id='klac' WHERE company_id='kla-corp';
UPDATE government_contracts     SET company_id='klac' WHERE company_id='kla-corp';
UPDATE lobbying_records         SET company_id='klac' WHERE company_id='kla-corp';
UPDATE ftc_enforcement_actions  SET company_id='klac' WHERE company_id='kla-corp';
UPDATE company_donations        SET entity_id='klac'  WHERE entity_type='tech' AND entity_id='kla-corp';
UPDATE stock_fundamentals       SET entity_id='klac'  WHERE entity_type='tech_company' AND entity_id='kla-corp';
DELETE FROM tracked_tech_companies WHERE company_id='kla-corp';

UPDATE sec_tech_filings         SET company_id='microchip' WHERE company_id='microchip-tech';
UPDATE tech_patents             SET company_id='microchip' WHERE company_id='microchip-tech';
UPDATE government_contracts     SET company_id='microchip' WHERE company_id='microchip-tech';
UPDATE lobbying_records         SET company_id='microchip' WHERE company_id='microchip-tech';
UPDATE ftc_enforcement_actions  SET company_id='microchip' WHERE company_id='microchip-tech';
UPDATE company_donations        SET entity_id='microchip'  WHERE entity_type='tech' AND entity_id='microchip-tech';
UPDATE stock_fundamentals       SET entity_id='microchip'  WHERE entity_type='tech_company' AND entity_id='microchip-tech';
DELETE FROM tracked_tech_companies WHERE company_id='microchip-tech';

UPDATE sec_tech_filings         SET company_id='arista' WHERE company_id='arista-networks';
UPDATE tech_patents             SET company_id='arista' WHERE company_id='arista-networks';
UPDATE government_contracts     SET company_id='arista' WHERE company_id='arista-networks';
UPDATE lobbying_records         SET company_id='arista' WHERE company_id='arista-networks';
UPDATE ftc_enforcement_actions  SET company_id='arista' WHERE company_id='arista-networks';
UPDATE company_donations        SET entity_id='arista'  WHERE entity_type='tech' AND entity_id='arista-networks';
UPDATE stock_fundamentals       SET entity_id='arista'  WHERE entity_type='tech_company' AND entity_id='arista-networks';
DELETE FROM tracked_tech_companies WHERE company_id='arista-networks';

UPDATE sec_tech_filings         SET company_id='palo-alto' WHERE company_id='palo-alto-networks';
UPDATE tech_patents             SET company_id='palo-alto' WHERE company_id='palo-alto-networks';
UPDATE government_contracts     SET company_id='palo-alto' WHERE company_id='palo-alto-networks';
UPDATE lobbying_records         SET company_id='palo-alto' WHERE company_id='palo-alto-networks';
UPDATE ftc_enforcement_actions  SET company_id='palo-alto' WHERE company_id='palo-alto-networks';
UPDATE company_donations        SET entity_id='palo-alto'  WHERE entity_type='tech' AND entity_id='palo-alto-networks';
UPDATE stock_fundamentals       SET entity_id='palo-alto'  WHERE entity_type='tech_company' AND entity_id='palo-alto-networks';
DELETE FROM tracked_tech_companies WHERE company_id='palo-alto-networks';

UPDATE sec_tech_filings         SET company_id='motorola' WHERE company_id='motorola-solutions';
UPDATE tech_patents             SET company_id='motorola' WHERE company_id='motorola-solutions';
UPDATE government_contracts     SET company_id='motorola' WHERE company_id='motorola-solutions';
UPDATE lobbying_records         SET company_id='motorola' WHERE company_id='motorola-solutions';
UPDATE ftc_enforcement_actions  SET company_id='motorola' WHERE company_id='motorola-solutions';
UPDATE company_donations        SET entity_id='motorola'  WHERE entity_type='tech' AND entity_id='motorola-solutions';
UPDATE stock_fundamentals       SET entity_id='motorola'  WHERE entity_type='tech_company' AND entity_id='motorola-solutions';
DELETE FROM tracked_tech_companies WHERE company_id='motorola-solutions';

UPDATE sec_tech_filings         SET company_id='zebra' WHERE company_id='zebra-technologies';
UPDATE tech_patents             SET company_id='zebra' WHERE company_id='zebra-technologies';
UPDATE government_contracts     SET company_id='zebra' WHERE company_id='zebra-technologies';
UPDATE lobbying_records         SET company_id='zebra' WHERE company_id='zebra-technologies';
UPDATE ftc_enforcement_actions  SET company_id='zebra' WHERE company_id='zebra-technologies';
UPDATE company_donations        SET entity_id='zebra'  WHERE entity_type='tech' AND entity_id='zebra-technologies';
UPDATE stock_fundamentals       SET entity_id='zebra'  WHERE entity_type='tech_company' AND entity_id='zebra-technologies';
DELETE FROM tracked_tech_companies WHERE company_id='zebra-technologies';

-- ── HEALTH: 2 merges ───────────────────────────────────────────────────

UPDATE fda_adverse_events          SET company_id='hca' WHERE company_id='hca-healthcare';
UPDATE fda_recalls                 SET company_id='hca' WHERE company_id='hca-healthcare';
UPDATE clinical_trials             SET company_id='hca' WHERE company_id='hca-healthcare';
UPDATE cms_payments                SET company_id='hca' WHERE company_id='hca-healthcare';
UPDATE sec_health_filings          SET company_id='hca' WHERE company_id='hca-healthcare';
UPDATE health_lobbying_records     SET company_id='hca' WHERE company_id='hca-healthcare';
UPDATE health_government_contracts SET company_id='hca' WHERE company_id='hca-healthcare';
UPDATE health_enforcement_actions  SET company_id='hca' WHERE company_id='hca-healthcare';
UPDATE company_donations           SET entity_id='hca'  WHERE entity_type='health' AND entity_id='hca-healthcare';
UPDATE stock_fundamentals          SET entity_id='hca'  WHERE entity_type='company' AND entity_id='hca-healthcare';
DELETE FROM tracked_companies WHERE company_id='hca-healthcare';

UPDATE fda_adverse_events          SET company_id='amerisourcebergen' WHERE company_id='cencora';
UPDATE fda_recalls                 SET company_id='amerisourcebergen' WHERE company_id='cencora';
UPDATE clinical_trials             SET company_id='amerisourcebergen' WHERE company_id='cencora';
UPDATE cms_payments                SET company_id='amerisourcebergen' WHERE company_id='cencora';
UPDATE sec_health_filings          SET company_id='amerisourcebergen' WHERE company_id='cencora';
UPDATE health_lobbying_records     SET company_id='amerisourcebergen' WHERE company_id='cencora';
UPDATE health_government_contracts SET company_id='amerisourcebergen' WHERE company_id='cencora';
UPDATE health_enforcement_actions  SET company_id='amerisourcebergen' WHERE company_id='cencora';
UPDATE company_donations           SET entity_id='amerisourcebergen'  WHERE entity_type='health' AND entity_id='cencora';
UPDATE stock_fundamentals          SET entity_id='amerisourcebergen'  WHERE entity_type='company' AND entity_id='cencora';
DELETE FROM tracked_companies WHERE company_id='cencora';

-- ── CHEMICALS: 2 merges ────────────────────────────────────────────────

UPDATE sec_chemical_filings          SET company_id='hb-fuller' WHERE company_id='h-b-fuller';
UPDATE chemical_lobbying_records     SET company_id='hb-fuller' WHERE company_id='h-b-fuller';
UPDATE chemical_government_contracts SET company_id='hb-fuller' WHERE company_id='h-b-fuller';
UPDATE chemical_enforcement_actions  SET company_id='hb-fuller' WHERE company_id='h-b-fuller';
UPDATE company_donations             SET entity_id='hb-fuller'  WHERE entity_type='chemicals' AND entity_id='h-b-fuller';
UPDATE stock_fundamentals            SET entity_id='hb-fuller'  WHERE entity_type='chemicals_company' AND entity_id='h-b-fuller';
DELETE FROM tracked_chemical_companies WHERE company_id='h-b-fuller';

UPDATE sec_chemical_filings          SET company_id='albemarle' WHERE company_id='albemarle-specialty';
UPDATE chemical_lobbying_records     SET company_id='albemarle' WHERE company_id='albemarle-specialty';
UPDATE chemical_government_contracts SET company_id='albemarle' WHERE company_id='albemarle-specialty';
UPDATE chemical_enforcement_actions  SET company_id='albemarle' WHERE company_id='albemarle-specialty';
UPDATE company_donations             SET entity_id='albemarle'  WHERE entity_type='chemicals' AND entity_id='albemarle-specialty';
UPDATE stock_fundamentals            SET entity_id='albemarle'  WHERE entity_type='chemicals_company' AND entity_id='albemarle-specialty';
DELETE FROM tracked_chemical_companies WHERE company_id='albemarle-specialty';

COMMIT;
