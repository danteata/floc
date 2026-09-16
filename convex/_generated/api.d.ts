/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as absentShares from "../absentShares.js";
import type * as ai_credentials from "../ai/credentials.js";
import type * as ai_internal from "../ai/internal.js";
import type * as ai_queries from "../ai/queries.js";
import type * as app_config from "../app_config.js";
import type * as attendance from "../attendance.js";
import type * as audit from "../audit.js";
import type * as auth from "../auth.js";
import type * as automation_catalog from "../automation/catalog.js";
import type * as automation_conditions from "../automation/conditions.js";
import type * as automation_dispatch from "../automation/dispatch.js";
import type * as automation_engine from "../automation/engine.js";
import type * as automation_events from "../automation/events.js";
import type * as automation_facts from "../automation/facts.js";
import type * as automation_guardrails from "../automation/guardrails.js";
import type * as automation_providers from "../automation/providers.js";
import type * as automation_rules from "../automation/rules.js";
import type * as automation_scan from "../automation/scan.js";
import type * as automation_templating from "../automation/templating.js";
import type * as care_tasks from "../care_tasks.js";
import type * as check_ins from "../check_ins.js";
import type * as crons from "../crons.js";
import type * as dashboard from "../dashboard.js";
import type * as engagement_impact from "../engagement/impact.js";
import type * as engagement_queries from "../engagement/queries.js";
import type * as engagement_recompute from "../engagement/recompute.js";
import type * as engagement_scoring from "../engagement/scoring.js";
import type * as entitlements from "../entitlements.js";
import type * as entitlements_api from "../entitlements_api.js";
import type * as event_types from "../event_types.js";
import type * as events from "../events.js";
import type * as files from "../files.js";
import type * as financial from "../financial.js";
import type * as flags from "../flags.js";
import type * as households from "../households.js";
import type * as http from "../http.js";
import type * as invitations from "../invitations.js";
import type * as labels from "../labels.js";
import type * as lib_aiProviders from "../lib/aiProviders.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_flags_catalog from "../lib/flags/catalog.js";
import type * as lib_flags_resolve from "../lib/flags/resolve.js";
import type * as lib_flags_server from "../lib/flags/server.js";
import type * as lib_secretBox from "../lib/secretBox.js";
import type * as lib_theme_brand from "../lib/theme/brand.js";
import type * as lib_theme_chart from "../lib/theme/chart.js";
import type * as lib_theme_contrast from "../lib/theme/contrast.js";
import type * as lib_theme_css from "../lib/theme/css.js";
import type * as lib_theme_oklch from "../lib/theme/oklch.js";
import type * as lib_theme_presets from "../lib/theme/presets.js";
import type * as lib_theme_publicBrand from "../lib/theme/publicBrand.js";
import type * as memberShares from "../memberShares.js";
import type * as members from "../members.js";
import type * as notifications from "../notifications.js";
import type * as organizations from "../organizations.js";
import type * as paystack from "../paystack.js";
import type * as permissions from "../permissions.js";
import type * as scope from "../scope.js";
import type * as unit_admins from "../unit_admins.js";
import type * as unit_templates from "../unit_templates.js";
import type * as units from "../units.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  absentShares: typeof absentShares;
  "ai/credentials": typeof ai_credentials;
  "ai/internal": typeof ai_internal;
  "ai/queries": typeof ai_queries;
  app_config: typeof app_config;
  attendance: typeof attendance;
  audit: typeof audit;
  auth: typeof auth;
  "automation/catalog": typeof automation_catalog;
  "automation/conditions": typeof automation_conditions;
  "automation/dispatch": typeof automation_dispatch;
  "automation/engine": typeof automation_engine;
  "automation/events": typeof automation_events;
  "automation/facts": typeof automation_facts;
  "automation/guardrails": typeof automation_guardrails;
  "automation/providers": typeof automation_providers;
  "automation/rules": typeof automation_rules;
  "automation/scan": typeof automation_scan;
  "automation/templating": typeof automation_templating;
  care_tasks: typeof care_tasks;
  check_ins: typeof check_ins;
  crons: typeof crons;
  dashboard: typeof dashboard;
  "engagement/impact": typeof engagement_impact;
  "engagement/queries": typeof engagement_queries;
  "engagement/recompute": typeof engagement_recompute;
  "engagement/scoring": typeof engagement_scoring;
  entitlements: typeof entitlements;
  entitlements_api: typeof entitlements_api;
  event_types: typeof event_types;
  events: typeof events;
  files: typeof files;
  financial: typeof financial;
  flags: typeof flags;
  households: typeof households;
  http: typeof http;
  invitations: typeof invitations;
  labels: typeof labels;
  "lib/aiProviders": typeof lib_aiProviders;
  "lib/errors": typeof lib_errors;
  "lib/flags/catalog": typeof lib_flags_catalog;
  "lib/flags/resolve": typeof lib_flags_resolve;
  "lib/flags/server": typeof lib_flags_server;
  "lib/secretBox": typeof lib_secretBox;
  "lib/theme/brand": typeof lib_theme_brand;
  "lib/theme/chart": typeof lib_theme_chart;
  "lib/theme/contrast": typeof lib_theme_contrast;
  "lib/theme/css": typeof lib_theme_css;
  "lib/theme/oklch": typeof lib_theme_oklch;
  "lib/theme/presets": typeof lib_theme_presets;
  "lib/theme/publicBrand": typeof lib_theme_publicBrand;
  memberShares: typeof memberShares;
  members: typeof members;
  notifications: typeof notifications;
  organizations: typeof organizations;
  paystack: typeof paystack;
  permissions: typeof permissions;
  scope: typeof scope;
  unit_admins: typeof unit_admins;
  unit_templates: typeof unit_templates;
  units: typeof units;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
