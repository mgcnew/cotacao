import {
  BarChart3,
  ClipboardList,
  ListChecks,
  LayoutGrid,
  Package,
  PackageCheck,
  Barcode,
  MessageCircle,
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
  /** Ferramenta de campo que aparece somente na gaveta do celular. */
  mobileOnly?: boolean;
  /** Ferramenta de escritório: continua acessível por URL, mas sai da gaveta mobile. */
  desktopOnly?: boolean;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Operação",
    items: [
      // A ordem acompanha o trabalho: necessidade, cotação, pedido e chegada.
      { href: "/dashboard", label: "Central operacional", icon: LayoutGrid },
      {
        href: "/lista-compras",
        label: "Lista de compras",
        icon: ListChecks,
        permission: "product.view",
      },
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
        href: "/recebimentos",
        label: "Recebimentos",
        icon: PackageCheck,
        permission: "receipt.view",
      },
    ],
  },
  {
    label: "Catálogo e fornecedores",
    items: [
      {
        href: "/produtos",
        label: "Produtos",
        icon: Package,
        permission: "product.view",
      },
      {
        href: "/etiquetas",
        label: "Código para etiquetas",
        icon: Barcode,
        permission: "product.view",
        mobileOnly: true,
      },
      {
        href: "/fornecedores",
        label: "Fornecedores",
        icon: Truck,
        permission: "supplier.view",
      },
      {
        href: "/whatsapp",
        label: "WhatsApp Compras",
        icon: MessageCircle,
        permission: "purchase_round.view",
        desktopOnly: true,
      },
    ],
  },
  {
    label: "Gestão",
    items: [
      {
        href: "/analises",
        label: "Análises",
        icon: BarChart3,
        permission: "analytics.view",
      },
    ],
  },
];

export const FOOTER_NAV: NavItem[] = [
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];
