import React, { Suspense } from "react";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Analytics } from "@vercel/analytics/react";
import { AuthProvider } from "./contexts/AuthContext";
import PoliticsLayout from "./layouts/PoliticsLayout";
import FinanceLayout from "./layouts/FinanceLayout";
import TechLayout from "./layouts/TechLayout";
import HealthLayout from "./layouts/HealthLayout";
import EnergyLayout from "./layouts/EnergyLayout";
import TransportationLayout from "./layouts/TransportationLayout";
import DefenseLayout from "./layouts/DefenseLayout";
import ChemicalsLayout from "./layouts/ChemicalsLayout";
import AgricultureLayout from "./layouts/AgricultureLayout";
import TelecomLayout from "./layouts/TelecomLayout";
import EducationLayout from "./layouts/EducationLayout";
// VerifyLayout removed — verification moved to verify.wethepeopleforus.com
import DashboardLayout from "./layouts/DashboardLayout";
import ErrorBoundary from "./components/ErrorBoundary";
import ChatAgent from "./components/ChatAgent";
import EcosystemNav from "./components/EcosystemNav";

// ── Lazy-loaded pages ──

const HomePage = React.lazy(() => import("./pages/HomePage"));
const PoliticsDashboardPage = React.lazy(() => import("./pages/PoliticsDashboardPage"));
const PeoplePage = React.lazy(() => import("./pages/PeoplePage"));
const PersonProfilePage = React.lazy(() => import("./pages/PersonProfilePage"));
const ClaimDetailPage = React.lazy(() => import("./pages/ClaimDetailPage"));
const BillDetailPage = React.lazy(() => import("./pages/BillDetailPage"));
const VoteDetailPage = React.lazy(() => import("./pages/VoteDetailPage"));
const ComparePageNew = React.lazy(() => import("./pages/ComparePageNew"));
const PressToolsPage = React.lazy(() => import("./pages/PressToolsPage"));
const ActivityFeedPage = React.lazy(() => import("./pages/ActivityFeedPage"));
// Balance of Power is rendered inline in PoliticsDashboardPage — the standalone
// page has been removed.
const LegislationTrackerPage = React.lazy(() => import("./pages/LegislationTrackerPage"));
const CommitteesPage = React.lazy(() => import("./pages/CommitteesPage"));
const RepresentativeLookupPage = React.lazy(() => import("./pages/RepresentativeLookupPage"));
const ComingSoonPage = React.lazy(() => import("./pages/ComingSoonPage"));
const FinanceDashboardPage = React.lazy(() => import("./pages/FinanceDashboardPage"));
const InstitutionPage = React.lazy(() => import("./pages/InstitutionPage"));
// News / Insider Trades / Market Movers all live on wtp-research now; routes
// below redirect via MovedToResearchPage.
const FinanceComparePage = React.lazy(() => import("./pages/FinanceComparePage"));
const InstitutionDirectoryPage = React.lazy(() => import("./pages/InstitutionDirectoryPage"));
const TechDashboardPage = React.lazy(() => import("./pages/TechDashboardPage"));
const TechCompaniesPage = React.lazy(() => import("./pages/TechCompaniesPage"));
const TechComparePage = React.lazy(() => import("./pages/TechComparePage"));
const TechCompanyProfilePage = React.lazy(() => import("./pages/TechCompanyProfilePage"));
// PatentSearchPage moved to wtp-research; /technology/patents redirects via
// MovedToResearchPage.
// LobbyingBreakdownPage / ContractTimelinePage / EnforcementTrackerPage
// were lazy-imported here but never referenced by any <Route>, so they
// were pulling weight in the bundle for nothing. The mobile app still
// has equivalent screens; if a web route ever needs them, restore the
// imports alongside the matching <Route> definitions.
const HealthDashboardPage = React.lazy(() => import("./pages/HealthDashboardPage"));
const HealthCompaniesPage = React.lazy(() => import("./pages/HealthCompaniesPage"));
const HealthComparePage = React.lazy(() => import("./pages/HealthComparePage"));
const HealthCompanyProfilePage = React.lazy(() => import("./pages/HealthCompanyProfilePage"));
// Drug lookup is deliberately not exposed in the UI; the underlying endpoints
// stay live. Pipeline + FDA Approvals moved to wtp-research and redirect via
// MovedToResearchPage.
const EnergyDashboardPage = React.lazy(() => import("./pages/EnergyDashboardPage"));
const EnergyCompaniesPage = React.lazy(() => import("./pages/EnergyCompaniesPage"));
const EnergyCompanyProfilePage = React.lazy(() => import("./pages/EnergyCompanyProfilePage"));
const EnergyComparePage = React.lazy(() => import("./pages/EnergyComparePage"));
const TransportationDashboardPage = React.lazy(() => import("./pages/TransportationDashboardPage"));
const TransportationCompaniesPage = React.lazy(() => import("./pages/TransportationCompaniesPage"));
const TransportationCompanyProfilePage = React.lazy(() => import("./pages/TransportationCompanyProfilePage"));
const TransportationComparePage = React.lazy(() => import("./pages/TransportationComparePage"));
const DefenseDashboardPage = React.lazy(() => import("./pages/DefenseDashboardPage"));
const DefenseCompaniesPage = React.lazy(() => import("./pages/DefenseCompaniesPage"));
const DefenseCompanyProfilePage = React.lazy(() => import("./pages/DefenseCompanyProfilePage"));
const DefenseComparePage = React.lazy(() => import("./pages/DefenseComparePage"));
const ChemicalsDashboardPage = React.lazy(() => import("./pages/ChemicalsDashboardPage"));
const ChemicalsCompaniesPage = React.lazy(() => import("./pages/ChemicalsCompaniesPage"));
const ChemicalsCompanyProfilePage = React.lazy(() => import("./pages/ChemicalsCompanyProfilePage"));
const ChemicalsComparePage = React.lazy(() => import("./pages/ChemicalsComparePage"));
const AgricultureDashboardPage = React.lazy(() => import("./pages/AgricultureDashboardPage"));
const AgricultureCompaniesPage = React.lazy(() => import("./pages/AgricultureCompaniesPage"));
const AgricultureCompanyProfilePage = React.lazy(() => import("./pages/AgricultureCompanyProfilePage"));
const AgricultureComparePage = React.lazy(() => import("./pages/AgricultureComparePage"));
const TelecomDashboardPage = React.lazy(() => import("./pages/TelecomDashboardPage"));
const TelecomCompaniesPage = React.lazy(() => import("./pages/TelecomCompaniesPage"));
const TelecomCompanyProfilePage = React.lazy(() => import("./pages/TelecomCompanyProfilePage"));
const TelecomComparePage = React.lazy(() => import("./pages/TelecomComparePage"));
const EducationDashboardPage = React.lazy(() => import("./pages/EducationDashboardPage"));
const EducationCompaniesPage = React.lazy(() => import("./pages/EducationCompaniesPage"));
const EducationCompanyProfilePage = React.lazy(() => import("./pages/EducationCompanyProfilePage"));
const EducationComparePage = React.lazy(() => import("./pages/EducationComparePage"));
const CongressionalTradesPage = React.lazy(() => import("./pages/CongressionalTradesPage"));
const StateExplorerPage = React.lazy(() => import("./pages/StateExplorerPage"));
const StateDashboardPage = React.lazy(() => import("./pages/StateDashboardPage"));
const InfluenceExplorerPage = React.lazy(() => import("./pages/InfluenceExplorerPage"));
const InfluenceMapPage = React.lazy(() => import("./pages/InfluenceMapPage"));
const InfluenceNetworkPage = React.lazy(() => import("./pages/InfluenceNetworkPage"));
const SectorLobbyingPage = React.lazy(() => import("./pages/SectorLobbyingPage"));
const SectorContractsPage = React.lazy(() => import("./pages/SectorContractsPage"));
const SectorEnforcementPage = React.lazy(() => import("./pages/SectorEnforcementPage"));
// ComplaintsDashboardPage moved to wtp-research; /finance/complaints redirects
// via MovedToResearchPage.
const ClosedLoopPage = React.lazy(() => import("./pages/ClosedLoopPage"));
const MoneyFlowPage = React.lazy(() => import("./pages/MoneyFlowPage"));
const DataExplorerPage = React.lazy(() => import("./pages/DataExplorerPage"));
const DataStoryPage = React.lazy(() => import("./pages/DataStoryPage"));
const InfluenceTimelinePage = React.lazy(() => import("./pages/InfluenceTimelinePage"));
const AnomaliesPage = React.lazy(() => import("./pages/AnomaliesPage"));
// Verify pages removed — verification moved to verify.wethepeopleforus.com
const CivicHubPage = React.lazy(() => import("./pages/CivicHubPage"));
const PromiseDetailPage = React.lazy(() => import("./pages/PromiseDetailPage"));
const BadgesPage = React.lazy(() => import("./pages/BadgesPage"));
const CivicVerifyPage = React.lazy(() => import("./pages/CivicVerifyPage"));
const DigestSignupPage = React.lazy(() => import("./pages/DigestSignupPage"));
const LoginPage = React.lazy(() => import("./pages/LoginPage"));
const SignupPage = React.lazy(() => import("./pages/SignupPage"));
const AccountPage = React.lazy(() => import("./pages/AccountPage"));
const ZipLookupPage = React.lazy(() => import("./pages/ZipLookupPage"));
// Stories moved to the Journal site — routes redirect via MovedToJournalPage
const MovedToJournalPage = React.lazy(() => import("./pages/MovedToJournalPage"));
const MovedToResearchPage = React.lazy(() => import("./pages/MovedToResearchPage"));
const NotFoundPage = React.lazy(() => import("./pages/NotFoundPage"));
const PrivacyPolicyPage = React.lazy(() => import("./pages/PrivacyPolicyPage"));
const TermsOfUsePage = React.lazy(() => import("./pages/TermsOfUsePage"));
const DisclaimerPage = React.lazy(() => import("./pages/DisclaimerPage"));
const AboutPage = React.lazy(() => import("./pages/AboutPage"));
const ApiAccessPage = React.lazy(() => import("./pages/ApiAccessPage"));
const PricingPage = React.lazy(() => import("./pages/PricingPage"));
const MethodologyPage = React.lazy(() => import("./pages/MethodologyPage"));

