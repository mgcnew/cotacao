export default function FornecedoresLayout({
  children,
  modal,
}: LayoutProps<"/fornecedores">) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
