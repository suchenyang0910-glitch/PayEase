import { useEffect, useRef } from "react";

export type ApplicationFormStep =
  "profile" | "contacts" | "payout" | "supplements" | "confirm";

type ApplicationDraftStage = "welcome" | "details";

export type ApplicationDraftValues = Readonly<{
  amountInput: string;
  term: number;
  name: string;
  residentialAddress: string;
  phone: string;
  employer: string;
  emergencyContactOneName: string;
  emergencyContactOnePhone: string;
  emergencyContactTwoName: string;
  emergencyContactTwoPhone: string;
  employerTenantId: string;
  bankName: string;
  bankAccountNumber: string;
  bankAccountHolder: string;
  identityDocumentType: "NATIONAL_ID" | "PASSPORT";
  identityDocumentNumber: string;
  livenessPrepared: boolean;
  wealthProofAttached: boolean;
  consent: boolean;
}>;

type StoredApplicationDraft = Readonly<{
  version: 1;
  ownerKey: string;
  stage: ApplicationDraftStage;
  formStep: ApplicationFormStep;
}> &
  ApplicationDraftValues;

type ServerApplicationDraft = Omit<StoredApplicationDraft, "ownerKey">;

type TelegramWebApp = Readonly<{
  initDataUnsafe?: { user?: { id?: number } };
}>;

