export type DirectoryAccount = Readonly<{
  loginName: string;
  preferredLanguage: "zh-CN" | "en" | "km";
  isActive: boolean;
  departmentCode: string;
  roles: string[];
}>;

/**
 * The API uses PostgreSQL-style snake_case while the UI intentionally keeps
 * local state camelCase. Reject malformed records instead of rendering an
 * ambiguous account row that might target the wrong login name for disable.
 */
export function parseDirectoryAccounts(payload: unknown): DirectoryAccount[] {
  if (!Array.isArray(payload)) return [];
  return payload.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const candidate = row as Record<string, unknown>;
    if (
      typeof candidate.login_name !== "string" ||
      !["zh-CN", "en", "km"].includes(String(candidate.preferred_language)) ||
      typeof candidate.is_active !== "boolean" ||
      typeof candidate.department_code !== "string" ||
      !Array.isArray(candidate.roles) ||
      !candidate.roles.every((role) => typeof role === "string")
    )
      return [];
    return [
      {
        loginName: candidate.login_name,
        preferredLanguage:
          candidate.preferred_language as DirectoryAccount["preferredLanguage"],
        isActive: candidate.is_active,
        departmentCode: candidate.department_code,
        roles: candidate.roles,
      },
    ];
  });
}
