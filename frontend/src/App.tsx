import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import DashboardLayout from "./layouts/DashboardLayout";
import HomePage from "./pages/HomePage";
import PoliticsDashboardPage from "./pages/PoliticsDashboardPage";
import PeoplePage from "./pages/PeoplePage";
import PersonPage from "./pages/PersonPage";
import ClaimPage from "./pages/ClaimPage";
import BillPage from "./pages/BillPage";
import ComparePage from "./pages/ComparePage";
import PressToolsPage from "./pages/PressToolsPage";
import ComingSoonPage from "./pages/ComingSoonPage";
import ErrorBoundary from "./components/ErrorBoundary";
import NotFoundPage from "./pages/NotFoundPage";

const App: React.FC = () => (
  <ErrorBoundary>
    <BrowserRouter>
      <Routes>
        {/* Sector selector — no DashboardLayout wrapper */}
        <Route path="/" element={<HomePage />} />

        {/* Politics section — wrapped in DashboardLayout */}
        <Route path="/politics" element={<DashboardLayout><PoliticsDashboardPage /></DashboardLayout>} />
        <Route path="/politics/people" element={<DashboardLayout><PeoplePage /></DashboardLayout>} />
        <Route path="/politics/people/:person_id" element={<DashboardLayout><PersonPage /></DashboardLayout>} />
        <Route path="/politics/claim/:claim_id" element={<DashboardLayout><ClaimPage /></DashboardLayout>} />
        <Route path="/politics/bill/:bill_id" element={<DashboardLayout><BillPage /></DashboardLayout>} />
        <Route path="/politics/compare" element={<DashboardLayout><ComparePage /></DashboardLayout>} />
        <Route path="/politics/press" element={<DashboardLayout><PressToolsPage /></DashboardLayout>} />

        {/* Coming Soon — no DashboardLayout wrapper */}
        <Route path="/coming-soon/:slug" element={<ComingSoonPage />} />

        {/* 404 */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  </ErrorBoundary>
);

export default App;
