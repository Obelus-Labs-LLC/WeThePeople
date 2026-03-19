/**
 * Shared logo utility — tries multiple sources in order:
 * 1. Local file in /public/logos/{id}.png
 * 2. logo_url from API
 * 3. Clearbit Logo API (free, no key required)
 * 4. Returns empty string (caller shows initials)
 */

/** Known company domains for Clearbit fallback */
const COMPANY_DOMAINS: Record<string, string> = {
  // ============================================================================
  // FINANCE — Banks
  // ============================================================================
  'jpmorgan': 'jpmorganchase.com',
  'bank-of-america': 'bankofamerica.com',
  'citigroup': 'citigroup.com',
  'wells-fargo': 'wellsfargo.com',
  'goldman-sachs': 'goldmansachs.com',
  'morgan-stanley': 'morganstanley.com',
  'us-bancorp': 'usbank.com',
  'truist': 'truist.com',
  'pnc-financial': 'pnc.com',
  'capital-one': 'capitalone.com',
  'td-bank': 'td.com',
  'bny-mellon': 'bnymellon.com',
  'state-street': 'statestreet.com',
  'charles-schwab': 'schwab.com',
  'hsbc-us': 'hsbc.com',
  'citizens-financial': 'citizensbank.com',
  'fifth-third': '53.com',
  'mandt': 'mtb.com',
  'keycorp': 'key.com',
  'regions-financial': 'regions.com',
  'huntington-bancshares': 'huntington.com',
  'northern-trust': 'northerntrust.com',
  'ally-financial': 'ally.com',
  'comerica': 'comerica.com',
  'zions-bancorp': 'zionsbancorporation.com',
  'synchrony': 'synchrony.com',
  'discover': 'discover.com',
  'first-republic': 'firstcitizens.com',
  'western-alliance': 'westernalliancebancorporation.com',
  'east-west-bancorp': 'eastwestbank.com',
  'webster-financial': 'websterbank.com',
  'cullen-frost': 'frostbank.com',
  'popular-inc': 'popular.com',
  'new-york-community': 'mynycb.com',
  'valley-national': 'valleynationalbank.com',
  'wintrust': 'wintrust.com',
  'glacier-bancorp': 'glacierbancorp.com',
  'first-horizon': 'firsthorizon.com',
  'synovus': 'synovus.com',
  'columbia-banking': 'columbiabankingsystem.com',
  'hancock-whitney': 'hancockwhitney.com',
  'bok-financial': 'bokfinancial.com',
  'pacific-premier': 'ppbi.com',

  // ── Federal Reserve ──
  'federal-reserve': 'federalreserve.gov',

  // ── Insurance ──
  'berkshire-hathaway': 'berkshirehathaway.com',
  'metlife': 'metlife.com',
  'prudential': 'prudential.com',
  'aig': 'aig.com',
  'aflac': 'aflac.com',
  'chubb': 'chubb.com',
  'allstate': 'allstate.com',
  'travelers': 'travelers.com',
  'progressive': 'progressive.com',
  'hartford': 'thehartford.com',
  'principal': 'principal.com',
  'lincoln-national': 'lincolnfinancial.com',
  'unum': 'unum.com',
  'loews': 'loews.com',
  'markel': 'markel.com',
  'everest-group': 'everestglobal.com',
  'renaissancere': 'renre.com',
  'arch-capital': 'archgroup.com',
  'w-r-berkley': 'berkley.com',
  'erie-indemnity': 'erieinsurance.com',
  'globe-life': 'globelifeinsurance.com',
  'fidelity-national': 'fnf.com',

  // ── Asset Managers ──
  'blackrock': 'blackrock.com',
  'vanguard': 'vanguard.com',
  'fidelity': 'fidelity.com',
  'invesco': 'invesco.com',
  't-rowe-price': 'troweprice.com',
  'franklin-templeton': 'franklintempleton.com',
  'kkr': 'kkr.com',
  'apollo': 'apollo.com',
  'blackstone': 'blackstone.com',
  'carlyle': 'carlyle.com',
  'ares-management': 'aresmgmt.com',
  'brookfield-asset': 'brookfield.com',
  'blue-owl': 'blueowl.com',
  'tpg-inc': 'tpg.com',
  'raymond-james': 'raymondjames.com',
  'lazard': 'lazard.com',
  'ameriprise': 'ameriprise.com',
  'lpl-financial': 'lpl.com',
  'stifel-financial': 'stifel.com',

  // ── Fintech ──
  'paypal': 'paypal.com',
  'block-inc': 'block.xyz',
  'sofi': 'sofi.com',
  'robinhood': 'robinhood.com',
  'coinbase': 'coinbase.com',
  'affirm': 'affirm.com',
  'marqeta': 'marqeta.com',
  'toast': 'toasttab.com',
  'upstart': 'upstart.com',
  'green-dot': 'greendot.com',
  'lemonade': 'lemonade.com',
  'bill-holdings': 'bill.com',
  'shift4': 'shift4.com',

  // ── Payments / Exchanges ──
  'visa': 'visa.com',
  'mastercard': 'mastercard.com',
  'american-express': 'americanexpress.com',
  'fiserv': 'fiserv.com',
  'fis': 'fisglobal.com',
  'global-payments': 'globalpayments.com',
  'jack-henry': 'jackhenry.com',
  'fleetcor': 'corpay.com',
  'intercontinental-exchange': 'ice.com',
  'cme-group': 'cmegroup.com',
  'nasdaq-inc': 'nasdaq.com',
  'cboe': 'cboe.com',
  'msci': 'msci.com',
  'sp-global': 'spglobal.com',
  'moodys': 'moodys.com',

  // ── Mortgage / GSEs ──
  'rocket-companies': 'rocketcompanies.com',
  'mr-cooper': 'mrcooper.com',
  'uwm-holdings': 'uwm.com',
  'pennymac': 'pennymac.com',
  'fannie-mae': 'fanniemae.com',
  'freddie-mac': 'freddiemac.com',

  // ============================================================================
  // HEALTH — Pharma
  // ============================================================================
  'pfizer': 'pfizer.com',
  'johnson-johnson': 'jnj.com',
  'abbvie': 'abbvie.com',
  'merck': 'merck.com',
  'eli-lilly': 'lilly.com',
  'bristol-myers-squibb': 'bms.com',
  'roche': 'roche.com',
  'novartis': 'novartis.com',
  'astrazeneca': 'astrazeneca.com',
  'sanofi': 'sanofi.com',
  'gsk': 'gsk.com',
  'novo-nordisk': 'novonordisk.com',
  'amgen': 'amgen.com',
  'gilead': 'gilead.com',
  'regeneron': 'regeneron.com',
  'vertex': 'vrtx.com',
  'bayer': 'bayer.com',
  'takeda': 'takeda.com',
  'boehringer-ingelheim': 'boehringer-ingelheim.com',
  'teva': 'tevapharm.com',
  'viatris': 'viatris.com',
  'organon': 'organon.com',
  'jazz-pharma': 'jazzpharma.com',
  'biogen': 'biogen.com',
  'zoetis': 'zoetis.com',
  'bausch-health': 'bauschhealth.com',
  'catalent': 'catalent.com',
  'horizon-therapeutics': 'horizontherapeutics.com',
  'ipsen': 'ipsen.com',

  // ── Biotech ──
  'moderna': 'modernatx.com',
  'illumina': 'illumina.com',
  'biontech': 'biontech.com',
  'alnylam': 'alnylam.com',
  'argenx': 'argenx.com',
  'biomarin': 'biomarin.com',
  'incyte': 'incyte.com',
  'neurocrine': 'neurocrine.com',
  'sarepta': 'sarepta.com',
  'exelixis': 'exelixis.com',
  'halozyme': 'halozyme.com',
  'united-therapeutics': 'unither.com',
  'ionis': 'ionispharma.com',
  'exact-sciences': 'exactsciences.com',
  'natera': 'natera.com',
  '10x-genomics': '10xgenomics.com',
  'crispr-therapeutics': 'crisprtx.com',
  'intellia': 'intelliatx.com',
  'beam-therapeutics': 'beamtx.com',

  // ── Medical Devices ──
  'medtronic': 'medtronic.com',
  'abbott': 'abbott.com',
  'thermo-fisher': 'thermofisher.com',
  'danaher': 'danaher.com',
  'becton-dickinson': 'bd.com',
  'stryker': 'stryker.com',
  'boston-scientific': 'bostonscientific.com',
  'edwards-lifesciences': 'edwards.com',
  'intuitive-surgical': 'intuitive.com',
  'zimmer-biomet': 'zimmerbiomet.com',
  'hologic': 'hologic.com',
  'resmed': 'resmed.com',
  'baxter': 'baxter.com',
  'agilent': 'agilent.com',
  'teleflex': 'teleflex.com',
  'ge-healthcare': 'gehealthcare.com',
  'siemens-healthineers': 'siemens-healthineers.com',
  'philips': 'philips.com',

  // ── Health Insurers ──
  'unitedhealth': 'unitedhealthgroup.com',
  'elevance': 'elevancehealth.com',
  'cigna': 'cigna.com',
  'humana': 'humana.com',
  'centene': 'centene.com',
  'molina': 'molinahealthcare.com',
  'cvs-health': 'cvshealth.com',
  'kaiser-permanente': 'kaiserpermanente.org',
  'oscar-health': 'hioscar.com',
  'clover-health': 'cloverhealth.com',

  // ── Hospital / Healthcare Systems ──
  'hca': 'hcahealthcare.com',
  'community-health': 'chs.net',
  'tenet': 'tenethealth.com',
  'universal-health': 'uhs.com',
  'encompass-health': 'encompasshealth.com',
  'acadia-healthcare': 'acadiahealthcare.com',
  'amedisys': 'amedisys.com',
  'davita': 'davita.com',
  'surgery-partners': 'surgerypartners.com',

  // ── Pharmacy / Distribution ──
  'mckesson': 'mckesson.com',
  'amerisourcebergen': 'cencora.com',
  'cardinal-health': 'cardinalhealth.com',
  'walgreens': 'walgreens.com',

  // ── Health Tech / Services ──
  'veeva-systems': 'veeva.com',
  'iqvia': 'iqvia.com',
  'charles-river': 'criver.com',
  'icon-plc': 'iconplc.com',
  'west-pharma': 'westpharma.com',
  'teladoc': 'teladochealth.com',

  // ============================================================================
  // TECH — Mega-Cap / Platforms
  // ============================================================================
  'apple': 'apple.com',
  'microsoft': 'microsoft.com',
  'alphabet': 'google.com',
  'amazon': 'amazon.com',
  'meta': 'meta.com',
  'nvidia': 'nvidia.com',
  'tesla': 'tesla.com',
  'netflix': 'netflix.com',
  'salesforce': 'salesforce.com',
  'adobe': 'adobe.com',
  'oracle': 'oracle.com',
  'ibm': 'ibm.com',
  'cisco': 'cisco.com',
  'intel': 'intel.com',
  'amd': 'amd.com',
  'broadcom': 'broadcom.com',
  'qualcomm': 'qualcomm.com',
  'texas-instruments': 'ti.com',

  // ── Enterprise / SaaS ──
  'servicenow': 'servicenow.com',
  'intuit': 'intuit.com',
  'workday': 'workday.com',
  'palo-alto': 'paloaltonetworks.com',
  'crowdstrike': 'crowdstrike.com',
  'fortinet': 'fortinet.com',
  'zscaler': 'zscaler.com',
  'datadog': 'datadoghq.com',
  'snowflake': 'snowflake.com',
  'palantir': 'palantir.com',
  'twilio': 'twilio.com',
  'hubspot': 'hubspot.com',
  'atlassian': 'atlassian.com',
  'mongodb': 'mongodb.com',
  'cloudflare': 'cloudflare.com',
  'okta': 'okta.com',
  'elastic': 'elastic.co',
  'dynatrace': 'dynatrace.com',
  'confluent': 'confluent.io',
  'gitlab': 'gitlab.com',
  'hashicorp': 'hashicorp.com',
  'verint': 'verint.com',

  // ── Semiconductors ──
  'tsmc': 'tsmc.com',
  'asml': 'asml.com',
  'applied-materials': 'appliedmaterials.com',
  'lam-research': 'lamresearch.com',
  'klac': 'kla.com',
  'marvell': 'marvell.com',
  'analog-devices': 'analog.com',
  'micron': 'micron.com',
  'on-semiconductor': 'onsemi.com',
  'nxp': 'nxp.com',
  'skyworks': 'skyworksinc.com',
  'microchip': 'microchip.com',
  'arm-holdings': 'arm.com',
  'synopsys': 'synopsys.com',
  'cadence': 'cadence.com',
  'lattice-semi': 'latticesemi.com',
  'globalfoundries': 'globalfoundries.com',

  // ── AI / Cloud ──
  'c3ai': 'c3.ai',
  'upstart-tech': 'uipath.com',
  'samsara': 'samsara.com',

  // ── Telecom / Media ──
  'att': 'att.com',
  'verizon': 'verizon.com',
  't-mobile': 't-mobile.com',
  'comcast': 'comcast.com',
  'disney': 'disney.com',
  'spotify': 'spotify.com',
  'snap': 'snap.com',
  'pinterest': 'pinterest.com',
  'roku': 'roku.com',
  'roblox': 'roblox.com',

  // ── E-commerce / Consumer Tech ──
  'shopify': 'shopify.com',
  'uber': 'uber.com',
  'lyft': 'lyft.com',
  'airbnb': 'airbnb.com',
  'doordash': 'doordash.com',
  'ebay': 'ebay.com',
  'etsy': 'etsy.com',
  'mercadolibre': 'mercadolibre.com',

  // ── Defense / Gov Tech ──
  'raytheon': 'rtx.com',
  'lockheed-martin': 'lockheedmartin.com',
  'northrop-grumman': 'northropgrumman.com',
  'general-dynamics': 'gd.com',
  'l3harris': 'l3harris.com',
  'bae-systems': 'baesystems.com',
  'booz-allen': 'boozallen.com',
  'leidos': 'leidos.com',
  'saic': 'saic.com',
  'anduril': 'anduril.com',

  // ── Hardware / IT Infra ──
  'hp-inc': 'hp.com',
  'hpe': 'hpe.com',
  'dell': 'dell.com',
  'arista': 'arista.com',
  'netapp': 'netapp.com',
  'pure-storage': 'purestorage.com',
  'western-digital': 'westerndigital.com',
  'seagate': 'seagate.com',
  'motorola': 'motorolasolutions.com',
  'garmin': 'garmin.com',
  'zebra': 'zebra.com',
  'super-micro': 'supermicro.com',

  // ============================================================================
  // ENERGY — Oil & Gas
  // ============================================================================
  'exxonmobil': 'exxonmobil.com',
  'chevron': 'chevron.com',
  'conocophillips': 'conocophillips.com',
  'phillips66': 'phillips66.com',
  'marathon-petroleum': 'marathonpetroleum.com',
  'valero': 'valero.com',
  'eog-resources': 'eogresources.com',
  'pioneer-natural': 'pxd.com',
  'devon-energy': 'devonenergy.com',
  'hess': 'hess.com',
  'diamondback': 'diamondbackenergy.com',
  'coterra': 'coterra.com',
  'occidental': 'oxy.com',
  'marathon-oil': 'marathonoil.com',
  'apa-corp': 'apacorp.com',
  'murphy-oil': 'murphyoilcorp.com',
  'ovintiv': 'ovintiv.com',
  'range-resources': 'rangeresources.com',
  'southwestern-energy': 'swn.com',
  'eq-resources': 'eqt.com',
  'antero-resources': 'anteroresources.com',
  'chesapeake-energy': 'chk.com',
  'permian-resources': 'permianres.com',
  'civitas-resources': 'civitasresources.com',
  'magnolia-oil': 'magnoliaoilgas.com',
  'delek-us': 'delekus.com',
  'par-pacific': 'parpacific.com',
  'pbf-energy': 'pbfenergy.com',
  'holly-frontier': 'hfsinclair.com',

  // ── International Majors ──
  'shell': 'shell.com',
  'bp': 'bp.com',
  'totalenergies': 'totalenergies.com',
  'petrobras': 'petrobras.com.br',
  'equinor': 'equinor.com',
  'eni': 'eni.com',

  // ── Utilities ──
  'nextera': 'nexteraenergy.com',
  'duke-energy': 'duke-energy.com',
  'southern-company': 'southerncompany.com',
  'dominion-energy': 'dominionenergy.com',
  'american-electric': 'aep.com',
  'exelon': 'exeloncorp.com',
  'sempra': 'sempra.com',
  'xcel-energy': 'xcelenergy.com',
  'entergy': 'entergy.com',
  'wec-energy': 'wecenergygroup.com',
  'eversource': 'eversource.com',
  'consolidated-edison': 'conedison.com',
  'dte-energy': 'dteenergy.com',
  'cms-energy': 'cmsenergy.com',
  'atmos-energy': 'atmosenergy.com',
  'centerpoint': 'centerpointenergy.com',
  'ppg-industries': 'pplweb.com',
  'alliant-energy': 'alliantenergy.com',
  'ameren': 'ameren.com',
  'nrg-energy': 'nrg.com',
  'vistra': 'vistracorp.com',
  'constellation-energy': 'constellationenergy.com',
  'aes-corp': 'aes.com',
  'avangrid': 'avangrid.com',

  // ── Renewables ──
  'first-solar': 'firstsolar.com',
  'enphase': 'enphase.com',
  'sunrun': 'sunrun.com',
  'plug-power': 'plugpower.com',
  'brookfield-renewable': 'brookfieldrenewable.com',
  'clearway-energy': 'clearwayenergy.com',
  'sunnova': 'sunnova.com',
  'nextracker': 'nextracker.com',
  'stem-inc': 'stem.com',
  'array-technologies': 'arraytechinc.com',
  'shoals-tech': 'shoals.com',

  // ── Pipelines / Midstream ──
  'enbridge': 'enbridge.com',
  'enterprise-products': 'enterpriseproducts.com',
  'kinder-morgan': 'kindermorgan.com',
  'williams-companies': 'williams.com',
  'oneok': 'oneok.com',
  'energy-transfer': 'energytransfer.com',
  'plains-all-american': 'plainsallamerican.com',
  'targa-resources': 'targaresources.com',
  'mplx': 'mplx.com',
  'western-midstream': 'westernmidstream.com',
  'dtm': 'dtmidstream.com',

  // ── Oilfield Services ──
  'schlumberger': 'slb.com',
  'halliburton': 'halliburton.com',
  'baker-hughes': 'bakerhughes.com',
  'championx': 'championx.com',
  'liberty-energy': 'libertyenergy.com',
  'cactus-inc': 'cactuswhd.com',
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
