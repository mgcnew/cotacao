import { companyAssetUrl } from "@/features/company/assets";
import { cn } from "@/lib/utils";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

export function CompanyAvatar({
  name,
  logoPath,
  previewUrl,
  className,
}: {
  name: string;
  logoPath?: string | null;
  previewUrl?: string | null;
  className?: string;
}) {
  const logo = previewUrl ?? companyAssetUrl(logoPath);
  return (
    <span
      aria-hidden
      className={cn(
        "bg-surface-muted text-fg-muted grid size-6 shrink-0 place-items-center rounded-md bg-cover bg-center text-[10px] font-semibold",
        className,
      )}
      style={logo ? { backgroundImage: `url("${logo}")` } : undefined}
    >
      {logo ? null : initials(name)}
    </span>
  );
}
