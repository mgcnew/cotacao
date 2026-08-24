export default function ProdutosLayout({
  children,
  modal,
}: LayoutProps<"/produtos">) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
