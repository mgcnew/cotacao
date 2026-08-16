import {
  BarChart3,
  ClipboardList,
  LayoutGrid,
  Package,
  Settings,
  ShoppingCart,
  Truck,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Permissão mínima para o item aparecer. A UI esconde; o banco é quem nega. */
  permission?: string;
};

export const OPERATION_NAV: NavItem[] = [
  // O menu chama a página pelo nome que ela usa no título. "Dashboard" e
  // "Central operacional" lado a lado pareciam dois lugares diferentes.
  { href: "/dashboard", label: "Central operacional", icon: LayoutGrid },
  {
    href: "/compras",
    label: "Compras",
    icon: ShoppingCart,
    permission: "purchase_round.view",
  },
  {
    href: "/pedidos",
    label: "Pedidos",
    icon: ClipboardList,
    permission: "order.view",
  },
  {
    href: "/produtos",
    label: "Produtos",
    icon: Package,
    permission: "product.view",
  },
  {
    href: "/fornecedores",
    label: "Fornecedores",
    icon: Truck,
    permission: "supplier.view",
  },
  {
    href: "/analises",
    label: "Análises",
    icon: BarChart3,
    permission: "analytics.view",
  },
];

export const FOOTER_NAV: NavItem[] = [
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];
