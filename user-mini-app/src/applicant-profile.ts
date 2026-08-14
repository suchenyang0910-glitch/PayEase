export type ApplicantProfileInput = Readonly<{
  fullName: string;
  phone: string;
  employerName: string;
}>;

const phonePattern = /^\+?[0-9][0-9 ()-]{5,31}$/;

/** Mirrors the public application API's profile boundary before PII leaves the Mini App. */
export function applicantProfileValidationError(
  profile: ApplicantProfileInput,
): "REQUIRED" | "PHONE_INVALID" | undefined {
  const fullName = profile.fullName.trim();
  const phone = profile.phone.trim();
  const employerName = profile.employerName.trim();
  if (!fullName || !phone || !employerName) return "REQUIRED";
  if (fullName.length > 120 || employerName.length > 160) return "REQUIRED";
  if (!phonePattern.test(phone)) return "PHONE_INVALID";
  return undefined;
}
