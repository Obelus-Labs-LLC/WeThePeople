import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import DashboardLayout from "./layouts/DashboardLayout";
import PoliticsLayout from "./layouts/PoliticsLayout";
import FinanceLayout from "./layouts/FinanceLayout";
import HomePage from "./pages/HomePage";
import PoliticsDashboardPage from "./pages/PoliticsDashboardPage";
import PeoplePage from "./pages/PeoplePage";
import PersonProfilePage from "./pages/PersonProfilePage";
import ClaimDetailPage from "./pages/ClaimDetailPage";
import BillDetailPage from "./pages/BillDetailPage";
import VoteDetailPage from "./pages/VoteDetailPage";
import ComparePageNew from "./pages/ComparePageNew";
import PressToolsPage from "./pages/PressToolsPage";
import ActivityFeedPage from "./pages/ActivityFeedPage";
import BalanceOfPowerPage from "./pages/BalanceOfPowerPage";
import LegislationTrackerPage from "./pages/LegislationTrackerPage";
import CommitteesPage from "./pages/CommitteesPage";
import RepresentativeLookupPage from "./pages/RepresentativeLookupPage";
import ComingSoonPage from "./pages/ComingSoonPage";
import FinanceDashboardPage from "./pages/FinanceDashboardPage";
import InstitutionPage from "./pages/InstitutionPage";
import NewsRegulatoryPage from "./pages/NewsRegulatoryPage";
import InsiderTradesDashboardPage from "./pages/InsiderTradesDashboardPage";
import FinanceComparePage from "./pages/FinanceComparePage";
import InstitutionDirectoryPage from "./pages/InstitutionDirectoryPage";
import MarketMoversPage from "./pages/MarketMoversPage";
import TechLayout from "./layouts/TechLayout";
import TechDashboardPage from "./pages/TechDashboardPage";
import TechCompaniesPage from "./pages/TechCompaniesPage";
import TechComparePage from "./pages/TechComparePage";
import TechCompanyProfilePage from "./pages/TechCompanyProfilePage";
import PatentSearchPage from "./pages/PatentSearchPage";
import LobbyingBreakdownPage from "./pages/LobbyingBreakdownPage";
import ContractTimelinePage from "./pages/ContractTimelinePage";
import EnforcementTrackerPage from "./pages/EnforcementTrackerPage";
import HealthLayout from "./layouts/HealthLayout";
import HealthDashboardPage from "./pages/HealthDashboardPage";
import HealthCompaniesPage from "./pages/HealthCompaniesPage";
import HealthComparePage from "./pages/HealthComparePage";
import HealthCompanyProfilePage from "./pages/HealthCompanyProfilePage";
import DrugLookupPage from "./pages/DrugLookupPage";
import ClinicalTrialPipelinePage from "./pages/ClinicalTrialPipelinePage";
import FDAApprovalsPage from "./pages/FDAApprovalsPage";
import EnergyLayout from "./layouts/EnergyLayout";
import EnergyDashboardPage from "./pages/EnergyDashboardPage";
import EnergyCompaniesPage from "./pages/EnergyCompaniesPage";
import EnergyCompanyProfilePage from "./pages/EnergyCompanyProfilePage";
import EnergyComparePage from "./pages/EnergyComparePage";
import CongressionalTradesPage from "./pages/CongressionalTradesPage";
import InfluenceExplorerPage from "./pages/InfluenceExplorerPage";
import ErrorBoundary from "./components/ErrorBoundary";
import NotFoundPage from "./pages/NotFoundPage";
import PrivacyPolicyPage from "./pages/PrivacyPolicyPage";
import TermsOfUsePage from "./pages/TermsOfUsePage";
import DisclaimerPage from "./pages/DisclaimerPage";
import AboutPage from "./pages/AboutPage";

