/**
 * Integrations module — ecosystem connectors for SendSign.
 * @module integrations
 */

export type { SendSignIntegration, IntegrationConfig } from './types.js';
export { integrationRegistry } from './registry.js';
export { SlackIntegration } from './slack.js';
export { BoxIntegration } from './box.js';
export { EgnyteIntegration } from './egnyte.js';
export { GoogleDriveIntegration } from './google.js';
export { Microsoft365Integration } from './microsoft365.js';
export { JiraIntegration } from './jira.js';
