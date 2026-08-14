import {
  BarChart3,
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
  { href: "/dashboard", label: "Dashboard", icon: LayoutGrid },
  {
    href: "/compras",
    label: "Compras",
    icon: ShoppingCart,
    permission: "purchase_round.view",
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
