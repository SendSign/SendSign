import type { Signer, Envelope } from '../db/schema.js';

export interface EnvelopeWithSigners {
  id: string;
  signingOrder: string; // 'sequential' | 'parallel'
  status: string;
  routingRules?: unknown;
  signers: SignerInfo[];
}

export interface SignerInfo {
  id: string;
  name: string;
  email: string;
  order: number;
  signingGroup: number | null;
  status: string;
}

export interface RoutingRule {
  condition: 'field_value' | 'signer_declined' | 'after_signer_completes';
  fieldId?: string;
  operator?: 'eq' | 'neq' | 'gt' | 'lt';
  value?: string;
  action: 'skip_to' | 'route_to' | 'add_signer' | 'delay';
  targetSignerOrder?: number;
  signerEmail?: string;
  signerOrder?: number; // For delay routing - which signer completion triggers delay
  delayHours?: number; // For delay action
  then?: 'advance_to_next' | 'skip_to' | 'complete';
}

export interface RoutingDecision {
  action: 'continue' | 'skip_to' | 'route_to' | 'add_signer' | 'complete';
  targetSignerOrder?: number;
  signerEmail?: string;
  reason?: string;
}

/**
 * Get the next signers who should be notified/allowed to sign.
 * Supports sequential, parallel, and mixed (group-based) ordering.
 */
export function getNextSigners(envelope: EnvelopeWithSigners): SignerInfo[] {
  // pending, sent, and notified all mean "hasn't signed yet"
  const preSigningStatuses = ['pending', 'sent', 'notified'];
  const pendingSigners = envelope.signers.filter(
    (s) => preSigningStatuses.includes(s.status),
  );

  if (pendingSigners.length === 0) return [];

  if (envelope.signingOrder === 'parallel') {
    return pendingSigners;
  }

  // Sequential or mixed: use signing groups
  // Sort by order, then find the lowest order group that hasn't completed
  const completedOrders = new Set(
    envelope.signers
      .filter((s) => s.status === 'completed' || s.status === 'signed')
      .map((s) => s.order),
  );

  // Find the minimum order among pending signers
  const minPendingOrder = Math.min(...pendingSigners.map((s) => s.order));

  // Get all pending signers at the same order (they're in the same parallel group)
  const nextGroup = pendingSigners.filter((s) => {
    // If signing groups are used, group by signingGroup
    if (s.signingGroup !== null) {
      const minGroup = Math.min(
        ...pendingSigners.filter((p) => p.signingGroup !== null).map((p) => p.signingGroup!),
      );
      return s.signingGroup === minGroup;
    }
    // Otherwise, by order
    return s.order === minPendingOrder;
  });

  return nextGroup;
}

/**
 * Check if a signer is allowed to sign at this point.
 */
export function canSignerSign(
  signer: SignerInfo,
  envelope: EnvelopeWithSigners,
): boolean {
  if (envelope.status !== 'sent' && envelope.status !== 'in_progress') {
    return false;
  }

  const preSigningStatuses = ['pending', 'sent', 'notified'];
  if (!preSigningStatuses.includes(signer.status)) {
    return false;
  }

  const nextSigners = getNextSigners(envelope);
  return nextSigners.some((s) => s.id === signer.id);
}

/**
 * After a signer completes, determine what happens next.
 * Handles delay routing rules for cooling-off periods.
 */
export function onSignerCompleted(
  envelope: EnvelopeWithSigners,
  completedSignerId: string,
): { 
  isComplete: boolean; 
  nextSigners: SignerInfo[];
  delayedSigners?: Array<{ signerId: string; delayedUntil: Date; delayHours: number }>;
} {
  // Update the signer's status in the local copy
  const completedSigner = envelope.signers.find((s) => s.id === completedSignerId);
  const updatedSigners = envelope.signers.map((s) =>
    s.id === completedSignerId ? { ...s, status: 'completed' } : s,
  );

  const updatedEnvelope = { ...envelope, signers: updatedSigners };

  // Check if all signers are done
  const allDone = updatedSigners.every(
    (s) => s.status === 'completed' || s.status === 'signed' || s.status === 'declined',
  );

  if (allDone) {
    return { isComplete: true, nextSigners: [] };
  }

  // Check for delay routing rules
  const rules = envelope.routingRules as RoutingRule[] | undefined;
  const delayedSigners: Array<{ signerId: string; delayedUntil: Date; delayHours: number }> = [];

  if (rules && Array.isArray(rules) && completedSigner) {
    for (const rule of rules) {
      if (
        rule.condition === 'after_signer_completes' &&
        rule.action === 'delay' &&
        rule.signerOrder === completedSigner.order &&
        rule.delayHours
      ) {
        // Find the next signer(s) to delay
        const nextOrder = completedSigner.order + 1;
        const signersToDelay = updatedSigners.filter(
          (s) => s.order === nextOrder && (s.status === 'pending' || s.status === 'sent'),
        );

        for (const signer of signersToDelay) {
          const delayedUntil = new Date(Date.now() + rule.delayHours * 60 * 60 * 1000);
          delayedSigners.push({
            signerId: signer.id,
            delayedUntil,
            delayHours: rule.delayHours,
          });
        }
      }
    }
  }

  // If there are delayed signers, they won't be in nextSigners yet
  if (delayedSigners.length > 0) {
    return { isComplete: false, nextSigners: [], delayedSigners };
  }

  // Get next batch of signers (excluding delayed ones)
  const nextSigners = getNextSigners(updatedEnvelope);
  return { isComplete: false, nextSigners };
}

/**
 * Evaluate routing rules after a signer completes.
 */
export function evaluateRoutingRules(
  envelope: EnvelopeWithSigners,
  completedSigner: SignerInfo,
  fieldValues: Record<string, string | number | boolean | null>,
): RoutingDecision {
  const rules = envelope.routingRules as RoutingRule[] | undefined;
  if (!rules || !Array.isArray(rules)) {
    return { action: 'continue' };
  }

  for (const rule of rules) {
    if (rule.condition === 'signer_declined' && completedSigner.status === 'declined') {
      return {
        action: rule.action as RoutingDecision['action'],
        targetSignerOrder: rule.targetSignerOrder,
        signerEmail: rule.signerEmail,
        reason: 'Signer declined',
      };
    }

    if (rule.condition === 'field_value' && rule.fieldId) {
      const value = fieldValues[rule.fieldId];
      if (value === undefined || value === null) continue;

      const strValue = String(value);
      let matched = false;

      switch (rule.operator) {
        case 'eq':
          matched = strValue === rule.value;
          break;
        case 'neq':
          matched = strValue !== rule.value;
          break;
        case 'gt':
          matched = Number(strValue) > Number(rule.value);
          break;
        case 'lt':
          matched = Number(strValue) < Number(rule.value);
          break;
      }

      if (matched) {
        return {
          action: rule.action as RoutingDecision['action'],
          targetSignerOrder: rule.targetSignerOrder,
          signerEmail: rule.signerEmail,
          reason: `Field ${rule.fieldId} ${rule.operator} ${rule.value}`,
        };
      }
    }
  }

  return { action: 'continue' };
}
