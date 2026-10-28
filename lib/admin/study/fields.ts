// Form field descriptions shared by the server (validation) and the client
// (rendering). Plain data only — this file is imported by a Client Component.

export type FieldType = "text" | "textarea" | "int" | "bool" | "select" | "email" | "domain" | "uuid";

export type Field = {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  max?: number; // characters for text, value for int
  min?: number;
  hint?: string;
  mono?: boolean;
  half?: boolean; // sits beside the next half-width field
  options?: string; // key into OPTION_SOURCES (lib/admin/study/resources.ts)
  default?: string;
};

export type Choice = { value: string; label: string };

// A field as the form receives it: select options resolved on the server.
export type ResolvedField = Field & { choices?: Choice[] };

export type RowValues = Record<string, string | boolean>;

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
