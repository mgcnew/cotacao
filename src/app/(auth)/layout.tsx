export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="bg-surface-sunken flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2">
          <div className="bg-primary text-primary-fg grid size-9 place-items-center rounded-lg text-sm font-semibold">
            C
          </div>
          <h1 className="text-fg text-lg font-semibold tracking-tight">
            Compras
          </h1>
        </div>
        {children}
      </div>
    </div>
  );
}