type UseApplicationDraftArgs = Readonly<{
  applicantSession: boolean;
  applicantRequest: (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise<Response>;
  currentValues: ApplicationDraftValues;
  currentFormStep: ApplicationFormStep;
  recoverApplicantSession: () => Promise<void> | void;
  restoreValues: (values: ApplicationDraftValues) => void;
  setFormStep: (step: ApplicationFormStep) => void;
  setStage: (stage: ApplicationDraftStage) => void;
  skipRestore: boolean;
}>;

type DraftResponse = Readonly<{
  draft: ServerApplicationDraft | null;
}>;

const APPLICATION_DRAFT_STORAGE_KEY = "payease.application-draft.v1";

export const APPLICATION_FORM_STEPS: readonly ApplicationFormStep[] = [
  "profile",
  "contacts",
  "payout",
  "supplements",
  "confirm",
] as const;

function telegramWebApp(): TelegramWebApp | undefined {
  return (
    window as Window & {
      Telegram?: { WebApp?: TelegramWebApp };
    }
  ).Telegram?.WebApp;
}

function applicationDraftOwnerKey(): string {
  const telegramId = telegramWebApp()?.initDataUnsafe?.user?.id;
  return telegramId ? `telegram-${telegramId}` : "local";
}

function readStoredApplicationDraft(): StoredApplicationDraft | undefined {
  try {
    const raw = window.localStorage.getItem(APPLICATION_DRAFT_STORAGE_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<StoredApplicationDraft>;
    if (
      parsed.version !== 1 ||
      parsed.ownerKey !== applicationDraftOwnerKey() ||
      !APPLICATION_FORM_STEPS.includes(
        parsed.formStep as ApplicationFormStep,
      ) ||
      (parsed.stage !== "welcome" && parsed.stage !== "details")
    ) {
      return undefined;
    }
    return {
      version: 1,
      ownerKey: parsed.ownerKey,
      stage: parsed.stage,
      formStep: parsed.formStep as ApplicationFormStep,
      amountInput:
        typeof parsed.amountInput === "string" ? parsed.amountInput : "50",
      term: parsed.term === 15 ? 15 : 30,
      name: typeof parsed.name === "string" ? parsed.name : "",
      residentialAddress:
        typeof parsed.residentialAddress === "string"
          ? parsed.residentialAddress
          : "",
      phone: typeof parsed.phone === "string" ? parsed.phone : "",
      employer: typeof parsed.employer === "string" ? parsed.employer : "",
      emergencyContactOneName:
        typeof parsed.emergencyContactOneName === "string"
          ? parsed.emergencyContactOneName
          : "",
      emergencyContactOnePhone:
        typeof parsed.emergencyContactOnePhone === "string"
          ? parsed.emergencyContactOnePhone
          : "",
      emergencyContactTwoName:
        typeof parsed.emergencyContactTwoName === "string"
          ? parsed.emergencyContactTwoName
          : "",
      emergencyContactTwoPhone:
        typeof parsed.emergencyContactTwoPhone === "string"
          ? parsed.emergencyContactTwoPhone
          : "",
      employerTenantId:
        typeof parsed.employerTenantId === "string"
          ? parsed.employerTenantId
          : "",
      bankName: typeof parsed.bankName === "string" ? parsed.bankName : "",
      bankAccountNumber:
        typeof parsed.bankAccountNumber === "string"
          ? parsed.bankAccountNumber
          : "",
      bankAccountHolder:
        typeof parsed.bankAccountHolder === "string"
          ? parsed.bankAccountHolder
          : "",
      identityDocumentType:
        parsed.identityDocumentType === "PASSPORT" ? "PASSPORT" : "NATIONAL_ID",
      identityDocumentNumber:
        typeof parsed.identityDocumentNumber === "string"
          ? parsed.identityDocumentNumber
          : "",
      livenessPrepared: parsed.livenessPrepared === true,
      wealthProofAttached: parsed.wealthProofAttached === true,
      consent: parsed.consent === true,
    };
  } catch {
    return undefined;
  }
}

export function useApplicationDraft({
  applicantSession,
  applicantRequest,
  currentValues,
  currentFormStep,
  recoverApplicantSession,
  restoreValues,
  setFormStep,
  setStage,
  skipRestore,
}: UseApplicationDraftArgs) {
  const restoreValuesRef = useRef(restoreValues);
  const applicantRequestRef = useRef(applicantRequest);
  const recoverApplicantSessionRef = useRef(recoverApplicantSession);
  const restoredLocalDraft = useRef(false);
  const restoredServerDraft = useRef(false);

  useEffect(() => {
    restoreValuesRef.current = restoreValues;
  }, [restoreValues]);

  useEffect(() => {
    applicantRequestRef.current = applicantRequest;
    recoverApplicantSessionRef.current = recoverApplicantSession;
  }, [applicantRequest, recoverApplicantSession]);

  function applyDraft(draft: StoredApplicationDraft) {
    restoreValuesRef.current({
      amountInput: draft.amountInput,
      term: draft.term,
      name: draft.name,
      residentialAddress: draft.residentialAddress,
      phone: draft.phone,
      employer: draft.employer,
      emergencyContactOneName: draft.emergencyContactOneName,
      emergencyContactOnePhone: draft.emergencyContactOnePhone,
      emergencyContactTwoName: draft.emergencyContactTwoName,
      emergencyContactTwoPhone: draft.emergencyContactTwoPhone,
      employerTenantId: draft.employerTenantId,
      bankName: draft.bankName,
      bankAccountNumber: draft.bankAccountNumber,
      bankAccountHolder: draft.bankAccountHolder,
      identityDocumentType: draft.identityDocumentType,
      identityDocumentNumber: draft.identityDocumentNumber,
      livenessPrepared: draft.livenessPrepared,
      wealthProofAttached: draft.wealthProofAttached,
      consent: draft.consent,
    });
    setStage(draft.stage);
    setFormStep(draft.formStep);
  }

  function buildDraft(
    overrides: Partial<Pick<StoredApplicationDraft, "stage" | "formStep">> = {},
  ): StoredApplicationDraft {
    return {
      version: 1,
      ownerKey: applicationDraftOwnerKey(),
      stage: overrides.stage ?? "details",
      formStep: overrides.formStep ?? currentFormStep,
      ...currentValues,
    };
  }

  async function syncDraftToServer(draft: StoredApplicationDraft) {
    const { ownerKey: _ownerKey, ...serverDraft } = draft;
    const response = await applicantRequestRef.current(
      "/api/v1/local/public/application-draft",
      {
        method: "PUT",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(serverDraft),
      },
    );
    if (response.status === 401 || response.status === 403) {
      await recoverApplicantSessionRef.current();
    }
  }

  async function clearPersistedApplicationDraft() {
    try {
      window.localStorage.removeItem(APPLICATION_DRAFT_STORAGE_KEY);
    } catch {
      /* ignore storage access failures in embedded webviews */
    }
    if (!applicantSession) return;
    try {
      const response = await applicantRequestRef.current(
        "/api/v1/local/public/application-draft",
        { method: "DELETE", credentials: "include" },
      );
      if (response.status === 401 || response.status === 403) {
        await recoverApplicantSessionRef.current();
      }
    } catch {
      /* keep local clear even if server deletion is temporarily unavailable */
    }
  }

  async function persistApplicationDraft(
    overrides: Partial<Pick<StoredApplicationDraft, "stage" | "formStep">> = {},
  ) {
    const draft = buildDraft(overrides);
    try {
      window.localStorage.setItem(
        APPLICATION_DRAFT_STORAGE_KEY,
        JSON.stringify(draft),
      );
    } catch {
      /* ignore storage access failures in embedded webviews */
    }
    if (!applicantSession) return;
    try {
      await syncDraftToServer(draft);
    } catch {
      /* preserve local draft when server persistence is temporarily unavailable */
    }
  }

  useEffect(() => {
    if (skipRestore || applicantSession || restoredLocalDraft.current) return;
    restoredLocalDraft.current = true;
    const draft = readStoredApplicationDraft();
    if (!draft) return;
    applyDraft(draft);
  }, [applicantSession, setFormStep, setStage, skipRestore]);

  useEffect(() => {
    if (skipRestore || !applicantSession || restoredServerDraft.current) return;
    restoredServerDraft.current = true;
    let cancelled = false;

    void (async () => {
      const restoreLocalFallback = async () => {
        const localDraft = readStoredApplicationDraft();
        if (!localDraft || cancelled) return;
        applyDraft(localDraft);
        try {
          await syncDraftToServer(localDraft);
        } catch {
          /* local draft remains the fallback source when sync fails */
        }
      };

      try {
        const response = await applicantRequestRef.current(
          "/api/v1/local/public/application-draft",
          { credentials: "include" },
        );
        if (response.status === 401 || response.status === 403) {
          await recoverApplicantSessionRef.current();
          return;
        }
        if (!response.ok) {
          await restoreLocalFallback();
          return;
        }
        const payload = (await response
          .json()
          .catch(() => ({ draft: null }))) as DraftResponse;
        if (cancelled) return;
        if (payload.draft) {
          const localDraft: StoredApplicationDraft = {
            ownerKey: applicationDraftOwnerKey(),
            ...payload.draft,
          };
          try {
            window.localStorage.setItem(
              APPLICATION_DRAFT_STORAGE_KEY,
              JSON.stringify(localDraft),
            );
          } catch {
            /* local storage sync is optional */
          }
          applyDraft(localDraft);
          return;
        }
        await restoreLocalFallback();
      } catch {
        await restoreLocalFallback();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applicantSession, skipRestore]);

  return {
    clearPersistedApplicationDraft,
    persistApplicationDraft,
  };
}
