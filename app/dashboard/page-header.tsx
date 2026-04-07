"use client";

export function PageHeader({
  title,
  subtitle,
  accentColor = "#2563eb",
}: {
  title: string;
  subtitle?: string;
  accentColor?: string;
}) {
  return (
    <div className="mb-6">
      <h1 className="ci-page-title">{title}</h1>
      <div className="ci-accent-line" style={{ backgroundColor: accentColor }} />
      {subtitle && <p className="text-sm text-[#64748b]">{subtitle}</p>}
    </div>
  );
}
