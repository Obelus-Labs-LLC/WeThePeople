import React, { Suspense } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Analytics } from "@vercel/analytics/react";
import PoliticsLayout from "./layouts/PoliticsLayout";
import FinanceLayout from "./layouts/FinanceLayout";
import TechLayout from "./layouts/TechLayout";
import HealthLayout from "./layouts/HealthLayout";
import EnergyLayout from "./layouts/EnergyLayout";
import TransportationLayout from "./layouts/TransportationLayout";
import VerifyLayout from "./layouts/VerifyLayout";
import DashboardLayout from "./layouts/DashboardLayout";
import ErrorBoundary from "./components/ErrorBoundary";
import GlobalSearch from "./components/GlobalSearch";
import ChatAgent from "./components/ChatAgent";

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
const BalanceOfPowerPage = React.lazy(() => import("./pages/BalanceOfPowerPage"));
const LegislationTrackerPage = React.lazy(() => import("./pages/LegislationTrackerPage"));
const CommitteesPage = React.lazy(() => import("./pages/CommitteesPage"));
const RepresentativeLookupPage = React.lazy(() => import("./pages/RepresentativeLookupPage"));
const ComingSoonPage = React.lazy(() => import("./pages/ComingSoonPage"));
const FinanceDashboardPage = React.lazy(() => import("./pages/FinanceDashboardPage"));
const InstitutionPage = React.lazy(() => import("./pages/InstitutionPage"));
const NewsRegulatoryPage = React.lazy(() => import("./pages/NewsRegulatoryPage"));
const InsiderTradesDashboardPage = React.lazy(() => import("./pages/InsiderTradesDashboardPage"));
const FinanceComparePage = React.lazy(() => import("./pages/FinanceComparePage"));
const InstitutionDirectoryPage = React.lazy(() => import("./pages/InstitutionDirectoryPage"));
const MarketMoversPage = React.lazy(() => import("./pages/MarketMoversPage"));
const TechDashboardPage = React.lazy(() => import("./pages/TechDashboardPage"));
const TechCompaniesPage = React.lazy(() => import("./pages/TechCompaniesPage"));
const TechComparePage = React.lazy(() => import("./pages/TechComparePage"));
const TechCompanyProfilePage = React.lazy(() => import("./pages/TechCompanyProfilePage"));
const PatentSearchPage = React.lazy(() => import("./pages/PatentSearchPage"));
const LobbyingBreakdownPage = React.lazy(() => import("./pages/LobbyingBreakdownPage"));
const ContractTimelinePage = React.lazy(() => import("./pages/ContractTimelinePage"));
const EnforcementTrackerPage = React.lazy(() => import("./pages/EnforcementTrackerPage"));
const HealthDashboardPage = React.lazy(() => import("./pages/HealthDashboardPage"));
const HealthCompaniesPage = React.lazy(() => import("./pages/HealthCompaniesPage"));
const HealthComparePage = React.lazy(() => import("./pages/HealthComparePage"));
const HealthCompanyProfilePage = React.lazy(() => import("./pages/HealthCompanyProfilePage"));
// DrugLookupPage hidden from UI (data kept in backend)
// const DrugLookupPage = React.lazy(() => import("./pages/DrugLookupPage"));
const ClinicalTrialPipelinePage = React.lazy(() => import("./pages/ClinicalTrialPipelinePage"));
const FDAApprovalsPage = React.lazy(() => import("./pages/FDAApprovalsPage"));
const EnergyDashboardPage = React.lazy(() => import("./pages/EnergyDashboardPage"));
const EnergyCompaniesPage = React.lazy(() => import("./pages/EnergyCompaniesPage"));
const EnergyCompanyProfilePage = React.lazy(() => import("./pages/EnergyCompanyProfilePage"));
const EnergyComparePage = React.lazy(() => import("./pages/EnergyComparePage"));
const TransportationDashboardPage = React.lazy(() => import("./pages/TransportationDashboardPage"));
const TransportationCompaniesPage = React.lazy(() => import("./pages/TransportationCompaniesPage"));
const TransportationCompanyProfilePage = React.lazy(() => import("./pages/TransportationCompanyProfilePage"));
const TransportationComparePage = React.lazy(() => import("./pages/TransportationComparePage"));
const CongressionalTradesPage = React.lazy(() => import("./pages/CongressionalTradesPage"));
const StateExplorerPage = React.lazy(() => import("./pages/StateExplorerPage"));
const StateDashboardPage = React.lazy(() => import("./pages/StateDashboardPage"));
const InfluenceExplorerPage = React.lazy(() => import("./pages/InfluenceExplorerPage"));
const InfluenceMapPage = React.lazy(() => import("./pages/InfluenceMapPage"));
const InfluenceNetworkPage = React.lazy(() => import("./pages/InfluenceNetworkPage"));
const SectorLobbyingPage = React.lazy(() => import("./pages/SectorLobbyingPage"));
const SectorContractsPage = React.lazy(() => import("./pages/SectorContractsPage"));
const SectorEnforcementPage = React.lazy(() => import("./pages/SectorEnforcementPage"));
const ComplaintsDashboardPage = React.lazy(() => import("./pages/ComplaintsDashboardPage"));
const ClosedLoopPage = React.lazy(() => import("./pages/ClosedLoopPage"));
const MoneyFlowPage = React.lazy(() => import("./pages/MoneyFlowPage"));
const DataExplorerPage = React.lazy(() => import("./pages/DataExplorerPage"));
const DataStoryPage = React.lazy(() => import("./pages/DataStoryPage"));
const InfluenceTimelinePage = React.lazy(() => import("./pages/InfluenceTimelinePage"));
const AnomaliesPage = React.lazy(() => import("./pages/AnomaliesPage"));
const VerifyDashboardPage = React.lazy(() => import("./pages/VerifyDashboardPage"));
const VerifySubmitPage = React.lazy(() => import("./pages/VerifySubmitPage"));
const VerifyResultPage = React.lazy(() => import("./pages/VerifyResultPage"));
const VerifyEntityPage = React.lazy(() => import("./pages/VerifyEntityPage"));
const VerifyMethodologyPage = React.lazy(() => import("./pages/VerifyMethodologyPage"));
const NotFoundPage = React.lazy(() => import("./pages/NotFoundPage"));
const PrivacyPolicyPage = React.lazy(() => import("./pages/PrivacyPolicyPage"));
const TermsOfUsePage = React.lazy(() => import("./pages/TermsOfUsePage"));
const DisclaimerPage = React.lazy(() => import("./pages/DisclaimerPage"));
const AboutPage = React.lazy(() => import("./pages/AboutPage"));
const MethodologyPage = React.lazy(() => import("./pages/MethodologyPage"));

