import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import DashboardLayout from "./layouts/DashboardLayout";
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
import ComplaintsDashboardPage from "./pages/ComplaintsDashboardPage";
import InsiderTradesDashboardPage from "./pages/InsiderTradesDashboardPage";
import FinanceComparePage from "./pages/FinanceComparePage";
import TechDashboardPage from "./pages/TechDashboardPage";
import TechCompaniesPage from "./pages/TechCompaniesPage";
import ErrorBoundary from "./components/ErrorBoundary";
import NotFoundPage from "./pages/NotFoundPage";

const App: React.FC = () => (
  <ErrorBoundary>
    <BrowserRouter>
      <Routes>
        {/* Sector selector */}
        <Route path="/" element={<HomePage />} />

        {/* Politics section — standalone dark pages */}
        <Route path="/politics" element={<PoliticsDashboardPage />} />
        <Route path="/politics/people" element={<PeoplePage />} />
        <Route path="/politics/activity" element={<ActivityFeedPage />} />
        <Route path="/politics/power" element={<BalanceOfPowerPage />} />

        {/* Politics detail pages — standalone dark pages (redesigned) */}
        <Route path="/politics/people/:person_id" element={<PersonProfilePage />} />
        <Route path="/politics/claim/:claim_id" element={<ClaimDetailPage />} />
        <Route path="/politics/bill/:bill_id" element={<BillDetailPage />} />
        <Route path="/politics/vote/:vote_id" element={<VoteDetailPage />} />
        <Route path="/politics/compare" element={<ComparePageNew />} />
        <Route path="/politics/press" element={<DashboardLayout><PressToolsPage /></DashboardLayout>} />

        {/* Finance section */}
        <Route path="/finance" element={<FinanceDashboardPage />} />
        <Route path="/finance/complaints" element={<ComplaintsDashboardPage />} />
        <Route path="/finance/insider-trades" element={<InsiderTradesDashboardPage />} />
        <Route path="/finance/compare" element={<FinanceComparePage />} />
        <Route path="/finance/:institution_id" element={<InstitutionPage />} />

        {/* Technology section */}
        <Route path="/technology" element={<TechDashboardPage />} />
        <Route path="/technology/companies" element={<TechCompaniesPage />} />

        {/* Coming Soon */}
        <Route path="/coming-soon/:slug" element={<ComingSoonPage />} />

        {/* 404 */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  </ErrorBoundary>
);

export default App;
