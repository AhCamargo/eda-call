/**
 * Shared type definitions for the application
 */

// User and Authentication
export interface User {
  id: string;
  username: string;
  role: "admin" | "supervisor" | "agent";
  iat: number;
  exp: number;
}

export interface AuthResponse {
  token: string;
  user: User;
}

// Status and Counts
export interface StatusCounts {
  online: number;
  offline: number;
  paused: number;
  ringing: number;
  in_call: number;
  in_campaign: number;
}

// Extension
export interface Extension {
  id: string;
  number: string;
  name: string;
  sipPassword?: string;
  voipLineId?: string;
  status?: string;
}

export interface CreateExtensionPayload {
  number: string;
  name: string;
  sipPassword?: string;
  voipLineId?: string;
}

// VoIP Line
export interface VoipLine {
  id: string;
  name: string;
  username: string;
  secret: string;
  host: string;
  port: number;
  context: string;
  transport: string;
}

export interface CreateVoipLinePayload {
  name: string;
  username: string;
  secret: string;
  host: string;
  port: number;
  context: string;
  transport: string;
}

// Campaign
export interface Campaign {
  id: string;
  name: string;
  intervalSeconds: number;
  status?: string;
}

export interface CreateCampaignPayload {
  name: string;
  intervalSeconds: number;
}

// Reports
export interface ReportSummary {
  quemAtendeu: number;
  numeroNaoExiste: number;
}

export interface CallLogEntry {
  id: string;
  direction: string;
  source: string;
  destination: string;
  duration: number;
  status: string;
  timestamp: string;
}

export interface UraLog {
  id: string;
  option: string;
  count: number;
}

export interface Recording {
  id: string;
  filename: string;
  extension: string;
  duration: number;
  timestamp: string;
}

// PBX Context Value
export interface IPbxContextValue {
  user?: User;
  statusCounts: StatusCounts;
  extensions: Extension[];
  voipLines: VoipLine[];
  campaigns: Campaign[];
  reports: ReportSummary;
  reportCallsByExtension: CallLogEntry[];
  reportCallsByCampaign: CallLogEntry[];
  reportUraLogs: UraLog[];
  reportRecordings: Recording[];
  fetchAll: () => Promise<void>;
  createExtension: (
    payload: CreateExtensionPayload,
  ) => Promise<{ sipPassword?: string; warning?: string; detail?: string }>;
  updateExtension: (
    id: string,
    payload: Partial<CreateExtensionPayload>,
  ) => Promise<void>;
  deleteExtension: (id: string) => Promise<void>;
  pauseExtension: (id: string, reason: string) => Promise<void>;
  resumeExtension: (id: string) => Promise<void>;
  createCampaign: (payload: CreateCampaignPayload) => Promise<void>;
  updateCampaign: (
    id: string,
    payload: Partial<CreateCampaignPayload>,
  ) => Promise<void>;
  deleteCampaign: (id: string) => Promise<void>;
  assignExtensions: (
    campaignId: string,
    extensionIds: string[],
  ) => Promise<void>;
  assignVoipLines: (campaignId: string, voipLineIds: string[]) => Promise<void>;
  uploadPhones: (campaignId: string, file: File) => Promise<void>;
  startCampaign: (campaignId: string) => Promise<void>;
  createVoipLine: (payload: CreateVoipLinePayload) => Promise<void>;
  updateVoipLine: (
    id: string,
    payload: Partial<CreateVoipLinePayload>,
  ) => Promise<void>;
  deleteVoipLine: (id: string) => Promise<void>;
  reprovisionVoipLine: (id: string) => Promise<void>;
  reprovisionExtension: (id: string) => Promise<void>;
  testCallBetweenExtensions: (
    sourceExtensionId: string,
    targetExtensionId: string,
  ) => Promise<Record<string, unknown>>;
  deleteRecording: (recordingId: string) => Promise<void>;
}

// Navigation
export interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  iconColor: string;
}

export interface LanguageOption {
  code: string;
  flag: string;
  label: string;
}

export interface RoleInfo {
  label: string;
  dot: string;
}

// Component Props
export interface LoginFormProps {
  username: string;
  password: string;
}

export interface FormFieldChangeEvent {
  target: {
    value: string | number;
    name?: string;
  };
}
