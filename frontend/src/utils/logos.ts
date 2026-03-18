/**
 * Shared logo utility — tries multiple sources in order:
 * 1. Local file in /public/logos/{id}.png
 * 2. logo_url from API
 * 3. Clearbit Logo API (free, no key required)
 * 4. Returns empty string (caller shows initials)
 */

/** Known company domains for Clearbit fallback */
const COMPANY_DOMAINS: Record<string, string> = {
  // Finance
  'jpmorgan': 'jpmorganchase.com',
  'goldman-sachs': 'goldmansachs.com',
  'morgan-stanley': 'morganstanley.com',
  'bank-of-america': 'bankofamerica.com',
  'wells-fargo': 'wellsfargo.com',
  'citigroup': 'citigroup.com',
  'blackrock': 'blackrock.com',
  'capital-one': 'capitalone.com',
  'charles-schwab': 'schwab.com',
  'american-express': 'americanexpress.com',
  'mastercard': 'mastercard.com',
  'visa': 'visa.com',
  'paypal': 'paypal.com',
  'robinhood': 'robinhood.com',
  'sofi': 'sofi.com',
  'coinbase': 'coinbase.com',
  'fiserv': 'fiserv.com',
  'discover': 'discover.com',
  'allstate': 'allstate.com',
  'progressive': 'progressive.com',
  'metlife': 'metlife.com',
  'prudential': 'prudential.com',
  'chubb': 'chubb.com',
  'aig': 'aig.com',
  'aflac': 'aflac.com',
  'travelers': 'travelers.com',
  'us-bancorp': 'usbank.com',
  'td-bank': 'td.com',
  'fifth-third': '53.com',
  'pnc': 'pnc.com',
  'truist': 'truist.com',
  'citizens': 'citizensbank.com',
  'regions': 'regions.com',
  'keycorp': 'key.com',
  'huntington': 'huntington.com',
  'mandt': 'mtb.com',
  'state-street': 'statestreet.com',
  'northern-trust': 'northerntrust.com',
  'bny-mellon': 'bnymellon.com',
  'raymond-james': 'raymondjames.com',
  'interactive-brokers': 'interactivebrokers.com',
  'block': 'block.xyz',
  'berkshire-hathaway': 'berkshirehathaway.com',
  'lincoln-national': 'lincolnfinancial.com',
  'nasdaq-inc': 'nasdaq.com',
  'invesco': 'invesco.com',
  // Tech
  'apple': 'apple.com',
  'microsoft': 'microsoft.com',
  'alphabet': 'google.com',
  'amazon': 'amazon.com',
  'meta': 'meta.com',
  'nvidia': 'nvidia.com',
  'tesla': 'tesla.com',
  'netflix': 'netflix.com',
  'adobe': 'adobe.com',
  'salesforce': 'salesforce.com',
  'oracle': 'oracle.com',
  'ibm': 'ibm.com',
  'intel': 'intel.com',
  'cisco': 'cisco.com',
  'uber': 'uber.com',
  'lyft': 'lyft.com',
  'airbnb': 'airbnb.com',
  'spotify': 'spotify.com',
  'snap': 'snap.com',
  'pinterest': 'pinterest.com',
  'roblox': 'roblox.com',
  'palantir': 'palantir.com',
  'snowflake': 'snowflake.com',
  'cloudflare': 'cloudflare.com',
  'crowdstrike': 'crowdstrike.com',
  'datadog': 'datadoghq.com',
  'mongodb': 'mongodb.com',
  'twilio': 'twilio.com',
  'okta': 'okta.com',
  'hubspot': 'hubspot.com',
  'servicenow': 'servicenow.com',
  'workday': 'workday.com',
  'dell-technologies': 'dell.com',
  'broadcom': 'broadcom.com',
  'qualcomm': 'qualcomm.com',
  'amd': 'amd.com',
  'texas-instruments': 'ti.com',
  'rivian': 'rivian.com',
  'roku': 'roku.com',
  'doordash': 'doordash.com',
  'etsy': 'etsy.com',
  'unity': 'unity.com',
  'gitlab': 'gitlab.com',
  'fortinet': 'fortinet.com',
  'palo-alto-networks': 'paloaltonetworks.com',
  'zscaler': 'zscaler.com',
  // Health
  'pfizer': 'pfizer.com',
  'johnson-johnson': 'jnj.com',
  'unitedhealth': 'unitedhealthgroup.com',
  'eli-lilly': 'lilly.com',
  'abbvie': 'abbvie.com',
  'merck': 'merck.com',
  'amgen': 'amgen.com',
  'gilead': 'gilead.com',
  'moderna': 'modernatx.com',
  'regeneron': 'regeneron.com',
  'biogen': 'biogen.com',
  'vertex': 'vrtx.com',
  'bristol-myers-squibb': 'bms.com',
  'astrazeneca': 'astrazeneca.com',
  'novo-nordisk': 'novonordisk.com',
  'sanofi': 'sanofi.com',
  'gsk': 'gsk.com',
  'teva': 'tevapharm.com',
  'medtronic': 'medtronic.com',
  'stryker': 'stryker.com',
  'boston-scientific': 'bostonscientific.com',
  'becton-dickinson': 'bd.com',
  'baxter': 'baxter.com',
  'cvs-health': 'cvshealth.com',
  'cigna': 'cigna.com',
  'humana': 'humana.com',
  'centene': 'centene.com',
  'elevance': 'elevancehealth.com',
  'mckesson': 'mckesson.com',
  'cardinal-health': 'cardinalhealth.com',
  'hca-healthcare': 'hcahealthcare.com',
  'davita': 'davita.com',
  // Energy
  'exxonmobil': 'exxonmobil.com',
  'chevron': 'chevron.com',
  'conocophillips': 'conocophillips.com',
  'shell': 'shell.com',
  'bp': 'bp.com',
  'totalenergies': 'totalenergies.com',
  'marathon-petroleum': 'marathonpetroleum.com',
  'valero': 'valero.com',
  'phillips-66': 'phillips66.com',
  'hess': 'hess.com',
  'pioneer-natural': 'pxd.com',
  'devon-energy': 'devonenergy.com',
  'diamondback': 'diamondbackenergy.com',
  'coterra': 'coterra.com',
  'baker-hughes': 'bakerhughes.com',
  'halliburton': 'halliburton.com',
  'schlumberger': 'slb.com',
  'duke-energy': 'duke-energy.com',
  'southern-company': 'southerncompany.com',
  'nextera': 'nexteraenergy.com',
  'dominion': 'dominionenergy.com',
  'sempra': 'sempra.com',
  'aes': 'aes.com',
  'enphase': 'enphase.com',
  'first-solar': 'firstsolar.com',
  'sunrun': 'sunrun.com',
  'williams': 'williams.com',
  'kinder-morgan': 'kindermorgan.com',
  'oneok': 'oneok.com',
  'targa': 'targaresources.com',
};

/**
 * Get a logo URL for a company. Falls back through multiple sources.
 * @param id - Company/institution ID (e.g. "goldman-sachs")
 * @param logoUrl - logo_url from API response
 * @param localLogos - Set of IDs that have local logo files
 */
export function getLogoUrl(
  id: string,
  logoUrl?: string | null,
  localLogos?: Set<string>,
): string {
  // 1. Local file
  if (localLogos?.has(id)) return `/logos/${id}.png`;
  // 2. API-provided URL
  if (logoUrl) return logoUrl;
  // 3. Clearbit fallback via domain mapping
  const domain = COMPANY_DOMAINS[id];
  if (domain) return `https://logo.clearbit.com/${domain}`;
  // 4. No logo available
  return '';
}

/**
 * Generate initials from a display name (for when no logo is available)
 */
export function getInitials(name: string): string {
  return name
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() || '')
    .join('');
}
