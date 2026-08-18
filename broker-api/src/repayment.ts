export type RepaymentScheduleItem = Readonly<{
  installmentNo: number;
  dueDate: string;
  amountDueMinor: string;
  amountPaidMinor: string;
  status: "PENDING" | "PAID";
}>;

export type RepaymentScheduleSummary = Readonly<{
  periodCount: number;
  paidPeriods: number;
  unpaidPeriods: number;
  overduePeriods: number;
  totalDueMinor: string;
  totalPaidMinor: string;
  outstandingMinor: string;
  overdueOutstandingMinor: string;
  nextInstallment: null | Pick<
    RepaymentScheduleItem,
    "installmentNo" | "dueDate" | "amountDueMinor"
  >;
  installments: readonly RepaymentScheduleItem[];
}>;

export type ApplicantLoanSummary = Readonly<{
  application: Readonly<{
    applicationNo: string;
    status: string;
    requestedAmountMinor: string;
    currency: string;
    tenorDays: number;
    approvedAmountMinor: string | null;
    rejectionConditionResolved: boolean;
    rejectionCoolingOffEndsAt?: string | null;
    rejectionCoolingOffDaysRemaining?: number | null;
    rejectionNoticeCode:
      | "INFORMATION_INCOMPLETE"
      | "EMPLOYMENT_OR_INCOME_UNVERIFIED"
      | "PRODUCT_ELIGIBILITY_NOT_MET"
      | "LENDER_DECISION"
      | null;
    supplementRequested: boolean;
    // The selected factory name is shown only in the applicant's own
    // authorised summary. It is not an employer membership or volume view.
    employerTenantDisplayName?: string | null;
  }>;
  terms: null | Readonly<{
    approvedAmountMinor: string;
    serviceFeeMinor: string;
    totalRepayableMinor: string;
    installmentCount: number;
    firstDueDate: string;
  }>;
  repayment: RepaymentScheduleSummary;
  recordDetail?: Readonly<{
    createdAt: string;
    updatedAt: string;
    canUploadPaymentProof: boolean;
    canRequestReassessment: boolean;
  }>;
  repaymentProof?: null | Readonly<{
    proofNo: string;
    status: "UNDER_REVIEW" | "NEEDS_MORE" | "RECONCILED" | "EXCEPTION";
    fileName: string;
    contentType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
    transferReference?: string;
    submittedAt: string;
  }>;
  reassessmentRequest?: null | Readonly<{
    requestNo: string;
    status: "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "DECLINED" | "CLOSED";
    addressChanged: boolean;
    employerUpdated: boolean;
    wealthProofDeclared: boolean;
    submittedAt: string;
  }>;
  timeline?: ReadonlyArray<
    Readonly<{
      occurredAt: string;
      entryType:
        | "STATUS"
        | "APPROVAL"
        | "PAYMENT_PROOF_SUBMITTED"
        | "PAYMENT_PROOF_REVIEWED"
        | "REASSESSMENT_SUBMITTED"
        | "REASSESSMENT_APPROVAL";
      status?: string;
      stage?: string;
      decision?: string;
      actorUserRef?: string;
      actorRole?: string;
      reasonCode?: string;
      referenceNo?: string;
    }>
  >;
}>;

export function formatApplicantLoanSummary(
  application: ApplicantLoanSummary["application"],
  terms: ApplicantLoanSummary["terms"],
  repayment: RepaymentScheduleSummary,
  extras: Pick<
    ApplicantLoanSummary,
    "recordDetail" | "repaymentProof" | "reassessmentRequest" | "timeline"
  > = {},
): ApplicantLoanSummary {
  return { application, terms, repayment, ...extras };
}

export function buildRepaymentSchedule(
  totalRepayableMinor: string,
  installmentCount: number,
  firstDueDate: string,
): Array<
  Pick<RepaymentScheduleItem, "installmentNo" | "dueDate" | "amountDueMinor">
> {
  if (!/^\d+$/.test(totalRepayableMinor)) {
    throw new Error("total repayable amount must be a minor-unit string");
  }
  if (!Number.isInteger(installmentCount) || installmentCount < 1) {
    throw new Error("installment count must be a positive integer");
  }
  const firstDue = new Date(`${firstDueDate}T00:00:00.000Z`);
  if (Number.isNaN(firstDue.getTime()))
    throw new Error("first due date is invalid");

  const total = BigInt(totalRepayableMinor);
  const count = BigInt(installmentCount);
  const base = total / count;
  const remainder = total % count;
  return Array.from({ length: installmentCount }, (_, offset) => {
    const due = new Date(firstDue);
    due.setUTCDate(due.getUTCDate() + offset * 30);
    const amountDue = base + (offset + 1 === installmentCount ? remainder : 0n);
    return {
      installmentNo: offset + 1,
      dueDate: due.toISOString().slice(0, 10),
      amountDueMinor: amountDue.toString(),
    };
  });
}

export function summarizeRepaymentSchedule(
  schedule: readonly RepaymentScheduleItem[],
  asOfDate = new Date().toISOString().slice(0, 10),
): RepaymentScheduleSummary {
  const paidPeriods = schedule.filter((item) => item.status === "PAID").length;
  // This is an informational, server-calculated view only. It deliberately
  // does not add a late fee or mutate the loan status: those are lender and
  // local-law policy decisions outside the applicant dashboard.
  const overdueInstallments = schedule.filter(
    (item) => item.status === "PENDING" && item.dueDate < asOfDate,
  );
  const totalDue = schedule.reduce(
    (total, item) => total + BigInt(item.amountDueMinor),
    0n,
  );
  const totalPaid = schedule.reduce(
    (total, item) => total + BigInt(item.amountPaidMinor),
    0n,
  );
  const nextInstallment = schedule.find((item) => item.status === "PENDING");
  return {
    periodCount: schedule.length,
    paidPeriods,
    unpaidPeriods: schedule.length - paidPeriods,
    overduePeriods: overdueInstallments.length,
    totalDueMinor: totalDue.toString(),
    totalPaidMinor: totalPaid.toString(),
    outstandingMinor: (totalDue - totalPaid).toString(),
    overdueOutstandingMinor: overdueInstallments
      .reduce((total, item) => total + BigInt(item.amountDueMinor), 0n)
      .toString(),
    nextInstallment: nextInstallment
      ? {
          installmentNo: nextInstallment.installmentNo,
          dueDate: nextInstallment.dueDate,
          amountDueMinor: nextInstallment.amountDueMinor,
        }
      : null,
    installments: schedule,
  };
}
