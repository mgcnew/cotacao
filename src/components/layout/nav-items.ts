import {
  BarChart3,
  ClipboardCheck,
  ClipboardList,
  ListChecks,
  LayoutGrid,
  Package,
  PackageCheck,
  Barcode,
  MessageCircle,
  NotebookPen,
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
  /**
   * Páginas da seção que antes eram botões no cabeçalho dela. Só o sidebar do
   * desktop as mostra; no celular os botões continuam na página.
   */
  children?: NavSubItem[];
};

export type NavSubItem = {
  href: string;
  label: string;
  permission?: string;
  /** Contagem ao lado do nome, vinda do servidor (ver `NavBadges`). */
  badge?: NavBadgeKey;
};

export type NavBadgeKey = "divergencias";

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
        children: [
          {
            href: "/pedidos/divergencias",
            label: "Divergências",
            permission: "commercial_divergence.view",
            badge: "divergencias",
          },
        ],
      },
      {
        href: "/recebimentos",
        label: "Recebimentos",
        icon: PackageCheck,
        permission: "receipt.view",
        children: [
          {
            href: "/recebimentos/historico",
            label: "Histórico XML",
            permission: "receipt.post",
          },
        ],
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
        children: [
          { href: "/produtos/categorias", label: "Categorias" },
          { href: "/produtos/unidades", label: "Unidades" },
          {
            href: "/produtos/importacoes",
            label: "Importar planilha",
            permission: "product.create",
          },
        ],
      },
      {
        href: "/contagens",
        label: "Contagem de estoque",
        icon: ClipboardCheck,
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
      // Pessoal: sem permissão — toda pessoa da empresa tem as suas.
      { href: "/anotacoes", label: "Anotações", icon: NotebookPen },
    ],
  },
];

export const FOOTER_NAV: NavItem[] = [
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];
