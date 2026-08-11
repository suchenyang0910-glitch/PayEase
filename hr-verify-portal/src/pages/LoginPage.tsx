import { useState } from "react";
import { useNavigate } from "react-router-dom";

export function LoginPage(): JSX.Element {
  const navigate = useNavigate();
  const [loginHint] = useState(
    "S0.5 placeholder: SAML/OIDC enterprise IdP integration deferred until S0.2 isolation infrastructure and S1.0 MVP contract are ready. No real auth, no initData replay, no localStorage token storage.",
  );
  const [username] = useState("hr-officer@example.test");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    setSubmitting(true);
    window.setTimeout(() => {
      // S0.5 constraint (WEB-08): NEVER localStorage setItem for token/session/credential/secret/access/idToken/bearer/jwt/initData/nonce
      // S0.5 constraint: session state is in-memory only in this placeholder
      void navigate("/employment/list");
    }, 120);
  };

  return (
    <main style={{ padding: 32, fontFamily: "system-ui, sans-serif" }}>
      <h1>PayEase HR Verification Portal — Login (S0.5 placeholder)</h1>
      <p style={{ color: "#555", maxWidth: 780 }}>{loginHint}</p>
      <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 380 }}>
        <label>
          Enterprise IdP (SAML/OIDC placeholder)
          <br />
          <input
            type="email"
            defaultValue={username}
            readOnly
            style={{ width: "100%", padding: 8, marginTop: 4 }}
          />
        </label>
        <label>
          Password placeholder
          <br />
          <input
            type="password"
            defaultValue="S0_5_PLACEHOLDER_PASSWORD_NO_REAL_AUTH"
            readOnly
            style={{ width: "100%", padding: 8, marginTop: 4 }}
          />
        </label>
        <button
          type="submit"
          disabled={submitting}
          style={{
            padding: "10px 16px",
            backgroundColor: submitting ? "#ccc" : "#2563eb",
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
        S0.5 constraints applied: X-Frame-Options DENY at vite headers; CSP frame-ancestors none;
        no cross-enterprise API calls; no real credential exchange.
      </footer>
    </main>
  );
}
