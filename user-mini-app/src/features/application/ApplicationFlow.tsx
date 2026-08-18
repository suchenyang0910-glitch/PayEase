import {
  APPLICATION_FORM_STEPS,
  type ApplicationFormStep,
} from "../../hooks/useApplicationDraft.ts";

type LanguageCopy = Readonly<Record<string, string>>;

type ApplicationCopy = Readonly<{
  preparation: string;
  basicProfile: string;
  address: string;
  identityContacts: string;
  contact1: string;
  contact1Phone: string;
  contact2: string;
  contact2Phone: string;
  employerPayout: string;
  bankName: string;
  bankAccount: string;
  accountHolder: string;
  supplements: string;
  liveness: string;
  wealthProof: string;
  agreement: string;
  agreementSummary: string;
  submitConfirm: string;
  confirmSummary: string;
}>;

type StepCopy = Readonly<
  Record<ApplicationFormStep, { title: string; hint: string }>
>;

type StepNavigationCopy = Readonly<{
  previous: string;
  saved: string;
  next: string;
  summary: string;
  completedLabel: string;
}>;

type PhoneCopy = Readonly<{
  verified: string;
  required: string;
  check: string;
  request: string;
  refresh: string;
  sent: string;
  cancelled: string;
  unsupported: string;
}>;

type FactoryCopy = Readonly<{
  factory: string;
  factoryPlaceholder: string;
  identityType: string;
  nationalId: string;
  passport: string;
  identityNumber: string;
}>;

type EmployerTenant = Readonly<{
  id: string;
  displayName: string;
}>;

type PhoneVerification = Readonly<{
  verified: boolean;
  required: boolean;
}>;

type SummaryItem = Readonly<{
  label: string;
  value: string;
}>;

type ApplicationFlowProps = Readonly<{
  stage: "welcome" | "details";
  t: LanguageCopy;
  applicationCopy: ApplicationCopy;
  stepCopy: StepCopy;
  stepNavCopy: StepNavigationCopy;
  phoneCopy: PhoneCopy;
  factoryCopy: FactoryCopy;
  amountOptions: readonly number[];
  terms: readonly number[];
  amountInput: string;
  term: number;
  requestedAmountDisplay: string;
  showPreviewBadge: boolean;
  formStep: ApplicationFormStep;
  formStepIndex: number;
  employerTenants: readonly EmployerTenant[];
  phoneVerification?: PhoneVerification;
  phoneVerificationNotice: string;
  applicantSession: boolean;
  residentialAddress: string;
  name: string;
  phone: string;
  employer: string;
  emergencyContactOneName: string;
  emergencyContactOnePhone: string;
  emergencyContactTwoName: string;
  emergencyContactTwoPhone: string;
  employerTenantId: string;
  identityDocumentType: "NATIONAL_ID" | "PASSPORT";
  identityDocumentNumber: string;
  bankName: string;
  bankAccountNumber: string;
  bankAccountHolder: string;
  livenessPrepared: boolean;
  wealthProofAttached: boolean;
  consent: boolean;
  summaryItems: readonly SummaryItem[];
  loading: boolean;
  renderError: () => JSX.Element | null;
  onAmountInputChange: (value: string) => void;
  onTermChange: (value: number) => void;
  onStart: () => void;
  onBack: () => void;
  onSelectStep: (step: ApplicationFormStep) => void;
  onSaveCurrentStep: () => void;
  onSubmit: () => void;
  onResidentialAddressChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onPhoneChange: (value: string) => void;
  onEmployerChange: (value: string) => void;
  onContactOneNameChange: (value: string) => void;
  onContactOnePhoneChange: (value: string) => void;
  onContactTwoNameChange: (value: string) => void;
  onContactTwoPhoneChange: (value: string) => void;
  onCheckPhoneVerification: () => void;
  onRequestPhoneContact: () => void;
  onEmployerTenantChange: (value: string) => void;
  onIdentityDocumentTypeChange: (value: "NATIONAL_ID" | "PASSPORT") => void;
  onIdentityDocumentNumberChange: (value: string) => void;
  onBankNameChange: (value: string) => void;
  onBankAccountNumberChange: (value: string) => void;
  onBankAccountHolderChange: (value: string) => void;
  onLivenessPreparedChange: (value: boolean) => void;
  onWealthProofAttachedChange: (value: boolean) => void;
  onConsentChange: (value: boolean) => void;
}>;

