/**
 * CoSealService — Core service class for CoSeal API integration.
 * Handles HTTP callouts for envelope creation, status tracking, and merge data.
 */
public with sharing class CoSealService {

    /**
     * Create and send an envelope from a Salesforce record.
     * @param recordId  The Salesforce record ID to link the envelope to
     * @param templateId  The CoSeal template UUID
     * @param signers  List of signer information
     * @param mergeData  Map of merge field names to values
     * @return The created envelope ID
     */
    public static String sendForSignature(
        Id recordId,
        String templateId,
        List<SignerInfo> signers,
        Map<String, String> mergeData
    ) {
        CoSeal_Settings__c settings = CoSeal_Settings__c.getOrgDefaults();
        String endpoint = settings.API_URL__c + '/api/envelopes/generate';

        HttpRequest req = new HttpRequest();
        req.setEndpoint(endpoint);
        req.setMethod('POST');
        req.setHeader('Authorization', 'Bearer ' + settings.API_Key__c);
        req.setHeader('Content-Type', 'application/json');
        req.setTimeout(30000);

        // Build request body
        Map<String, Object> body = new Map<String, Object>{
            'templateId' => templateId,
            'mergeData' => mergeData,
            'signers' => signers,
            'metadata' => new Map<String, Object>{
                'salesforce_record_id' => String.valueOf(recordId),
                'salesforce_object_type' => recordId.getSObjectType().getDescribe().getName()
            },
            'webhookUrl' => URL.getOrgDomainUrl().toExternalForm() + '/services/apexrest/coseal/webhook'
        };

        req.setBody(JSON.serialize(body));

        Http http = new Http();
        HttpResponse res = http.send(req);

        if (res.getStatusCode() == 200 || res.getStatusCode() == 201) {
            Map<String, Object> result = (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
            Map<String, Object> data = (Map<String, Object>) result.get('data');
            return (String) data.get('envelopeId');
        } else {
            throw new CoSealException('Failed to create envelope: ' + res.getBody());
        }
    }

    /**
     * Send envelope for signing (send an already-created envelope).
     * @param envelopeId  The CoSeal envelope UUID
     * @return true if sent successfully
     */
    public static Boolean sendEnvelope(String envelopeId) {
        CoSeal_Settings__c settings = CoSeal_Settings__c.getOrgDefaults();
        String endpoint = settings.API_URL__c + '/api/envelopes/' + envelopeId + '/send';

        HttpRequest req = new HttpRequest();
        req.setEndpoint(endpoint);
        req.setMethod('POST');
        req.setHeader('Authorization', 'Bearer ' + settings.API_Key__c);
        req.setHeader('Content-Type', 'application/json');

        Http http = new Http();
        HttpResponse res = http.send(req);

        return res.getStatusCode() == 200;
    }

    /**
     * Get embedded signing URL for iframe-based signing within Salesforce.
     * @param envelopeId  The CoSeal envelope UUID
     * @param signerEmail  The email of the signer to create a signing URL for
     * @return Signing URL that can be loaded in an iframe
     */
    public static String getEmbeddedSigningUrl(String envelopeId, String signerEmail) {
        CoSeal_Settings__c settings = CoSeal_Settings__c.getOrgDefaults();
        String endpoint = settings.API_URL__c + '/api/envelopes/' + envelopeId + '/embedded-signing';

        HttpRequest req = new HttpRequest();
        req.setEndpoint(endpoint);
        req.setMethod('POST');
        req.setHeader('Authorization', 'Bearer ' + settings.API_Key__c);
        req.setHeader('Content-Type', 'application/json');

        Map<String, Object> body = new Map<String, Object>{
            'signerEmail' => signerEmail,
            'returnUrl' => URL.getOrgDomainUrl().toExternalForm()
        };
        req.setBody(JSON.serialize(body));

        Http http = new Http();
        HttpResponse res = http.send(req);

        if (res.getStatusCode() == 200) {
            Map<String, Object> result = (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
            Map<String, Object> data = (Map<String, Object>) result.get('data');
            return (String) data.get('url');
        } else {
            throw new CoSealException('Failed to get signing URL: ' + res.getBody());
        }
    }

    /**
     * Get envelope status from CoSeal API.
     * @param envelopeId  The CoSeal envelope UUID
     * @return Map containing envelope status data
     */
    public static Map<String, Object> getEnvelopeStatus(String envelopeId) {
        CoSeal_Settings__c settings = CoSeal_Settings__c.getOrgDefaults();
        String endpoint = settings.API_URL__c + '/api/envelopes/' + envelopeId;

        HttpRequest req = new HttpRequest();
        req.setEndpoint(endpoint);
        req.setMethod('GET');
        req.setHeader('Authorization', 'Bearer ' + settings.API_Key__c);

        Http http = new Http();
        HttpResponse res = http.send(req);

        if (res.getStatusCode() == 200) {
            Map<String, Object> result = (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
            return (Map<String, Object>) result.get('data');
        } else {
            throw new CoSealException('Failed to get envelope status: ' + res.getBody());
        }
    }

    /**
     * Download the sealed PDF for a completed envelope.
     * @param envelopeId  The CoSeal envelope UUID
     * @return PDF file as a Blob
     */
    public static Blob downloadSealedDocument(String envelopeId) {
        CoSeal_Settings__c settings = CoSeal_Settings__c.getOrgDefaults();
        String endpoint = settings.API_URL__c + '/api/envelopes/' + envelopeId + '/download';

        HttpRequest req = new HttpRequest();
        req.setEndpoint(endpoint);
        req.setMethod('GET');
        req.setHeader('Authorization', 'Bearer ' + settings.API_Key__c);

        Http http = new Http();
        HttpResponse res = http.send(req);

        if (res.getStatusCode() == 200) {
            return res.getBodyAsBlob();
        } else {
            throw new CoSealException('Failed to download document: ' + res.getBody());
        }
    }

    /**
     * Auto-populate merge data from a Salesforce record using field mappings.
     * @param recordId  The Salesforce record ID
     * @param fieldMapping  Map of Salesforce field API names to CoSeal merge field names
     * @return Map of merge field names to values
     */
    public static Map<String, String> buildMergeData(Id recordId, Map<String, String> fieldMapping) {
        String objectType = recordId.getSObjectType().getDescribe().getName();
        List<String> fieldNames = new List<String>(fieldMapping.keySet());

        String query = 'SELECT ' + String.join(fieldNames, ',') +
            ' FROM ' + objectType +
            ' WHERE Id = :recordId';

        SObject record = Database.query(query);

        Map<String, String> mergeData = new Map<String, String>();
        for (String sfField : fieldMapping.keySet()) {
            Object value = record.get(sfField);
            mergeData.put(fieldMapping.get(sfField), value != null ? String.valueOf(value) : '');
        }
        return mergeData;
    }

    /**
     * Send a signing reminder to a pending signer.
     * @param envelopeId  The CoSeal envelope UUID
     * @param signerEmail  The email of the signer to remind
     * @return true if reminder sent successfully
     */
    public static Boolean sendReminder(String envelopeId, String signerEmail) {
        CoSeal_Settings__c settings = CoSeal_Settings__c.getOrgDefaults();
        String endpoint = settings.API_URL__c + '/api/envelopes/' + envelopeId + '/remind';

        HttpRequest req = new HttpRequest();
        req.setEndpoint(endpoint);
        req.setMethod('POST');
        req.setHeader('Authorization', 'Bearer ' + settings.API_Key__c);
        req.setHeader('Content-Type', 'application/json');

        Map<String, Object> body = new Map<String, Object>{
            'signerEmail' => signerEmail
        };
        req.setBody(JSON.serialize(body));

        Http http = new Http();
        HttpResponse res = http.send(req);

        return res.getStatusCode() == 200;
    }

    /**
     * Void (cancel) an in-progress envelope.
     * @param envelopeId  The CoSeal envelope UUID
     * @param reason  The reason for voiding
     * @return true if voided successfully
     */
    public static Boolean voidEnvelope(String envelopeId, String reason) {
        CoSeal_Settings__c settings = CoSeal_Settings__c.getOrgDefaults();
        String endpoint = settings.API_URL__c + '/api/envelopes/' + envelopeId + '/void';

        HttpRequest req = new HttpRequest();
        req.setEndpoint(endpoint);
        req.setMethod('POST');
        req.setHeader('Authorization', 'Bearer ' + settings.API_Key__c);
        req.setHeader('Content-Type', 'application/json');

        Map<String, Object> body = new Map<String, Object>{
            'reason' => reason
        };
        req.setBody(JSON.serialize(body));

        Http http = new Http();
        HttpResponse res = http.send(req);

        return res.getStatusCode() == 200;
    }

    /**
     * List available templates from CoSeal.
     * @return List of template maps with id and name
     */
    public static List<Map<String, Object>> listTemplates() {
        CoSeal_Settings__c settings = CoSeal_Settings__c.getOrgDefaults();
        String endpoint = settings.API_URL__c + '/api/templates';

        HttpRequest req = new HttpRequest();
        req.setEndpoint(endpoint);
        req.setMethod('GET');
        req.setHeader('Authorization', 'Bearer ' + settings.API_Key__c);

        Http http = new Http();
        HttpResponse res = http.send(req);

        if (res.getStatusCode() == 200) {
            Map<String, Object> result = (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
            return (List<Map<String, Object>>) result.get('data');
        } else {
            throw new CoSealException('Failed to list templates: ' + res.getBody());
        }
    }

    // ─── Inner Classes ──────────────────────────────────────────

    public class SignerInfo {
        @AuraEnabled public String email;
        @AuraEnabled public String name;
        @AuraEnabled public String role;
        @AuraEnabled public Integer signingOrder;

        public SignerInfo() {}

        public SignerInfo(String email, String name) {
            this.email = email;
            this.name = name;
            this.role = 'signer';
            this.signingOrder = 1;
        }
    }

    public class CoSealException extends Exception {}
}
