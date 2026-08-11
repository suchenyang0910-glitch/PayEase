import { Navigate, Route, Routes } from "react-router-dom";
import { LoginPage } from "./pages/LoginPage";
import { EmploymentListPage } from "./pages/EmploymentListPage";
import { EmploymentDetailPage } from "./pages/EmploymentDetailPage";

export function App(): JSX.Element {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/employment/list" element={<EmploymentListPage />} />
      <Route path="/employment/:id" element={<EmploymentDetailPage />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
