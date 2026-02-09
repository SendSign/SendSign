/**
 * Integration registry and manager.
 * Handles registration, initialization, and lifecycle of all integrations.
 */

import type { CoSealIntegration, IntegrationConfig } from './types.js';
import type { Envelope } from '../db/schema.js';

/**
 * Central registry for all available integrations.
 */
class IntegrationRegistry {
  private integrations = new Map<string, CoSealIntegration>();
  private instances = new Map<string, CoSealIntegration>();

  constructor() {
    // Register all available integrations (lazy-loaded)
    this.registerAll();
  }

  private async registerAll(): Promise<void> {
    // Lazy import to avoid loading heavy dependencies at startup
    const { SlackIntegration } = await import('./slack.js');
    const { BoxIntegration } = await import('./box.js');
    const { EgnyteIntegration } = await import('./egnyte.js');
    const { GoogleDriveIntegration } = await import('./google.js');
    const { Microsoft365Integration } = await import('./microsoft365.js');
    const { JiraIntegration } = await import('./jira.js');

    this.register(new SlackIntegration());
    this.register(new BoxIntegration());
    this.register(new EgnyteIntegration());
    this.register(new GoogleDriveIntegration());
    this.register(new Microsoft365Integration());
    this.register(new JiraIntegration());
  }

  /**
   * Register an integration.
   */
  register(integration: CoSealIntegration): void {
    this.integrations.set(integration.name, integration);
  }

  /**
   * Get list of all available integrations.
   */
  async listAvailable(): Promise<Array<{
    name: string;
    displayName: string;
    description: string;
    enabled: boolean;
  }>> {
    // Ensure all integrations are loaded
    if (this.integrations.size === 0) {
      await this.registerAll();
    }

    return Array.from(this.integrations.values()).map((integration) => ({
      name: integration.name,
      displayName: integration.displayName,
      description: integration.description,
      enabled: this.instances.has(integration.name),
    }));
  }

  /**
   * Get an integration by name.
   */
  async get(name: string): Promise<CoSealIntegration | undefined> {
    // Ensure all integrations are loaded
    if (this.integrations.size === 0) {
      await this.registerAll();
    }

    return this.integrations.get(name);
  }

  /**
   * Get an initialized (enabled) integration instance.
   */
  getInstance(name: string): CoSealIntegration | undefined {
    return this.instances.get(name);
  }

  /**
   * Initialize and enable an integration.
   */
  async enable(name: string, config: Record<string, string>): Promise<void> {
    // Ensure all integrations are loaded
    if (this.integrations.size === 0) {
      await this.registerAll();
    }

    const integration = this.integrations.get(name);
    if (!integration) {
      throw new Error(`Integration not found: ${name}`);
    }

    // Create a new instance for this configuration
    const IntegrationClass = integration.constructor as new () => CoSealIntegration;
    const instance = new IntegrationClass();

    await instance.initialize(config);

    this.instances.set(name, instance);
  }

  /**
   * Disable an integration.
   */
  async disable(name: string): Promise<void> {
    const instance = this.instances.get(name);
    if (instance?.destroy) {
      await instance.destroy();
    }

    this.instances.delete(name);
  }

  /**
   * Test an integration connection.
   */
  async test(name: string): Promise<{ success: boolean; message: string }> {
    const instance = this.instances.get(name);
    if (!instance) {
      return { success: false, message: `Integration ${name} is not enabled` };
    }

    if (!instance.testConnection) {
      return { success: true, message: 'Test connection not implemented for this integration' };
    }

    return instance.testConnection();
  }

  /**
   * Get all enabled integration instances.
   */
  getAllEnabled(): CoSealIntegration[] {
    return Array.from(this.instances.values());
  }

  /**
   * Dispatch an event to all enabled integrations.
   */
  async dispatchEvent(
    eventType: 'envelopeSent' | 'envelopeCompleted' | 'envelopeVoided' | 'signerCompleted',
    payload: { envelope: Envelope; signer?: { id: string; name: string; email: string } },
  ): Promise<void> {
    const enabledIntegrations = this.getAllEnabled();

    // Fire all integration handlers in parallel
    const promises = enabledIntegrations.map(async (integration) => {
      try {
        switch (eventType) {
          case 'envelopeSent':
            if (integration.onEnvelopeSent) {
              await integration.onEnvelopeSent(payload.envelope);
            }
            break;
          case 'envelopeCompleted':
            if (integration.onEnvelopeCompleted) {
              await integration.onEnvelopeCompleted(payload.envelope);
            }
            break;
          case 'envelopeVoided':
            if (integration.onEnvelopeVoided) {
              await integration.onEnvelopeVoided(payload.envelope);
            }
            break;
          case 'signerCompleted':
            if (integration.onSignerCompleted && payload.signer) {
              await integration.onSignerCompleted(payload.signer, payload.envelope);
            }
            break;
        }
      } catch (error) {
        console.error(`Integration ${integration.name} failed for ${eventType}:`, error);
        // Log but don't throw — integrations should not break the main flow
      }
    });

    await Promise.allSettled(promises);
  }
}

// Singleton instance
export const integrationRegistry = new IntegrationRegistry();