const App: React.FC = () => (
  <ErrorBoundary>
    <BrowserRouter>
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
        <Route path="/politics/press" element={<PoliticsLayout><DashboardLayout><PressToolsPage /></DashboardLayout></PoliticsLayout>} />

        {/* Cross-sector Influence Explorer */}
        <Route path="/influence" element={<InfluenceExplorerPage />} />

        {/* Finance section — all wrapped in FinanceLayout (Waves bg) */}
        <Route path="/finance" element={<FinanceLayout><FinanceDashboardPage /></FinanceLayout>} />
        <Route path="/finance/news" element={<FinanceLayout><NewsRegulatoryPage /></FinanceLayout>} />
        <Route path="/finance/insider-trades" element={<FinanceLayout><InsiderTradesDashboardPage /></FinanceLayout>} />
        <Route path="/finance/institutions" element={<FinanceLayout><InstitutionDirectoryPage /></FinanceLayout>} />
        <Route path="/finance/compare" element={<FinanceLayout><FinanceComparePage /></FinanceLayout>} />
        <Route path="/finance/market-movers" element={<FinanceLayout><MarketMoversPage /></FinanceLayout>} />
        <Route path="/finance/:institution_id" element={<FinanceLayout><InstitutionPage /></FinanceLayout>} />

        {/* Technology section — all wrapped in TechLayout (MagicRings bg) */}
        <Route path="/technology" element={<TechLayout><TechDashboardPage /></TechLayout>} />
        <Route path="/technology/companies" element={<TechLayout><TechCompaniesPage /></TechLayout>} />
        <Route path="/technology/compare" element={<TechLayout><TechComparePage /></TechLayout>} />
        <Route path="/technology/patents" element={<TechLayout><PatentSearchPage /></TechLayout>} />
        <Route path="/technology/lobbying" element={<TechLayout><LobbyingBreakdownPage /></TechLayout>} />
        <Route path="/technology/contracts" element={<TechLayout><ContractTimelinePage /></TechLayout>} />
        <Route path="/technology/enforcement" element={<TechLayout><EnforcementTrackerPage /></TechLayout>} />
        <Route path="/technology/:companyId" element={<TechLayout><TechCompanyProfilePage /></TechLayout>} />

        {/* Health section — all wrapped in HealthLayout (Silk bg) */}
        <Route path="/health" element={<HealthLayout><HealthDashboardPage /></HealthLayout>} />
        <Route path="/health/companies" element={<HealthLayout><HealthCompaniesPage /></HealthLayout>} />
        <Route path="/health/compare" element={<HealthLayout><HealthComparePage /></HealthLayout>} />
        <Route path="/health/drugs" element={<HealthLayout><DrugLookupPage /></HealthLayout>} />
        <Route path="/health/pipeline" element={<HealthLayout><ClinicalTrialPipelinePage /></HealthLayout>} />
        <Route path="/health/fda-approvals" element={<HealthLayout><FDAApprovalsPage /></HealthLayout>} />
        <Route path="/health/:companyId" element={<HealthLayout><HealthCompanyProfilePage /></HealthLayout>} />

        {/* Energy section — all wrapped in EnergyLayout (blur-blob bg) */}
        <Route path="/energy" element={<EnergyLayout><EnergyDashboardPage /></EnergyLayout>} />
        <Route path="/energy/companies" element={<EnergyLayout><EnergyCompaniesPage /></EnergyLayout>} />
        <Route path="/energy/compare" element={<EnergyLayout><EnergyComparePage /></EnergyLayout>} />
        <Route path="/energy/:companyId" element={<EnergyLayout><EnergyCompanyProfilePage /></EnergyLayout>} />

        {/* Legal / Info pages */}
        <Route path="/privacy" element={<PrivacyPolicyPage />} />
        <Route path="/terms" element={<TermsOfUsePage />} />
        <Route path="/disclaimer" element={<DisclaimerPage />} />
        <Route path="/about" element={<AboutPage />} />

        {/* Coming Soon */}
        <Route path="/coming-soon/:slug" element={<ComingSoonPage />} />

        {/* 404 */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  </ErrorBoundary>
);

export default App;
