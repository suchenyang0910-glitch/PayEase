import { Navigate, Route, Routes } from "react-router-dom";
import { LoginPage } from "./pages/LoginPage";
import { RepaymentListPage } from "./pages/RepaymentListPage";
import { ReconciliationPage } from "./pages/ReconciliationPage";

export function App(): JSX.Element {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/repayment/list" element={<RepaymentListPage />} />
      <Route path="/reconciliation" element={<ReconciliationPage />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