export function ApplicationFlow({
  stage,
  t,
  applicationCopy,
  stepCopy,
  stepNavCopy,
  phoneCopy,
  factoryCopy,
  amountOptions,
  terms,
  amountInput,
  term,
  requestedAmountDisplay,
  showPreviewBadge,
  formStep,
  formStepIndex,
  employerTenants,
  phoneVerification,
  phoneVerificationNotice,
  applicantSession,
  residentialAddress,
  name,
  phone,
  employer,
  emergencyContactOneName,
  emergencyContactOnePhone,
  emergencyContactTwoName,
  emergencyContactTwoPhone,
  employerTenantId,
  identityDocumentType,
  identityDocumentNumber,
  bankName,
  bankAccountNumber,
  bankAccountHolder,
  livenessPrepared,
  wealthProofAttached,
  consent,
  summaryItems,
  loading,
  renderError,
  onAmountInputChange,
  onTermChange,
  onStart,
  onBack,
  onSelectStep,
  onSaveCurrentStep,
  onSubmit,
  onResidentialAddressChange,
  onNameChange,
  onPhoneChange,
  onEmployerChange,
  onContactOneNameChange,
  onContactOnePhoneChange,
  onContactTwoNameChange,
  onContactTwoPhoneChange,
  onCheckPhoneVerification,
  onRequestPhoneContact,
  onEmployerTenantChange,
  onIdentityDocumentTypeChange,
  onIdentityDocumentNumberChange,
  onBankNameChange,
  onBankAccountNumberChange,
  onBankAccountHolderChange,
  onLivenessPreparedChange,
  onWealthProofAttachedChange,
  onConsentChange,
}: ApplicationFlowProps): JSX.Element {
  return (
    <section className="application-card">
      {stage === "welcome" ? (
        <>
          <p className="response-note">{applicationCopy.preparation}</p>
          <div className="card-heading">
            <span>{t.amount}</span>
            <b>{t.usd}</b>
          </div>
          <div className="amount-display">{requestedAmountDisplay}</div>
          <div className="choices">
            {amountOptions.map((value) => (
              <button
                key={value}
                className={amountInput === String(value) ? "selected" : ""}
                onClick={() => onAmountInputChange(String(value))}
              >
                ${value}
              </button>
            ))}
          </div>
          <label className="field-label" htmlFor="requested-amount">
            {t.customAmount}
          </label>
          <input
            id="requested-amount"
            className="amount-input"
            value={amountInput}
            onChange={(event) => onAmountInputChange(event.target.value)}
            inputMode="decimal"
            autoComplete="off"
            aria-describedby="requested-amount-hint"
          />
          <p id="requested-amount-hint" className="amount-hint">
            USD 10.00–500.00
          </p>
          <label className="field-label">{t.term}</label>
          <div className="term-choices">
            {terms.map((value) => (
              <button
                key={value}
                className={term === value ? "selected" : ""}
                onClick={() => onTermChange(value)}
              >
                {value}d
              </button>
            ))}
          </div>
          <p className="estimate-note">{t.noOffer}</p>
          {showPreviewBadge ? (
            <p className="response-note" role="status">
              {t.previewReadOnly}
            </p>
          ) : null}
          {renderError()}
          <button
            className="primary"
            data-testid="applicant-entry-submit-button"
            disabled={showPreviewBadge}
            onClick={onStart}
          >
            {t.start}
            <span>→</span>
          </button>
        </>
      ) : (
        <>
          <button className="back-link" onClick={onBack}>
            ← {formStepIndex === 0 ? t.back : stepNavCopy.previous}
          </button>
          <h2>{t.details}</h2>
          <p className="form-intro">{t.formIntro}</p>
          <section
            className="application-stepper"
            aria-label="Application draft steps"
          >
            {APPLICATION_FORM_STEPS.map((step, index) => {
              const active = index === formStepIndex;
              const completed = index < formStepIndex;
              const selectable = index <= formStepIndex;
              return (
                <button
                  key={step}
                  type="button"
                  className={
                    active
                      ? "application-stepper__item application-stepper__item--active"
                      : completed
                        ? "application-stepper__item application-stepper__item--done"
                        : "application-stepper__item"
                  }
                  onClick={() => {
                    if (selectable) onSelectStep(step);
                  }}
                  disabled={!selectable}
                  aria-current={active ? "step" : undefined}
                >
                  <strong>{index + 1}</strong>
                  <span>{stepCopy[step].title}</span>
                </button>
              );
            })}
          </section>
          <section className="application-step-card">
            <div className="application-step-card__header">
              <h3>{stepCopy[formStep].title}</h3>
              <p>{stepCopy[formStep].hint}</p>
            </div>
            <p className="response-note">{stepNavCopy.saved}</p>
            {formStep === "profile" ? (
              <>
                <section className="application-stage-group">
                  <h3>{applicationCopy.basicProfile}</h3>
                  <label>
                    {applicationCopy.address}
                    <input
                      value={residentialAddress}
                      onChange={(event) =>
                        onResidentialAddressChange(event.target.value)
                      }
                      placeholder={applicationCopy.address}
                      autoComplete="street-address"
                    />
                  </label>
                </section>
                <label>
                  {t.name}
                  <input
                    value={name}
                    onChange={(event) => onNameChange(event.target.value)}
                    placeholder={t.name}
                    autoComplete="name"
                  />
                </label>
                <label>
                  {t.phone}
                  <input
                    value={phone}
                    onChange={(event) => onPhoneChange(event.target.value)}
                    placeholder="+855 …"
                    inputMode="tel"
                    autoComplete="tel"
                    maxLength={32}
                  />
                </label>
                <label>
                  {t.employer}
                  <input
                    value={employer}
                    onChange={(event) => onEmployerChange(event.target.value)}
                    placeholder={t.employer}
                  />
                </label>
              </>
            ) : null}
            {formStep === "contacts" ? (
              <>
                <section className="application-stage-group">
                  <h3>{applicationCopy.identityContacts}</h3>
                </section>
                {phoneVerification ? (
                  <section
                    className="next-payment"
                    aria-label="Telegram phone verification"
                  >
                    <strong>
                      {phoneVerification.verified
                        ? phoneCopy.verified
                        : phoneVerification.required
                          ? phoneCopy.required
                          : phoneCopy.check}
                    </strong>
                    {phoneVerification.required &&
                    !phoneVerification.verified ? (
                      <div className="term-choices">
                        <button type="button" onClick={onRequestPhoneContact}>
                          {phoneCopy.request}
                        </button>
                        <button
                          type="button"
                          onClick={onCheckPhoneVerification}
                        >
                          {phoneCopy.refresh}
                        </button>
                      </div>
                    ) : null}
                    {phoneVerificationNotice ? (
                      <small>{phoneVerificationNotice}</small>
                    ) : null}
                  </section>
                ) : (
                  <section
                    className="next-payment"
                    aria-label="Telegram phone verification"
                  >
                    <button
                      type="button"
                      onClick={onCheckPhoneVerification}
                      disabled={!applicantSession}
                    >
                      {phoneCopy.check}
                    </button>
                  </section>
                )}
                <label>
                  {applicationCopy.contact1}
                  <input
                    value={emergencyContactOneName}
                    onChange={(event) =>
                      onContactOneNameChange(event.target.value)
                    }
                    placeholder={applicationCopy.contact1}
                    autoComplete="off"
                  />
                </label>
                <label>
                  {applicationCopy.contact1Phone}
                  <input
                    value={emergencyContactOnePhone}
                    onChange={(event) =>
                      onContactOnePhoneChange(event.target.value)
                    }
                    placeholder="+855 …"
                    inputMode="tel"
                    autoComplete="off"
                  />
                </label>
                <label>
                  {applicationCopy.contact2}
                  <input
                    value={emergencyContactTwoName}
                    onChange={(event) =>
                      onContactTwoNameChange(event.target.value)
                    }
                    placeholder={applicationCopy.contact2}
                    autoComplete="off"
                  />
                </label>
                <label>
                  {applicationCopy.contact2Phone}
                  <input
                    value={emergencyContactTwoPhone}
                    onChange={(event) =>
                      onContactTwoPhoneChange(event.target.value)
                    }
                    placeholder="+855 …"
                    inputMode="tel"
                    autoComplete="off"
                  />
                </label>
              </>
            ) : null}
            {formStep === "payout" ? (
              <>
                <section className="application-stage-group">
                  <h3>{applicationCopy.employerPayout}</h3>
                </section>
                <label>
                  {factoryCopy.factory}
                  <select
                    aria-label={factoryCopy.factory}
                    value={employerTenantId}
                    onChange={(event) =>
                      onEmployerTenantChange(event.target.value)
                    }
                  >
                    <option value="">{factoryCopy.factoryPlaceholder}</option>
                    {employerTenants.map((tenant) => (
                      <option key={tenant.id} value={tenant.id}>
                        {tenant.displayName}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {factoryCopy.identityType}
                  <select
                    aria-label={factoryCopy.identityType}
                    value={identityDocumentType}
                    onChange={(event) =>
                      onIdentityDocumentTypeChange(
                        event.target.value as "NATIONAL_ID" | "PASSPORT",
                      )
                    }
                  >
                    <option value="NATIONAL_ID">
                      {factoryCopy.nationalId}
                    </option>
                    <option value="PASSPORT">{factoryCopy.passport}</option>
                  </select>
                </label>
                <label>
                  {factoryCopy.identityNumber}
                  <input
                    value={identityDocumentNumber}
                    onChange={(event) =>
                      onIdentityDocumentNumberChange(event.target.value)
                    }
                    placeholder={factoryCopy.identityNumber}
                    autoComplete="off"
                    maxLength={64}
                  />
                </label>
                <label>
                  {applicationCopy.bankName}
                  <input
                    value={bankName}
                    onChange={(event) => onBankNameChange(event.target.value)}
                    placeholder={applicationCopy.bankName}
                    autoComplete="off"
                  />
                </label>
                <label>
                  {applicationCopy.bankAccount}
                  <input
                    value={bankAccountNumber}
                    onChange={(event) =>
                      onBankAccountNumberChange(event.target.value)
                    }
                    placeholder={applicationCopy.bankAccount}
                    autoComplete="off"
                    inputMode="numeric"
                  />
                </label>
                <label>
                  {applicationCopy.accountHolder}
                  <input
                    value={bankAccountHolder}
                    onChange={(event) =>
                      onBankAccountHolderChange(event.target.value)
                    }
                    placeholder={applicationCopy.accountHolder}
                    autoComplete="name"
                  />
                </label>
              </>
            ) : null}
            {formStep === "supplements" ? (
              <section className="application-stage-group">
                <h3>{applicationCopy.supplements}</h3>
                <label className="consent">
                  <input
                    type="checkbox"
                    checked={livenessPrepared}
                    onChange={(event) =>
                      onLivenessPreparedChange(event.target.checked)
                    }
                  />
                  <span>{applicationCopy.liveness}</span>
                </label>
                <label className="consent">
                  <input
                    type="checkbox"
                    checked={wealthProofAttached}
                    onChange={(event) =>
                      onWealthProofAttachedChange(event.target.checked)
                    }
                  />
                  <span>{applicationCopy.wealthProof}</span>
                </label>
              </section>
            ) : null}
            {formStep === "confirm" ? (
              <>
                <section className="application-stage-group">
                  <h3>{applicationCopy.agreement}</h3>
                  <p className="response-note">
                    {applicationCopy.agreementSummary}
                  </p>
                </section>
                <label className="consent consent--confirm">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(event) => onConsentChange(event.target.checked)}
                  />
                  <span className="consent__content">
                    <span className="consent__label">{t.consent}</span>
                    <span className="consent__hint">
                      {applicationCopy.agreementSummary}
                    </span>
                  </span>
                </label>
                <section className="application-stage-group">
                  <h3>{applicationCopy.submitConfirm}</h3>
                  <p className="response-note">
                    {applicationCopy.confirmSummary}
                  </p>
                </section>
                <section className="application-summary">
                  <div className="application-summary__header">
                    <strong>{stepNavCopy.summary}</strong>
                    <small>{stepNavCopy.completedLabel}</small>
                  </div>
                  <dl className="application-summary__list">
                    {summaryItems.map((item) => (
                      <div key={item.label}>
                        <dt>{item.label}</dt>
                        <dd>{item.value}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              </>
            ) : null}
          </section>
          {renderError()}
          <div className="application-step-actions">
            {formStep !== "confirm" ? (
              <button
                className="primary"
                disabled={loading}
                onClick={onSaveCurrentStep}
              >
                {stepNavCopy.next}
                <span>→</span>
              </button>
            ) : (
              <button className="primary" disabled={loading} onClick={onSubmit}>
                {loading ? "…" : t.send}
                <span>→</span>
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
