export type WhatsAppSetupState = {
  ok: boolean;
  configured: boolean;
  status: "not_configured" | "not_connected" | "connecting" | "connected" | "disconnected" | "error" | "unknown";
  phone: string | null;
  qrCode: string | null;
  message: string | null;
  lastConnectedAt: string | null;
};
