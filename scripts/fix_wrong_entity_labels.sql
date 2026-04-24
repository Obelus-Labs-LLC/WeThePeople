-- 2026-04-24: fix rows where display_name / ticker / CIK don't match
-- the company_id the row is stored under. All three rows were
-- originally created by the bulk seed script with incorrect data —
-- display_name was never verified against the sector category.
--
-- 1. ppg-industries: row holds PPL Corporation (utility). PPG is a
--    paint/coatings chemical company; PPL is an electric utility.
--    No real PPG data ever got ingested — the row is pure mis-label.
--    Delete rather than remap: PPL belongs in the energy sector, not
--    chemicals, so a rename-in-place would still be wrong.
--
-- 2. chemtura: Chemtura was acquired by Lanxess AG in 2017 and no
--    longer exists as a separate entity. The row's display_name is
--    already "Lanxess AG" with Lanxess's CIK — the company_id is the
--    only stale bit. Rename company_id chemtura -> lanxess and remap
--    every child FK.
--
-- 3. v2x-defense: display_name is "Saab Inc." with
--    usaspending_recipient_name="SAAB INC". The real V2X is already
--    tracked as `vectrus` (seed canonical, CIK 0001601548). This row
--    is actually Saab Defense USA. Rename company_id -> saab.

BEGIN;

-- ── 1. Delete mis-categorized PPL row from chemicals ────────────────
DELETE FROM chemical_lobbying_records     WHERE company_id = 'ppg-industries';
DELETE FROM chemical_government_contracts WHERE company_id = 'ppg-industries';
DELETE FROM chemical_enforcement_actions  WHERE company_id = 'ppg-industries';
DELETE FROM sec_chemical_filings          WHERE company_id = 'ppg-industries';
DELETE FROM company_donations             WHERE entity_type = 'chemicals' AND entity_id = 'ppg-industries';
DELETE FROM stock_fundamentals            WHERE entity_type = 'chemicals_company' AND entity_id = 'ppg-industries';
DELETE FROM tracked_chemical_companies    WHERE company_id = 'ppg-industries';

-- ── 2. Rename chemtura -> lanxess ──────────────────────────────────
UPDATE sec_chemical_filings             SET company_id = 'lanxess' WHERE company_id = 'chemtura';
UPDATE chemical_lobbying_records        SET company_id = 'lanxess' WHERE company_id = 'chemtura';
UPDATE chemical_government_contracts    SET company_id = 'lanxess' WHERE company_id = 'chemtura';
UPDATE chemical_enforcement_actions     SET company_id = 'lanxess' WHERE company_id = 'chemtura';
UPDATE company_donations                SET entity_id  = 'lanxess' WHERE entity_type = 'chemicals' AND entity_id = 'chemtura';
UPDATE stock_fundamentals               SET entity_id  = 'lanxess' WHERE entity_type = 'chemicals_company' AND entity_id = 'chemtura';
UPDATE tracked_chemical_companies       SET company_id = 'lanxess' WHERE company_id = 'chemtura';

-- ── 3. Rename v2x-defense -> saab ──────────────────────────────────
UPDATE sec_defense_filings              SET company_id = 'saab' WHERE company_id = 'v2x-defense';
UPDATE defense_lobbying_records         SET company_id = 'saab' WHERE company_id = 'v2x-defense';
UPDATE defense_government_contracts     SET company_id = 'saab' WHERE company_id = 'v2x-defense';
UPDATE defense_enforcement_actions      SET company_id = 'saab' WHERE company_id = 'v2x-defense';
UPDATE company_donations                SET entity_id  = 'saab' WHERE entity_type = 'defense' AND entity_id = 'v2x-defense';
UPDATE stock_fundamentals               SET entity_id  = 'saab' WHERE entity_type = 'defense_company' AND entity_id = 'v2x-defense';
UPDATE tracked_defense_companies        SET company_id = 'saab' WHERE company_id = 'v2x-defense';

COMMIT;
