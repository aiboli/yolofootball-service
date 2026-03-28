const PRIVACY_POLICY_VERSION = "2026-03-27";
const PRIVACY_CONSENT_SCOPES = [
  "account",
  "service-operations",
  "security",
  "analytics",
];

const buildPrivacyConsentRecord = () => ({
  accepted: true,
  version: PRIVACY_POLICY_VERSION,
  accepted_at: new Date().toISOString(),
  consent_scope: PRIVACY_CONSENT_SCOPES,
  notice_path: "/privacy",
});

const hasAcceptedPrivacyPolicy = (body) =>
  body?.privacy_policy_accepted === true &&
  typeof body?.privacy_policy_version === "string" &&
  body.privacy_policy_version.trim().length > 0;

module.exports = {
  PRIVACY_POLICY_VERSION,
  PRIVACY_CONSENT_SCOPES,
  buildPrivacyConsentRecord,
  hasAcceptedPrivacyPolicy,
};