// Landing page has its own SiteHeader with search + Log in/Sign up.
// All other pages rely on the global floating overlays.
//
// The EcosystemNav is a 52px sticky bar pinned at top:0 on every page,
// and now hosts the auth controls on its right side. The previous
// floating UserMenu pill at top-[10px] right-4 is gone because it
// routinely overlapped EcosystemNav's right-side WTP identifier on
// pages like /civic. Auth lives in exactly one place now.
const GlobalOverlays: React.FC = () => {
  const { pathname } = useLocation();
  const isLanding = pathname === "/";
  if (isLanding) return null;
  return <ChatAgent />;
};

const App: React.FC = () => (
  <ErrorBoundary>
    <AuthProvider>
    <BrowserRouter>
      {/* Cross-site switcher — renders on every page so users can jump to
          Verify / Research / Journal without hunting for a link. Sticky at
          top:0 with z-[60]; the per-page SiteHeader / SectorHeader stick
          right below it (top-[52px], z-50). */}
      <EcosystemNav active="core" />
      <GlobalOverlays />
      <Suspense fallback={
        <div className="flex h-screen items-center justify-center bg-slate-950">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        </div>
      }>
        <Routes>
          {/* Sector selector */}
          <Route path="/" element={<HomePage />} />

          {/* Politics section — all wrapped in PoliticsLayout (FloatingLines bg) */}
          <Route path="/politics" element={<PoliticsLayout><PoliticsDashboardPage /></PoliticsLayout>} />
          <Route path="/politics/people" element={<PoliticsLayout><PeoplePage /></PoliticsLayout>} />
          <Route path="/politics/activity" element={<PoliticsLayout><ActivityFeedPage /></PoliticsLayout>} />
          {/* Balance of Power is merged into the dashboard above; /politics/power
              is no longer a valid route and falls through to NotFoundPage. */}
          <Route path="/politics/people/:person_id" element={<PoliticsLayout><PersonProfilePage /></PoliticsLayout>} />
          <Route path="/politics/claim/:claim_id" element={<PoliticsLayout><ClaimDetailPage /></PoliticsLayout>} />
          <Route path="/politics/bill/:bill_id" element={<PoliticsLayout><BillDetailPage /></PoliticsLayout>} />
          <Route path="/politics/vote/:vote_id" element={<PoliticsLayout><VoteDetailPage /></PoliticsLayout>} />
          <Route path="/politics/compare" element={<PoliticsLayout><ComparePageNew /></PoliticsLayout>} />
          <Route path="/politics/legislation" element={<PoliticsLayout><LegislationTrackerPage /></PoliticsLayout>} />
          <Route path="/politics/committees" element={<PoliticsLayout><CommitteesPage /></PoliticsLayout>} />
          <Route path="/politics/find-rep" element={<PoliticsLayout><RepresentativeLookupPage /></PoliticsLayout>} />
          <Route path="/politics/trades" element={<PoliticsLayout><CongressionalTradesPage /></PoliticsLayout>} />
          <Route path="/politics/lobbying" element={<PoliticsLayout><SectorLobbyingPage /></PoliticsLayout>} />
          <Route path="/politics/contracts" element={<PoliticsLayout><SectorContractsPage /></PoliticsLayout>} />
          <Route path="/politics/enforcement" element={<PoliticsLayout><SectorEnforcementPage /></PoliticsLayout>} />
          <Route path="/politics/states" element={<PoliticsLayout><StateExplorerPage /></PoliticsLayout>} />
          <Route path="/politics/states/:stateCode" element={<PoliticsLayout><StateDashboardPage /></PoliticsLayout>} />
          <Route path="/politics/press" element={<PoliticsLayout><DashboardLayout><PressToolsPage /></DashboardLayout></PoliticsLayout>} />

          {/* Cross-sector Influence Explorer */}
          <Route path="/influence" element={<InfluenceExplorerPage />} />
          <Route path="/influence/map" element={<InfluenceMapPage />} />
          <Route path="/influence/network" element={<InfluenceNetworkPage />} />
          <Route path="/influence/network/:entityType/:entityId" element={<InfluenceNetworkPage />} />
          <Route path="/influence/closed-loops" element={<PoliticsLayout><ClosedLoopPage /></PoliticsLayout>} />
          <Route path="/influence/money-flow" element={<MoneyFlowPage />} />
          <Route path="/influence/explorer" element={<DataExplorerPage />} />
          <Route path="/influence/story" element={<DataStoryPage />} />
          <Route path="/influence/timeline" element={<InfluenceTimelinePage />} />
          <Route path="/influence/anomalies" element={<AnomaliesPage />} />

          {/* Finance section — all wrapped in FinanceLayout (Waves bg) */}
          <Route path="/finance" element={<FinanceLayout><FinanceDashboardPage /></FinanceLayout>} />
          {/* Moved to WTP Research */}
          <Route path="/finance/news" element={<MovedToResearchPage />} />
          <Route path="/finance/insider-trades" element={<MovedToResearchPage />} />
          <Route path="/finance/institutions" element={<FinanceLayout><InstitutionDirectoryPage /></FinanceLayout>} />
          <Route path="/finance/compare" element={<FinanceLayout><FinanceComparePage /></FinanceLayout>} />
          <Route path="/finance/market-movers" element={<MovedToResearchPage />} />
          <Route path="/finance/lobbying" element={<FinanceLayout><SectorLobbyingPage /></FinanceLayout>} />
          <Route path="/finance/contracts" element={<FinanceLayout><SectorContractsPage /></FinanceLayout>} />
          <Route path="/finance/enforcement" element={<FinanceLayout><SectorEnforcementPage /></FinanceLayout>} />
          <Route path="/finance/complaints" element={<MovedToResearchPage />} />
          <Route path="/finance/:institution_id" element={<FinanceLayout><InstitutionPage /></FinanceLayout>} />

          {/* Technology section — all wrapped in TechLayout (MagicRings bg) */}
          <Route path="/technology" element={<TechLayout><TechDashboardPage /></TechLayout>} />
          <Route path="/technology/companies" element={<TechLayout><TechCompaniesPage /></TechLayout>} />
          <Route path="/technology/compare" element={<TechLayout><TechComparePage /></TechLayout>} />
          <Route path="/technology/patents" element={<MovedToResearchPage />} />
          <Route path="/technology/lobbying" element={<TechLayout><SectorLobbyingPage /></TechLayout>} />
          <Route path="/technology/contracts" element={<TechLayout><SectorContractsPage /></TechLayout>} />
          <Route path="/technology/enforcement" element={<TechLayout><SectorEnforcementPage /></TechLayout>} />
          <Route path="/technology/:companyId" element={<TechLayout><TechCompanyProfilePage /></TechLayout>} />

          {/* Health section — all wrapped in HealthLayout (Silk bg) */}
          <Route path="/health" element={<HealthLayout><HealthDashboardPage /></HealthLayout>} />
          <Route path="/health/companies" element={<HealthLayout><HealthCompaniesPage /></HealthLayout>} />
          <Route path="/health/compare" element={<HealthLayout><HealthComparePage /></HealthLayout>} />
          {/* Pipeline + FDA Approvals moved to WTP Research. Drug Lookup is
              deliberately not exposed here — the data stays in the backend. */}
          <Route path="/health/pipeline" element={<MovedToResearchPage />} />
          <Route path="/health/fda-approvals" element={<MovedToResearchPage />} />
          <Route path="/health/lobbying" element={<HealthLayout><SectorLobbyingPage /></HealthLayout>} />
          <Route path="/health/contracts" element={<HealthLayout><SectorContractsPage /></HealthLayout>} />
          <Route path="/health/enforcement" element={<HealthLayout><SectorEnforcementPage /></HealthLayout>} />
          <Route path="/health/:companyId" element={<HealthLayout><HealthCompanyProfilePage /></HealthLayout>} />

          {/* Energy section — all wrapped in EnergyLayout (blur-blob bg) */}
          <Route path="/energy" element={<EnergyLayout><EnergyDashboardPage /></EnergyLayout>} />
          <Route path="/energy/companies" element={<EnergyLayout><EnergyCompaniesPage /></EnergyLayout>} />
          <Route path="/energy/compare" element={<EnergyLayout><EnergyComparePage /></EnergyLayout>} />
          <Route path="/energy/lobbying" element={<EnergyLayout><SectorLobbyingPage /></EnergyLayout>} />
          <Route path="/energy/contracts" element={<EnergyLayout><SectorContractsPage /></EnergyLayout>} />
          <Route path="/energy/enforcement" element={<EnergyLayout><SectorEnforcementPage /></EnergyLayout>} />
          <Route path="/energy/:companyId" element={<EnergyLayout><EnergyCompanyProfilePage /></EnergyLayout>} />

          {/* Transportation section — all wrapped in TransportationLayout */}
          <Route path="/transportation" element={<TransportationLayout><TransportationDashboardPage /></TransportationLayout>} />
          <Route path="/transportation/companies" element={<TransportationLayout><TransportationCompaniesPage /></TransportationLayout>} />
          <Route path="/transportation/compare" element={<TransportationLayout><TransportationComparePage /></TransportationLayout>} />
          <Route path="/transportation/lobbying" element={<TransportationLayout><SectorLobbyingPage /></TransportationLayout>} />
          <Route path="/transportation/contracts" element={<TransportationLayout><SectorContractsPage /></TransportationLayout>} />
          <Route path="/transportation/enforcement" element={<TransportationLayout><SectorEnforcementPage /></TransportationLayout>} />
          <Route path="/transportation/:companyId" element={<TransportationLayout><TransportationCompanyProfilePage /></TransportationLayout>} />

          {/* Defense section — all wrapped in DefenseLayout */}
          <Route path="/defense" element={<DefenseLayout><DefenseDashboardPage /></DefenseLayout>} />
          <Route path="/defense/companies" element={<DefenseLayout><DefenseCompaniesPage /></DefenseLayout>} />
          <Route path="/defense/compare" element={<DefenseLayout><DefenseComparePage /></DefenseLayout>} />
          <Route path="/defense/lobbying" element={<DefenseLayout><SectorLobbyingPage /></DefenseLayout>} />
          <Route path="/defense/contracts" element={<DefenseLayout><SectorContractsPage /></DefenseLayout>} />
          <Route path="/defense/enforcement" element={<DefenseLayout><SectorEnforcementPage /></DefenseLayout>} />
          <Route path="/defense/:companyId" element={<DefenseLayout><DefenseCompanyProfilePage /></DefenseLayout>} />

          {/* Chemicals section — all wrapped in ChemicalsLayout */}
          <Route path="/chemicals" element={<ChemicalsLayout><ChemicalsDashboardPage /></ChemicalsLayout>} />
          <Route path="/chemicals/companies" element={<ChemicalsLayout><ChemicalsCompaniesPage /></ChemicalsLayout>} />
          <Route path="/chemicals/compare" element={<ChemicalsLayout><ChemicalsComparePage /></ChemicalsLayout>} />
          <Route path="/chemicals/lobbying" element={<ChemicalsLayout><SectorLobbyingPage /></ChemicalsLayout>} />
          <Route path="/chemicals/contracts" element={<ChemicalsLayout><SectorContractsPage /></ChemicalsLayout>} />
          <Route path="/chemicals/enforcement" element={<ChemicalsLayout><SectorEnforcementPage /></ChemicalsLayout>} />
          <Route path="/chemicals/:companyId" element={<ChemicalsLayout><ChemicalsCompanyProfilePage /></ChemicalsLayout>} />

          {/* Agriculture section — all wrapped in AgricultureLayout */}
          <Route path="/agriculture" element={<AgricultureLayout><AgricultureDashboardPage /></AgricultureLayout>} />
          <Route path="/agriculture/companies" element={<AgricultureLayout><AgricultureCompaniesPage /></AgricultureLayout>} />
          <Route path="/agriculture/compare" element={<AgricultureLayout><AgricultureComparePage /></AgricultureLayout>} />
          <Route path="/agriculture/lobbying" element={<AgricultureLayout><SectorLobbyingPage /></AgricultureLayout>} />
          <Route path="/agriculture/contracts" element={<AgricultureLayout><SectorContractsPage /></AgricultureLayout>} />
          <Route path="/agriculture/enforcement" element={<AgricultureLayout><SectorEnforcementPage /></AgricultureLayout>} />
          <Route path="/agriculture/:companyId" element={<AgricultureLayout><AgricultureCompanyProfilePage /></AgricultureLayout>} />

          {/* Telecommunications section — all wrapped in TelecomLayout */}
          <Route path="/telecom" element={<TelecomLayout><TelecomDashboardPage /></TelecomLayout>} />
          <Route path="/telecom/companies" element={<TelecomLayout><TelecomCompaniesPage /></TelecomLayout>} />
          <Route path="/telecom/compare" element={<TelecomLayout><TelecomComparePage /></TelecomLayout>} />
          <Route path="/telecom/lobbying" element={<TelecomLayout><SectorLobbyingPage /></TelecomLayout>} />
          <Route path="/telecom/contracts" element={<TelecomLayout><SectorContractsPage /></TelecomLayout>} />
          <Route path="/telecom/enforcement" element={<TelecomLayout><SectorEnforcementPage /></TelecomLayout>} />
          <Route path="/telecom/:companyId" element={<TelecomLayout><TelecomCompanyProfilePage /></TelecomLayout>} />

          {/* Education section — all wrapped in EducationLayout */}
          <Route path="/education" element={<EducationLayout><EducationDashboardPage /></EducationLayout>} />
          <Route path="/education/companies" element={<EducationLayout><EducationCompaniesPage /></EducationLayout>} />
          <Route path="/education/compare" element={<EducationLayout><EducationComparePage /></EducationLayout>} />
          <Route path="/education/lobbying" element={<EducationLayout><SectorLobbyingPage /></EducationLayout>} />
          <Route path="/education/contracts" element={<EducationLayout><SectorContractsPage /></EducationLayout>} />
          <Route path="/education/enforcement" element={<EducationLayout><SectorEnforcementPage /></EducationLayout>} />
          <Route path="/education/:companyId" element={<EducationLayout><EducationCompanyProfilePage /></EducationLayout>} />

          {/* Civic Hub — accountability, proposals, badges, verification */}
          <Route path="/civic" element={<CivicHubPage />} />
          <Route path="/civic/promises" element={<CivicHubPage />} />
          <Route path="/civic/promises/:promiseId" element={<PromiseDetailPage />} />
          <Route path="/civic/proposals" element={<CivicHubPage />} />
          <Route path="/civic/annotations" element={<CivicHubPage />} />
          <Route path="/civic/badges" element={<BadgesPage />} />
          <Route path="/civic/verify" element={<CivicVerifyPage />} />

          {/* Stories — moved to the Journal site */}
          <Route path="/stories" element={<MovedToJournalPage />} />
          <Route path="/stories/:slug" element={<MovedToJournalPage />} />

          {/* Zip Code Lookup */}
          <Route path="/lookup" element={<ZipLookupPage />} />

          {/* Digest signup */}
          <Route path="/digest" element={<DigestSignupPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/account" element={<AccountPage />} />

          {/* Legal / Info pages */}
          <Route path="/privacy" element={<PrivacyPolicyPage />} />
          <Route path="/terms" element={<TermsOfUsePage />} />
          <Route path="/disclaimer" element={<DisclaimerPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/api" element={<ApiAccessPage />} />
          <Route path="/developers" element={<ApiAccessPage />} />
          <Route path="/data" element={<ApiAccessPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/plans" element={<PricingPage />} />
          <Route path="/methodology" element={<MethodologyPage />} />

          {/* Coming Soon */}
          <Route path="/coming-soon/:slug" element={<ComingSoonPage />} />

          {/* 404 */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
      <Analytics />
    </BrowserRouter>
    </AuthProvider>
  </ErrorBoundary>
);

export default App;
