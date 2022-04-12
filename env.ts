import "https://deno.land/std@0.134.0/dotenv/load.ts";
import { Env } from "https://deno.land/x/env@v2.2.0/env.js";

const env = new Env();
export const VERIFICATION_TOKEN = env.require("VERIFICATION_TOKEN");
export const BOT_USER_OAUTH_TOKEN = env.require("BOT_USER_OAUTH_TOKEN");
