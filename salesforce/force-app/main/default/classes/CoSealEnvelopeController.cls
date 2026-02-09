/**
 * CoSealEnvelopeController — Apex controller for Lightning Web Components.
 * Provides @AuraEnabled methods that LWC components can call.
 */
public with sharing class CoSealEnvelopeController {

    /**
     * Send a document for signature from a record page.
     * Called from the cosealSendButton LWC component.
     */
    @AuraEnabled
    public static String sendForSignature(
        Id recordId,
        String templateId,
        String signerEmail,
        String signerName
    ) {
        // Build signer list
        List<CoSealService.SignerInfo> signers = new List<CoSealService.SignerInfo>();
        CoSealService.SignerInfo signer = new CoSealService.SignerInfo(signerEmail, signerName);
        signers.add(signer);

        // Get field mappings for this template
        Map<String, String> fieldMapping = getFieldMappings(templateId);
        Map<String, String> mergeData = new Map<String, String>();

        if (!fieldMapping.isEmpty()) {
            mergeData = CoSealService.buildMergeData(recordId, fieldMapping);
        }

        // Create and send envelope
        String envelopeId = CoSealService.sendForSignature(recordId, templateId, signers, mergeData);

        // Optionally send it immediately
        CoSealService.sendEnvelope(envelopeId);

        return envelopeId;
    }

    /**
     * Get the signing URL for embedded signing within Salesforce.
     */
    @AuraEnabled
    public static String getSigningUrl(String envelopeId, String signerEmail) {
        return CoSealService.getEmbeddedSigningUrl(envelopeId, signerEmail);
    }

    /**
     * Get the current status of an envelope.
     */
    @AuraEnabled(cacheable=true)
    public static Map<String, Object> getStatus(String envelopeId) {
        return CoSealService.getEnvelopeStatus(envelopeId);
    }

    /**
     * Send a reminder to a pending signer.
     */
    @AuraEnabled
    public static Boolean sendReminder(String envelopeId, String signerEmail) {
        return CoSealService.sendReminder(envelopeId, signerEmail);
    }

    /**
     * Void an in-progress envelope.
     */
    @AuraEnabled
    public static Boolean voidEnvelope(String envelopeId, String reason) {
        return CoSealService.voidEnvelope(envelopeId, reason);
    }

    /**
     * List available templates for the template selector.
     */
    @AuraEnabled(cacheable=true)
    public static List<Map<String, Object>> getTemplates() {
        return CoSealService.listTemplates();
    }

    /**
     * Download the signed document.
     */
    @AuraEnabled
    public static String downloadDocument(String envelopeId) {
        Blob pdfBlob = CoSealService.downloadSealedDocument(envelopeId);
        return EncodingUtil.base64Encode(pdfBlob);
    }

    // ─── Private Helpers ────────────────────────────────────────

    /**
     * Get field mappings from custom metadata for a specific template.
     */
    private static Map<String, String> getFieldMappings(String templateId) {
        Map<String, String> mappings = new Map<String, String>();

        // Query custom metadata for field mappings
        // In a real deployment, this would query CoSeal_Field_Mapping__mdt
        // For now, return default mappings based on common patterns
        List<CoSeal_Field_Mapping__mdt> fieldMappings = [
            SELECT Salesforce_Field__c, CoSeal_Merge_Field__c
            FROM CoSeal_Field_Mapping__mdt
            WHERE Template_Id__c = :templateId OR Template_Id__c = 'All'
        ];

        for (CoSeal_Field_Mapping__mdt fm : fieldMappings) {
            mappings.put(fm.Salesforce_Field__c, fm.CoSeal_Merge_Field__c);
        }

        return mappings;
    }
}
