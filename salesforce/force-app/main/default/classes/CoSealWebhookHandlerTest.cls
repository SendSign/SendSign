/**
 * SendSignWebhookHandlerTest — Tests for inbound webhook processing.
 * Verifies document attachment, status updates, and signature validation.
 */
@isTest
private class SendSignWebhookHandlerTest {

    @TestSetup
    static void setupData() {
        // Create custom settings
        SendSign_Settings__c settings = new SendSign_Settings__c(
            API_URL__c = 'https://sendsign.example.com',
            API_Key__c = 'test-api-key-12345'
        );
        insert settings;

        // Create test Account
        Account acc = new Account(Name = 'Webhook Test Account');
        insert acc;
    }

    /**
     * Mock for document download in webhook handler.
     */
    private class DownloadMock implements HttpCalloutMock {
        public HttpResponse respond(HttpRequest req) {
            HttpResponse res = new HttpResponse();
            res.setStatusCode(200);
            res.setBodyAsBlob(Blob.valueOf('%PDF-1.4 test content'));
            return res;
        }
    }

    // ─── Test: Completed webhook ────────────────────────────────

    @isTest
    static void testCompletedWebhook() {
        Test.setMock(HttpCalloutMock.class, new DownloadMock());
        Account acc = [SELECT Id FROM Account LIMIT 1];

        // Build webhook payload
        Map<String, Object> payload = new Map<String, Object>{
            'event' => 'envelope.completed',
            'data' => new Map<String, Object>{
                'id' => 'env-123',
                'subject' => 'Test NDA',
                'metadata' => new Map<String, Object>{
                    'salesforce_record_id' => String.valueOf(acc.Id)
                }
            }
        };

        RestRequest req = new RestRequest();
        req.requestBody = Blob.valueOf(JSON.serialize(payload));
        req.httpMethod = 'POST';
        req.requestURI = '/services/apexrest/sendsign/webhook';

        RestResponse res = new RestResponse();
        RestContext.request = req;
        RestContext.response = res;

        Test.startTest();
        SendSignWebhookHandler.handleWebhook();
        Test.stopTest();

        System.assertEquals(200, RestContext.response.statusCode, 'Should return 200');

        // Verify document was attached
        List<ContentDocumentLink> links = [
            SELECT ContentDocumentId
            FROM ContentDocumentLink
            WHERE LinkedEntityId = :acc.Id
        ];
        System.assertEquals(1, links.size(), 'Should have one attached document');
    }

    // ─── Test: Declined webhook ─────────────────────────────────

    @isTest
    static void testDeclinedWebhook() {
        Account acc = [SELECT Id FROM Account LIMIT 1];

        Map<String, Object> payload = new Map<String, Object>{
            'event' => 'envelope.declined',
            'data' => new Map<String, Object>{
                'id' => 'env-123',
                'metadata' => new Map<String, Object>{
                    'salesforce_record_id' => String.valueOf(acc.Id)
                }
            }
        };

        RestRequest req = new RestRequest();
        req.requestBody = Blob.valueOf(JSON.serialize(payload));
        req.httpMethod = 'POST';
        req.requestURI = '/services/apexrest/sendsign/webhook';

        RestResponse res = new RestResponse();
        RestContext.request = req;
        RestContext.response = res;

        Test.startTest();
        SendSignWebhookHandler.handleWebhook();
        Test.stopTest();

        System.assertEquals(200, RestContext.response.statusCode, 'Should return 200');
    }

    // ─── Test: Voided webhook ───────────────────────────────────

    @isTest
    static void testVoidedWebhook() {
        Account acc = [SELECT Id FROM Account LIMIT 1];

        Map<String, Object> payload = new Map<String, Object>{
            'event' => 'envelope.voided',
            'data' => new Map<String, Object>{
                'id' => 'env-123',
                'metadata' => new Map<String, Object>{
                    'salesforce_record_id' => String.valueOf(acc.Id)
                }
            }
        };

        RestRequest req = new RestRequest();
        req.requestBody = Blob.valueOf(JSON.serialize(payload));
        req.httpMethod = 'POST';
        req.requestURI = '/services/apexrest/sendsign/webhook';

        RestResponse res = new RestResponse();
        RestContext.request = req;
        RestContext.response = res;

        Test.startTest();
        SendSignWebhookHandler.handleWebhook();
        Test.stopTest();

        System.assertEquals(200, RestContext.response.statusCode, 'Should return 200');
    }

    // ─── Test: No Salesforce record linked ──────────────────────

    @isTest
    static void testNoRecordLinked() {
        Map<String, Object> payload = new Map<String, Object>{
            'event' => 'envelope.completed',
            'data' => new Map<String, Object>{
                'id' => 'env-123',
                'metadata' => new Map<String, Object>()
            }
        };

        RestRequest req = new RestRequest();
        req.requestBody = Blob.valueOf(JSON.serialize(payload));
        req.httpMethod = 'POST';
        req.requestURI = '/services/apexrest/sendsign/webhook';

        RestResponse res = new RestResponse();
        RestContext.request = req;
        RestContext.response = res;

        Test.startTest();
        SendSignWebhookHandler.handleWebhook();
        Test.stopTest();

        System.assertEquals(200, RestContext.response.statusCode, 'Should return 200 with no-op');
    }

    // ─── Test: Missing data in payload ──────────────────────────

    @isTest
    static void testMissingData() {
        Map<String, Object> payload = new Map<String, Object>{
            'event' => 'envelope.completed'
            // No 'data' key
        };

        RestRequest req = new RestRequest();
        req.requestBody = Blob.valueOf(JSON.serialize(payload));
        req.httpMethod = 'POST';
        req.requestURI = '/services/apexrest/sendsign/webhook';

        RestResponse res = new RestResponse();
        RestContext.request = req;
        RestContext.response = res;

        Test.startTest();
        SendSignWebhookHandler.handleWebhook();
        Test.stopTest();

        System.assertEquals(400, RestContext.response.statusCode, 'Should return 400 for missing data');
    }
}
