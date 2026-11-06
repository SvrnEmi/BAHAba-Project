import { REPORT_APPROVE_REASONS, REPORT_REJECT_REASONS } from "../../lib/alerts";
import { displayReporterName } from "../../lib/reports";
import { ReasonDialog } from "./ReasonDialog";

/**
 * MDRRMO only. Approve (approval_reason, 5-500 characters) or reject
 * (rejection_reason, at least 3 characters) with ready messages.
 */
export function ReportReviewDialog({
  report,
  decision,
  onClose,
  onSave,
}: {
  report: { location: string | null; user_name: string | null };
  decision: "approved" | "rejected";
  onClose: () => void;
  onSave: (reason: string) => Promise<void>;
}) {
  const approve = decision === "approved";
  return (
    <ReasonDialog
      title={approve ? "Approve report" : "Reject report"}
      subtitle={`${report.location?.trim() || "Unknown location"} · by ${displayReporterName(report.user_name)}`}
      presets={approve ? REPORT_APPROVE_REASONS : REPORT_REJECT_REASONS}
      confirmLabel={approve ? "Approve" : "Reject"}
      danger={!approve}
      minLength={approve ? 5 : 3}
      maxLength={500}
      onClose={onClose}
      onConfirm={onSave}
    />
  );
}
