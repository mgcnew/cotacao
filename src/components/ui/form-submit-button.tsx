"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

export function FormSubmitButton({
  children,
  pendingLabel,
  className,
  disabled = false,
  variant = "default",
  name,
  value,
}: {
  children: React.ReactNode;
  pendingLabel: string;
  className?: string;
  disabled?: boolean;
  variant?: React.ComponentProps<typeof Button>["variant"];
  /** Com dois botões no mesmo formulário, diz à action qual foi apertado. */
  name?: string;
  value?: string;
}) {
  const { pending, data } = useFormStatus();
  // Só o botão apertado troca de rótulo; os outros apenas desabilitam.
  const esteEnviou = !name || data?.get(name) === value;
  return (
    <Button
      type="submit"
      name={name}
      value={value}
      variant={variant}
      disabled={pending || disabled}
      className={className}
    >
      {pending && esteEnviou ? pendingLabel : children}
    </Button>
  );
}
