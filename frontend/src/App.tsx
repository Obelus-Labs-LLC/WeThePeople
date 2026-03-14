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
import ComingSoonPage from "./pages/ComingSoonPage";
import FinanceDashboardPage from "./pages/FinanceDashboardPage";
import InstitutionPage from "./pages/InstitutionPage";
import NewsRegulatoryPage from "./pages/NewsRegulatoryPage";
import InsiderTradesDashboardPage from "./pages/InsiderTradesDashboardPage";
import FinanceComparePage from "./pages/FinanceComparePage";
import InstitutionDirectoryPage from "./pages/InstitutionDirectoryPage";
import TechLayout from "./layouts/TechLayout";
import TechDashboardPage from "./pages/TechDashboardPage";
import TechCompaniesPage from "./pages/TechCompaniesPage";
import TechComparePage from "./pages/TechComparePage";
import ErrorBoundary from "./components/ErrorBoundary";
import NotFoundPage from "./pages/NotFoundPage";

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
        <Route path="/politics/press" element={<PoliticsLayout><DashboardLayout><PressToolsPage /></DashboardLayout></PoliticsLayout>} />

        {/* Finance section — all wrapped in FinanceLayout (Waves bg) */}
        <Route path="/finance" element={<FinanceLayout><FinanceDashboardPage /></FinanceLayout>} />
        <Route path="/finance/news" element={<FinanceLayout><NewsRegulatoryPage /></FinanceLayout>} />
        <Route path="/finance/insider-trades" element={<FinanceLayout><InsiderTradesDashboardPage /></FinanceLayout>} />
        <Route path="/finance/institutions" element={<FinanceLayout><InstitutionDirectoryPage /></FinanceLayout>} />
        <Route path="/finance/compare" element={<FinanceLayout><FinanceComparePage /></FinanceLayout>} />
        <Route path="/finance/:institution_id" element={<FinanceLayout><InstitutionPage /></FinanceLayout>} />

        {/* Technology section — all wrapped in TechLayout (MagicRings bg) */}
        <Route path="/technology" element={<TechLayout><TechDashboardPage /></TechLayout>} />
        <Route path="/technology/companies" element={<TechLayout><TechCompaniesPage /></TechLayout>} />
        <Route path="/technology/compare" element={<TechLayout><TechComparePage /></TechLayout>} />

        {/* Coming Soon */}
        <Route path="/coming-soon/:slug" element={<ComingSoonPage />} />

        {/* 404 */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  </ErrorBoundary>
);

export default App;