const App: React.FC = () => (
  <ErrorBoundary>
    <BrowserRouter>
      <GlobalSearch />
      <ChatAgent />
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
          <Route path="/politics/power" element={<PoliticsLayout><BalanceOfPowerPage /></PoliticsLayout>} />
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
          <Route path="/finance/news" element={<FinanceLayout><NewsRegulatoryPage /></FinanceLayout>} />
          <Route path="/finance/insider-trades" element={<FinanceLayout><InsiderTradesDashboardPage /></FinanceLayout>} />
          <Route path="/finance/institutions" element={<FinanceLayout><InstitutionDirectoryPage /></FinanceLayout>} />
          <Route path="/finance/compare" element={<FinanceLayout><FinanceComparePage /></FinanceLayout>} />
          <Route path="/finance/market-movers" element={<FinanceLayout><MarketMoversPage /></FinanceLayout>} />
          <Route path="/finance/lobbying" element={<FinanceLayout><SectorLobbyingPage /></FinanceLayout>} />
          <Route path="/finance/contracts" element={<FinanceLayout><SectorContractsPage /></FinanceLayout>} />
          <Route path="/finance/enforcement" element={<FinanceLayout><SectorEnforcementPage /></FinanceLayout>} />
          <Route path="/finance/complaints" element={<FinanceLayout><ComplaintsDashboardPage /></FinanceLayout>} />
          <Route path="/finance/:institution_id" element={<FinanceLayout><InstitutionPage /></FinanceLayout>} />

          {/* Technology section — all wrapped in TechLayout (MagicRings bg) */}
          <Route path="/technology" element={<TechLayout><TechDashboardPage /></TechLayout>} />
          <Route path="/technology/companies" element={<TechLayout><TechCompaniesPage /></TechLayout>} />
          <Route path="/technology/compare" element={<TechLayout><TechComparePage /></TechLayout>} />
          <Route path="/technology/patents" element={<TechLayout><PatentSearchPage /></TechLayout>} />
          <Route path="/technology/lobbying" element={<TechLayout><SectorLobbyingPage /></TechLayout>} />
          <Route path="/technology/contracts" element={<TechLayout><SectorContractsPage /></TechLayout>} />
          <Route path="/technology/enforcement" element={<TechLayout><SectorEnforcementPage /></TechLayout>} />
          <Route path="/technology/:companyId" element={<TechLayout><TechCompanyProfilePage /></TechLayout>} />

          {/* Health section — all wrapped in HealthLayout (Silk bg) */}
          <Route path="/health" element={<HealthLayout><HealthDashboardPage /></HealthLayout>} />
          <Route path="/health/companies" element={<HealthLayout><HealthCompaniesPage /></HealthLayout>} />
          <Route path="/health/compare" element={<HealthLayout><HealthComparePage /></HealthLayout>} />
          {/* Drug Lookup hidden from UI (data kept in backend) */}
          <Route path="/health/pipeline" element={<HealthLayout><ClinicalTrialPipelinePage /></HealthLayout>} />
          <Route path="/health/fda-approvals" element={<HealthLayout><FDAApprovalsPage /></HealthLayout>} />
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

          {/* Claim Verification section — wrapped in VerifyLayout */}
          <Route path="/verify" element={<VerifyLayout><VerifyDashboardPage /></VerifyLayout>} />
          <Route path="/verify/submit" element={<VerifyLayout><VerifySubmitPage /></VerifyLayout>} />
          <Route path="/verify/results/:id" element={<VerifyLayout><VerifyResultPage /></VerifyLayout>} />
          <Route path="/verify/entity/:type/:id" element={<VerifyLayout><VerifyEntityPage /></VerifyLayout>} />
          <Route path="/verify/methodology" element={<VerifyLayout><VerifyMethodologyPage /></VerifyLayout>} />

          {/* Legal / Info pages */}
          <Route path="/privacy" element={<PrivacyPolicyPage />} />
          <Route path="/terms" element={<TermsOfUsePage />} />
          <Route path="/disclaimer" element={<DisclaimerPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/methodology" element={<MethodologyPage />} />

          {/* Coming Soon */}
          <Route path="/coming-soon/:slug" element={<ComingSoonPage />} />

          {/* 404 */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
      <Analytics />
    </BrowserRouter>
  </ErrorBoundary>
);

export default App;
