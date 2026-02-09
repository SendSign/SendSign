/**
 * CoSealWebhookHandler — REST endpoint to receive webhook callbacks from CoSeal.
 * Handles envelope completion, decline, and voiding events.
 * Auto-attaches signed documents to the originating Salesforce record.
 */
@RestResource(urlMapping='/coseal/webhook')
global with sharing class CoSealWebhookHandler {

    @HttpPost
    global static void handleWebhook() {
        RestRequest req = RestContext.request;
        String body = req.requestBody.toString();

        // Verify HMAC signature
        String signature = req.headers.get('X-CoSeal-Signature');
        if (signature != null && !verifySignature(body, signature)) {
            RestContext.response.statusCode = 401;
            RestContext.response.responseBody = Blob.valueOf('{"error": "Invalid signature"}');
            return;
        }

        Map<String, Object> payload = (Map<String, Object>) JSON.deserializeUntyped(body);
        String eventType = (String) payload.get('event');
        Map<String, Object> data = (Map<String, Object>) payload.get('data');

        if (data == null) {
            RestContext.response.statusCode = 400;
            RestContext.response.responseBody = Blob.valueOf('{"error": "Missing data in payload"}');
            return;
        }

        Map<String, Object> metadata = (Map<String, Object>) data.get('metadata');
        String recordId = metadata != null ? (String) metadata.get('salesforce_record_id') : null;

        if (recordId == null) {
            // No Salesforce record linked — acknowledge but skip processing
            RestContext.response.statusCode = 200;
            RestContext.response.responseBody = Blob.valueOf('{"status": "ok", "message": "No Salesforce record linked"}');
            return;
        }

        try {
            if (eventType == 'envelope.completed') {
                attachCompletedDocument(recordId, data);
                updateRecordStatus(recordId, 'Completed');
            } else if (eventType == 'envelope.declined') {
                updateRecordStatus(recordId, 'Declined');
            } else if (eventType == 'envelope.voided') {
                updateRecordStatus(recordId, 'Voided');
            } else if (eventType == 'envelope.sent') {
                updateRecordStatus(recordId, 'Sent');
            } else if (eventType == 'signer.completed') {
                // Individual signer completed — could update a related list
                updateRecordStatus(recordId, 'In Progress');
            }

            RestContext.response.statusCode = 200;
            RestContext.response.responseBody = Blob.valueOf('{"status": "ok"}');
        } catch (Exception e) {
            RestContext.response.statusCode = 500;
            RestContext.response.responseBody = Blob.valueOf(
                '{"error": "' + e.getMessage().escapeJava() + '"}'
            );
        }
    }

    /**
     * Verify HMAC-SHA256 signature from CoSeal webhook.
     */
    private static Boolean verifySignature(String body, String signature) {
        CoSeal_Settings__c settings = CoSeal_Settings__c.getOrgDefaults();
        String webhookSecret = settings.API_Key__c; // Use API key as webhook secret

        if (String.isBlank(webhookSecret)) {
            return true; // No secret configured — skip verification
        }

        Blob hmac = Crypto.generateMac(
            'hmacSHA256',
            Blob.valueOf(body),
            Blob.valueOf(webhookSecret)
        );
        String computed = EncodingUtil.convertToHex(hmac);

        return computed.equalsIgnoreCase(signature);
    }

    /**
     * Download the sealed PDF from CoSeal and attach it to the Salesforce record.
     */
    private static void attachCompletedDocument(String recordId, Map<String, Object> data) {
        String envelopeId = (String) data.get('id');
        String subject = (String) data.get('subject');

        // Download the sealed document
        Blob pdfBlob = CoSealService.downloadSealedDocument(envelopeId);

        // Create ContentVersion (Salesforce Files)
        ContentVersion cv = new ContentVersion();
        cv.Title = 'Signed - ' + (subject != null ? subject : 'Document');
        cv.PathOnClient = 'signed_document_' + envelopeId.substring(0, 8) + '.pdf';
        cv.VersionData = pdfBlob;
        cv.Description = 'CoSeal signed document. Envelope ID: ' + envelopeId;
        insert cv;

        // Link to the originating record
        ContentVersion inserted = [SELECT ContentDocumentId FROM ContentVersion WHERE Id = :cv.Id];
        ContentDocumentLink cdl = new ContentDocumentLink();
        cdl.ContentDocumentId = inserted.ContentDocumentId;
        cdl.LinkedEntityId = recordId;
        cdl.ShareType = 'V'; // Viewer access
        cdl.Visibility = 'AllUsers';
        insert cdl;
    }

    /**
     * Update a custom status field on the originating record.
     * Looks for a field named CoSeal_Status__c on the object.
     */
    private static void updateRecordStatus(String recordId, String status) {
        try {
            Id sfId = Id.valueOf(recordId);
            String objectType = sfId.getSObjectType().getDescribe().getName();

            // Check if the object has a CoSeal_Status__c field
            Map<String, Schema.SObjectField> fieldMap = sfId.getSObjectType().getDescribe().fields.getMap();

            if (fieldMap.containsKey('CoSeal_Status__c')) {
                SObject record = sfId.getSObjectType().newSObject(sfId);
                record.put('CoSeal_Status__c', status);
                update record;
            }
        } catch (Exception e) {
            System.debug(LoggingLevel.WARN, 'Failed to update record status: ' + e.getMessage());
            // Non-critical — don't throw
        }
    }
}
