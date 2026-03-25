/**
 * Unified type exports
 * Import shared types from this single entry point.
 */

export type * from "../drizzle/schema";
export * from "./_core/errors";

// Threads Studio Types
export type Tone = "polite" | "casual" | "professional";

export interface Post {
  id: string;
  content: string;
  order: number;
}

export interface ProjectInputs {
  storeName?: string;
  target?: string;
  problem?: string;
  benefit?: string;
  cta?: string;
  notes?: string;
  [key: string]: string | undefined;
}

export interface Project {
  id: string;
  title: string;
  templateId: string;
  inputs: ProjectInputs;
  posts: Post[];
  tags: string[];
  tone: Tone;
  maxCharsPerPost: number;
  createdAt: number;
  updatedAt: number;
}

export interface TemplateField {
  key: string;
  label: string;
  placeholder: string;
  required: boolean;
  multiline?: boolean;
}

export interface PostRule {
  role: string;
  contentTemplate: string;
}

export interface Template {
  id: string;
  name: string;
  description: string;
  requiredFields: TemplateField[];
  outputRules: PostRule[];
  icon: string;
}

export interface GenerateOptions {
  tone: Tone;
  maxCharsPerPost: number;
  postCount?: number;
}
