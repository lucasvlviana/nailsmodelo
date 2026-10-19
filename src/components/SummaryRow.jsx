export default function SummaryRow({ label, value }) {
  return (
    <div className="row">
      <span>{label}</span>
      <span>{value || "—"}</span>
    </div>
  );
}
