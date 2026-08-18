import { useCallback, useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import type { LanguageCode } from "@payease/v1-domain";
import { applicantSessionRecoveryMessage } from "../applicant-session-message.ts";
import { shouldKeepApplicantSessionAlive } from "../applicant-session-keepalive.ts";
import type { ApplicationHistoryEntry } from "../application-history.ts";

type ApplicantRequest = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

type VerifiedProfileLanguage = Readonly<{
  language?: LanguageCode;
}>;

type ApplicationList = Readonly<{
  preferredLanguage?: LanguageCode;
  applications: ApplicationHistoryEntry[];
}>;

type TelegramEntryPoints = Readonly<{
  entrypoints: unknown;
}>;

type UseApplicantSessionArgs = Readonly<{
  applicantRequest: ApplicantRequest;
  applicantSession: boolean;
  language: LanguageCode;
  setApplicantSession: (value: boolean) => void;
  setLanguage: (value: LanguageCode) => void;
  setError: (value: string) => void;
  setRecoveryEntryPoints: (value: string[]) => void;
  setApplicationHistory: (value: ApplicationHistoryEntry[]) => void;
  setCurrentPage: (value: "profile") => void;
  currentLanguageRef: MutableRefObject<LanguageCode>;
  currentPageRef: MutableRefObject<string>;
  languageChangedByApplicantRef: MutableRefObject<boolean>;
  getTelegramInitData: () => string | undefined;
  readStoredLanguagePreference: () => LanguageCode | undefined;
  normalizeRecoveryEntryPoint: (value: unknown) => string | undefined;
  clearApplicantSensitiveDraft: () => void;
  loadVerifiedProfile: () => Promise<VerifiedProfileLanguage | undefined>;
  checkStatus: (applicationNo: string) => Promise<void>;
}>;

export function useApplicantSession({
  applicantRequest,
  applicantSession,
  language,
  setApplicantSession,
  setLanguage,
  setError,
  setRecoveryEntryPoints,
  setApplicationHistory,
  setCurrentPage,
  currentLanguageRef,
  currentPageRef,
  languageChangedByApplicantRef,
  getTelegramInitData,
  readStoredLanguagePreference,
  normalizeRecoveryEntryPoint,
  clearApplicantSensitiveDraft,
  loadVerifiedProfile,
  checkStatus,
}: UseApplicantSessionArgs) {
  const lastApplicantKeepaliveAt = useRef(0);
  const applicantRequestRef = useRef(applicantRequest);
  const loadVerifiedProfileRef = useRef(loadVerifiedProfile);
  const checkStatusRef = useRef(checkStatus);
  const clearApplicantSensitiveDraftRef = useRef(clearApplicantSensitiveDraft);
  const readStoredLanguagePreferenceRef = useRef(readStoredLanguagePreference);
  const normalizeRecoveryEntryPointRef = useRef(normalizeRecoveryEntryPoint);
  const getTelegramInitDataRef = useRef(getTelegramInitData);

  useEffect(() => {
    applicantRequestRef.current = applicantRequest;
    loadVerifiedProfileRef.current = loadVerifiedProfile;
    checkStatusRef.current = checkStatus;
    clearApplicantSensitiveDraftRef.current = clearApplicantSensitiveDraft;
    readStoredLanguagePreferenceRef.current = readStoredLanguagePreference;
    normalizeRecoveryEntryPointRef.current = normalizeRecoveryEntryPoint;
    getTelegramInitDataRef.current = getTelegramInitData;
  }, [
    applicantRequest,
    checkStatus,
    clearApplicantSensitiveDraft,
    getTelegramInitData,
    loadVerifiedProfile,
    normalizeRecoveryEntryPoint,
    readStoredLanguagePreference,
  ]);

  const recoverApplicantSession = useCallback(async () => {
    setApplicantSession(false);
    clearApplicantSensitiveDraftRef.current();
    setRecoveryEntryPoints([]);
    setError(applicantSessionRecoveryMessage(currentLanguageRef.current));
    try {
      const response = await applicantRequestRef.current(
        "/api/v1/local/public/telegram-entrypoints",
      );
      const payload = (await response.json()) as TelegramEntryPoints;
      if (!response.ok || !Array.isArray(payload.entrypoints)) return;
      setRecoveryEntryPoints([
        ...new Set(
          payload.entrypoints
            .map((entryPoint) =>
              normalizeRecoveryEntryPointRef.current(entryPoint),
            )
            .filter((entryPoint): entryPoint is string => !!entryPoint),
        ),
      ]);
    } catch {
      /* optional recovery directory can fail silently */
    }
  }, [
    currentLanguageRef,
    setApplicantSession,
    setError,
    setRecoveryEntryPoints,
  ]);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | undefined;

    const authenticateTelegram = async (): Promise<void> => {
      const initData = getTelegramInitDataRef.current();
      if (!initData) return;
      const authentication = await applicantRequestRef.current(
        "/api/v1/local/public/telegram-sessions",
        {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ initData }),
        },
      );
      if (![201, 409].includes(authentication.status)) {
        await recoverApplicantSession();
        return;
      }

      const applications = await applicantRequestRef.current(
        "/api/v1/local/public/applications",
      );
      if (!applications.ok) {
        await recoverApplicantSession();
        return;
      }
      const payload = (await applications.json()) as ApplicationList;
      setApplicantSession(true);
      setError("");
      setRecoveryEntryPoints([]);
      if (
        payload.preferredLanguage &&
        !languageChangedByApplicantRef.current &&
        !readStoredLanguagePreferenceRef.current()
      ) {
        setLanguage(payload.preferredLanguage);
      }
      setApplicationHistory(payload.applications);
      const profile = await loadVerifiedProfileRef.current();
      if (
        profile?.language &&
        !languageChangedByApplicantRef.current &&
        !readStoredLanguagePreferenceRef.current() &&
        profile.language !== payload.preferredLanguage
      ) {
        setLanguage(profile.language);
      }
      const requestedApplicationNo = new URLSearchParams(
        window.location.search,
      ).get("application");
      if (
        profile &&
        !requestedApplicationNo &&
        currentPageRef.current === "home"
      ) {
        setCurrentPage("profile");
      }
      const restored =
        payload.applications.find(
          (item) => item.applicationNo === requestedApplicationNo,
        ) ?? payload.applications[0];
      if (!restored) return;
      await checkStatusRef.current(restored.applicationNo);
    };

    const waitForTelegramBridge = (remainingAttempts: number) => {
      if (cancelled) return;
      if (getTelegramInitDataRef.current()) {
        void authenticateTelegram().catch(() => void recoverApplicantSession());
        return;
      }
      if (remainingAttempts > 0) {
        retryTimer = window.setTimeout(
          () => waitForTelegramBridge(remainingAttempts - 1),
          250,
        );
      }
    };

    waitForTelegramBridge(20);
    return () => {
      cancelled = true;
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
    };
  }, [
    currentPageRef,
    languageChangedByApplicantRef,
    recoverApplicantSession,
    setApplicantSession,
    setApplicationHistory,
    setCurrentPage,
    setError,
    setLanguage,
    setRecoveryEntryPoints,
  ]);

  useEffect(() => {
    if (!applicantSession || !languageChangedByApplicantRef.current) return;
    try {
      const request = applicantRequestRef.current(
        "/api/v1/local/public/profile/preferred-language",
        {
          method: "PUT",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ preferredLanguage: language }),
        },
      );
      if (
        request &&
        typeof (request as Promise<unknown>).catch === "function"
      ) {
        void request.catch(() => undefined);
      }
    } catch {
      /* keep local language even if transport mock is non-Promise-like */
    }
  }, [applicantSession, language, languageChangedByApplicantRef]);

  useEffect(() => {
    if (!applicantSession) {
      lastApplicantKeepaliveAt.current = 0;
      return;
    }
    if (!lastApplicantKeepaliveAt.current) {
      lastApplicantKeepaliveAt.current = Date.now();
    }
    const recordApplicantActivity = () => {
      const now = Date.now();
      if (
        !shouldKeepApplicantSessionAlive(lastApplicantKeepaliveAt.current, now)
      ) {
        return;
      }
      lastApplicantKeepaliveAt.current = now;
      const request = applicantRequestRef.current(
        "/api/v1/local/public/telegram-sessions/keepalive",
        {
          method: "POST",
          credentials: "include",
        },
      );
      if (request && typeof (request as Promise<unknown>).then === "function") {
        void (request as Promise<Response>)
          .then((response) => {
            if (!response.ok) {
              void recoverApplicantSession();
            }
          })
          .catch(() => {
            void recoverApplicantSession();
          });
      }
    };

    window.addEventListener("pointerdown", recordApplicantActivity, {
      passive: true,
    });
    window.addEventListener("keydown", recordApplicantActivity);
    window.addEventListener("touchstart", recordApplicantActivity, {
      passive: true,
    });

    return () => {
      window.removeEventListener("pointerdown", recordApplicantActivity);
      window.removeEventListener("keydown", recordApplicantActivity);
      window.removeEventListener("touchstart", recordApplicantActivity);
    };
  }, [applicantSession, recoverApplicantSession]);

  return {
    recoverApplicantSession,
  };
}
