import "server-only";
import { BACKEND } from "../config";
import { memoryStore } from "./memory";
import { supabaseStore } from "./supabase";
import type { Store } from "./types";

export const store: Store = BACKEND === "supabase" ? supabaseStore : memoryStore;
export * from "./types";
