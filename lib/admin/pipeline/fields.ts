// Form field descriptions shared by the server (validation) and the client
// (rendering). Plain data only — this file is imported by a Client Component.

export type FieldType = "text" | "textarea" | "int" | "decimal" | "bool" | "select" | "email" | "domain" | "slug";

export type Field = {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  max?: number; // characters for text, value for int/decimal
  min?: number;
  hint?: string;
  mono?: boolean;
  half?: boolean; // sits beside the next half-width field
  rows?: number; // textarea height
  options?: string; // key into OPTION_SOURCES (lib/admin/pipeline/resources.ts)
  default?: string;
};

export type Choice = { value: string; label: string };

// A field as the form receives it: select options resolved on the server.
export type ResolvedField = Field & { choices?: Choice[] };

export type RowValues = Record<string, string | boolean>;
