import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth-context";
import { AcceptInvitationPage, EnrolMfaPage } from "./pages/EnrollmentPages";
import { DashboardPage } from "./pages/DashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { ForgotPasswordPage, ResetPasswordPage } from "./pages/PasswordPages";
import { ReceiveTransferPage } from "./pages/ReceiveTransferPage";

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/accept-invitation" element={<AcceptInvitationPage />} />
          <Route path="/enrol-mfa" element={<EnrolMfaPage />} />
          <Route path="/receive" element={<ReceiveTransferPage />} />
          <Route path="*" element={<LoginPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
