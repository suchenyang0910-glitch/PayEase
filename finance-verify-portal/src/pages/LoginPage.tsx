import { useState } from "react";
import { useNavigate } from "react-router-dom";

export function LoginPage(): JSX.Element {
  const navigate = useNavigate();
  const [loginHint] = useState(
    "S0.5 placeholder: SAML/OIDC finance IdP + bank statement/ERP/GL integration deferred until S0.2 isolation infrastructure and S1.0 MVP contract are ready. No real auth, no real banking API (ABA / Wing / ACLEDA / Stripe / PayWay).",
  );
  const [username] = useState("finance-officer@example.test");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    setSubmitting(true);
    window.setTimeout(() => {
      // WEB-08 / CI-07 constraint: NEVER localStorage token/session/credential/secret/access/idToken/bearer/jwt/initData/nonce
      // Placeholder uses in-memory routing only
      void navigate("/repayment/list");
    }, 120);
  };

  return (
    <main style={{ padding: 32, fontFamily: "system-ui, sans-serif" }}>
      <h1>PayEase Finance Verification Portal — Login (S0.5 placeholder)</h1>
      <p style={{ color: "#555", maxWidth: 820 }}>{loginHint}</p>
      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 380 }}>
        <label>
          Finance IdP (SAML/OIDC placeholder)
          <br />
          <input type="email" defaultValue={username} readOnly style={{ width: "100%", padding: 8, marginTop: 4 }} />
        </label>
        <label>
          Password placeholder
          <br />
          <input
            type="password"
            defaultValue="S0_5_PLACEHOLDER_PASSWORD_NO_REAL_BANK_API"
            readOnly
            style={{ width: "100%", padding: 8, marginTop: 4 }}
          />
        </label>
        <button
          type="submit"
          disabled={submitting}
          style={{
            padding: "10px 16px",
            backgroundColor: submitting ? "#ccc" : "#9333ea",
            color: "white",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
          }}
        >
          {submitting ? "Signing in (mock)..." : "Sign in (mock only)"}
        </button>
      </form>
      <footer style={{ marginTop: 24, color: "#777", fontSize: 12 }}>
        S0.5 constraints applied: X-Frame-Options DENY (finance back-office, per browser security headers baseline);
        CSP frame-ancestors none; zero real bank/ERP/GL/Stripe/PayWay integration.
      </footer>
    </main>
  );
}
