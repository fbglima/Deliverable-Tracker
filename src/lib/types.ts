export type WorkspaceRole = "admin" | "member";

export type MatrixNodeType =
  | "creative_unit"
  | "duration"
  | "aspect_ratio"
  | "platform"
  | "technical_variant"
  | "output_format";

export type DeliverableNode = {
  id: string;
  nodeType: MatrixNodeType;
  label: string;
  children?: DeliverableNode[];
};

export type DeliverableTree = {
  version: 1;
  hierarchy: MatrixNodeType[];
  optionalLevels: MatrixNodeType[];
  defaultOutputFormats?: string[];
  autoApplyOutputFormats?: boolean;
  nodes: DeliverableNode[];
};

export type MatrixCounts = {
  creativeDeliverables: number;
  terminalFiles: number;
};

export type Workspace = {
  id: string;
  name: string;
  created_at: string;
  created_by: string;
};

export type WorkspaceMembership = {
  role: WorkspaceRole;
  workspaces: Workspace;
};

export type Project = {
  id: string;
  workspace_id: string;
  name: string;
  client_name: string | null;
  campaign_name: string | null;
  description: string | null;
  tree_json: DeliverableTree;
  created_at: string;
  updated_at: string;
};

export type MatrixSnapshot = {
  id: string;
  project_id: string;
  name: string;
  notes: string | null;
  source_or_reason: string | null;
  tree_json: DeliverableTree;
  created_at: string;
};

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      workspaces: {
        Row: Workspace;
        Insert: {
          id?: string;
          name: string;
          created_by: string;
        };
        Update: {
          name?: string;
        };
        Relationships: [];
      };
      workspace_members: {
        Row: {
          id: string;
          workspace_id: string;
          user_id: string;
          role: WorkspaceRole;
          created_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          user_id: string;
          role: WorkspaceRole;
        };
        Update: {
          role?: WorkspaceRole;
        };
        Relationships: [];
      };
      projects: {
        Row: Project;
        Insert: {
          id?: string;
          workspace_id: string;
          name: string;
          client_name?: string | null;
          campaign_name?: string | null;
          description?: string | null;
          tree_json: DeliverableTree;
          created_by: string;
        };
        Update: {
          name?: string;
          client_name?: string | null;
          campaign_name?: string | null;
          description?: string | null;
          tree_json?: DeliverableTree;
          updated_at?: string;
        };
        Relationships: [];
      };
      matrix_snapshots: {
        Row: MatrixSnapshot;
        Insert: {
          id?: string;
          project_id: string;
          name: string;
          notes?: string | null;
          source_or_reason?: string | null;
          tree_json: DeliverableTree;
          created_by: string;
        };
        Update: {
          name?: string;
          notes?: string | null;
          source_or_reason?: string | null;
          tree_json?: DeliverableTree;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      workspace_role: WorkspaceRole;
    };
    CompositeTypes: Record<string, never>;
  };
};
