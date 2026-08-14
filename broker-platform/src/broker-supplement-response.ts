export type BrokerSupplementResponseEntry = Readonly<{
  responseNo: string;
  applicantLanguage: "zh-CN" | "en" | "km";
  submittedAt: string;
}>;

export type BrokerSupplementResponseDetail = Readonly<{
  responseNo: string;
  applicationNo: string;
  message: string;
  submittedAt: string;
}>;

export function parseBrokerSupplementResponseList(
  payload: unknown,
): BrokerSupplementResponseEntry[] | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const responses = (payload as { responses?: unknown }).responses;
  if (!Array.isArray(responses)) return undefined;
  const parsed = responses.filter(
    (entry): entry is BrokerSupplementResponseEntry =>
      Boolean(entry) &&
      typeof entry === "object" &&
      typeof (entry as { responseNo?: unknown }).responseNo === "string" &&
      ["zh-CN", "en", "km"].includes(
        (entry as { applicantLanguage?: unknown }).applicantLanguage as string,
      ) &&
      typeof (entry as { submittedAt?: unknown }).submittedAt === "string",
  );
  return parsed.length === responses.length ? parsed : undefined;
}

export function parseBrokerSupplementResponseDetail(
  payload: unknown,
): BrokerSupplementResponseDetail | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const response = payload as {
    responseNo?: unknown;
    applicationNo?: unknown;
    message?: unknown;
    submittedAt?: unknown;
  };
  if (
    typeof response.responseNo !== "string" ||
    typeof response.applicationNo !== "string" ||
    typeof response.message !== "string" ||
    typeof response.submittedAt !== "string"
  ) {
    return undefined;
  }
  return {
    responseNo: response.responseNo,
    applicationNo: response.applicationNo,
    message: response.message,
    submittedAt: response.submittedAt,
  };
}
