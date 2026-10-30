export interface MetaOutput {
  type: string;
  content?: { type: string; text?: string }[];
}
export interface MetaEvent {
  type: string;
  delta?: unknown;
  text?: unknown;
  output_index?: unknown;
  summary_index?: unknown;
  response?: { status?: string; output?: MetaOutput[]; usage?: unknown };
}
