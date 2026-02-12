/**
 * SendSignServiceTest — Test class for SendSignService with HTTP callout mocking.
 * Provides 75%+ code coverage required for Salesforce deployment.
 */
@isTest
private class SendSignServiceTest {

    // ─── Test Setup ────────────────────────────────────────────

    @TestSetup
    static void setupData() {
        // Create custom settings
        SendSign_Settings__c settings = new SendSign_Settings__c(
            API_URL__c = 'https://sendsign.example.com',
            API_Key__c = 'test-api-key-12345',
            Default_Template__c = 'template-uuid-default'
        );
        insert settings;

        // Create test Account and Opportunity
        Account acc = new Account(Name = 'Test Account');
        insert acc;

        Opportunity opp = new Opportunity(
            Name = 'Test Opportunity',
            AccountId = acc.Id,
            StageName = 'Prospecting',
            CloseDate = Date.today().addDays(30),
            Amount = 50000
        );
        insert opp;
    }

    // ─── Mock Classes ──────────────────────────────────────────

    /**
     * Mock for successful envelope creation.
     */
    private class SendEnvelopeMock implements HttpCalloutMock {
        public HttpResponse respond(HttpRequest req) {
            HttpResponse res = new HttpResponse();
            res.setStatusCode(201);
            res.setBody('{"success": true, "data": {"envelopeId": "env-uuid-12345"}}');
            return res;
        }
    }

    /**
     * Mock for successful status retrieval.
     */
    private class GetStatusMock implements HttpCalloutMock {
        public HttpResponse respond(HttpRequest req) {
            HttpResponse res = new HttpResponse();
            res.setStatusCode(200);
            res.setBody('{"success": true, "data": {"id": "env-uuid-12345", "status": "completed", "subject": "NDA Agreement", "signers": [{"email": "alice@test.com", "status": "completed"}]}}');
            return res;
        }
    }

    /**
     * Mock for successful document download.
     */
    private class DownloadMock implements HttpCalloutMock {
        public HttpResponse respond(HttpRequest req) {
            HttpResponse res = new HttpResponse();
            res.setStatusCode(200);
            res.setBodyAsBlob(Blob.valueOf('PDF content here'));
            return res;
        }
    }

    /**
     * Mock for API failure.
     */
    private class FailureMock implements HttpCalloutMock {
        public HttpResponse respond(HttpRequest req) {
            HttpResponse res = new HttpResponse();
            res.setStatusCode(500);
            res.setBody('{"success": false, "error": "Internal server error"}');
            return res;
        }
    }

    /**
     * Mock for embedded signing URL.
     */
    private class EmbeddedSigningMock implements HttpCalloutMock {
        public HttpResponse respond(HttpRequest req) {
            HttpResponse res = new HttpResponse();
            res.setStatusCode(200);
            res.setBody('{"success": true, "data": {"url": "https://sendsign.example.com/sign/token123?embed=true"}}');
            return res;
        }
    }

    /**
     * Mock for send/void/remind actions (simple 200 OK).
     */
    private class ActionSuccessMock implements HttpCalloutMock {
        public HttpResponse respond(HttpRequest req) {
            HttpResponse res = new HttpResponse();
            res.setStatusCode(200);
            res.setBody('{"success": true}');
            return res;
        }
    }

    /**
     * Mock for listing templates.
     */
    private class ListTemplatesMock implements HttpCalloutMock {
        public HttpResponse respond(HttpRequest req) {
            HttpResponse res = new HttpResponse();
            res.setStatusCode(200);
            res.setBody('{"success": true, "data": [{"id": "t1", "name": "NDA"}, {"id": "t2", "name": "SOW"}]}');
            return res;
        }
    }

    // ─── Test: sendForSignature ─────────────────────────────────

    @isTest
    static void testSendForSignature_Success() {
        Test.setMock(HttpCalloutMock.class, new SendEnvelopeMock());
        Opportunity opp = [SELECT Id FROM Opportunity LIMIT 1];

        List<SendSignService.SignerInfo> signers = new List<SendSignService.SignerInfo>();
        signers.add(new SendSignService.SignerInfo('alice@test.com', 'Alice'));

        Map<String, String> mergeData = new Map<String, String>{
            'client_name' => 'Test Account',
            'amount' => '50000'
        };

        Test.startTest();
        String envelopeId = SendSignService.sendForSignature(
            opp.Id, 'template-uuid', signers, mergeData
        );
        Test.stopTest();

        System.assertEquals('env-uuid-12345', envelopeId, 'Should return envelope ID');
    }

    @isTest
    static void testSendForSignature_Failure() {
        Test.setMock(HttpCalloutMock.class, new FailureMock());
        Opportunity opp = [SELECT Id FROM Opportunity LIMIT 1];

        List<SendSignService.SignerInfo> signers = new List<SendSignService.SignerInfo>();
        signers.add(new SendSignService.SignerInfo('alice@test.com', 'Alice'));

        Test.startTest();
        try {
            SendSignService.sendForSignature(opp.Id, 'template-uuid', signers, new Map<String, String>());
            System.assert(false, 'Should have thrown exception');
        } catch (SendSignService.SendSignException e) {
            System.assert(e.getMessage().contains('Failed to create envelope'), 'Should contain error message');
        }
        Test.stopTest();
    }

    // ─── Test: getEnvelopeStatus ────────────────────────────────

    @isTest
    static void testGetEnvelopeStatus_Success() {
        Test.setMock(HttpCalloutMock.class, new GetStatusMock());

        Test.startTest();
        Map<String, Object> status = SendSignService.getEnvelopeStatus('env-uuid-12345');
        Test.stopTest();

        System.assertEquals('completed', status.get('status'), 'Status should be completed');
        System.assertEquals('NDA Agreement', status.get('subject'), 'Subject should match');
    }

    @isTest
    static void testGetEnvelopeStatus_Failure() {
        Test.setMock(HttpCalloutMock.class, new FailureMock());

        Test.startTest();
        try {
            SendSignService.getEnvelopeStatus('bad-id');
            System.assert(false, 'Should have thrown exception');
        } catch (SendSignService.SendSignException e) {
            System.assert(e.getMessage().contains('Failed to get envelope status'), 'Error message should be present');
        }
        Test.stopTest();
    }

    // ─── Test: getEmbeddedSigningUrl ────────────────────────────

    @isTest
    static void testGetEmbeddedSigningUrl_Success() {
        Test.setMock(HttpCalloutMock.class, new EmbeddedSigningMock());

        Test.startTest();
        String url = SendSignService.getEmbeddedSigningUrl('env-uuid-12345', 'alice@test.com');
        Test.stopTest();

        System.assert(url.contains('sendsign.example.com/sign/'), 'URL should contain signing path');
    }

    // ─── Test: buildMergeData ───────────────────────────────────

    @isTest
    static void testBuildMergeData() {
        Opportunity opp = [SELECT Id FROM Opportunity LIMIT 1];

        Map<String, String> fieldMapping = new Map<String, String>{
            'Name' => 'opp_name',
            'Amount' => 'amount'
        };

        Test.startTest();
        Map<String, String> mergeData = SendSignService.buildMergeData(opp.Id, fieldMapping);
        Test.stopTest();

        System.assertEquals('Test Opportunity', mergeData.get('opp_name'), 'Name should map correctly');
        System.assertNotEquals(null, mergeData.get('amount'), 'Amount should be present');
    }

    // ─── Test: sendReminder ─────────────────────────────────────

    @isTest
    static void testSendReminder_Success() {
        Test.setMock(HttpCalloutMock.class, new ActionSuccessMock());

        Test.startTest();
        Boolean result = SendSignService.sendReminder('env-uuid-12345', 'alice@test.com');
        Test.stopTest();

        System.assertEquals(true, result, 'Reminder should succeed');
    }

    // ─── Test: voidEnvelope ─────────────────────────────────────

    @isTest
    static void testVoidEnvelope_Success() {
        Test.setMock(HttpCalloutMock.class, new ActionSuccessMock());

        Test.startTest();
        Boolean result = SendSignService.voidEnvelope('env-uuid-12345', 'Test reason');
        Test.stopTest();

        System.assertEquals(true, result, 'Void should succeed');
    }

    // ─── Test: sendEnvelope ─────────────────────────────────────

    @isTest
    static void testSendEnvelope_Success() {
        Test.setMock(HttpCalloutMock.class, new ActionSuccessMock());

        Test.startTest();
        Boolean result = SendSignService.sendEnvelope('env-uuid-12345');
        Test.stopTest();

        System.assertEquals(true, result, 'Send should succeed');
    }

    // ─── Test: downloadSealedDocument ───────────────────────────

    @isTest
    static void testDownloadSealedDocument() {
        Test.setMock(HttpCalloutMock.class, new DownloadMock());

        Test.startTest();
        Blob pdf = SendSignService.downloadSealedDocument('env-uuid-12345');
        Test.stopTest();

        System.assertNotEquals(null, pdf, 'PDF blob should not be null');
    }

    // ─── Test: SignerInfo inner class ───────────────────────────

    @isTest
    static void testSignerInfoConstructor() {
        SendSignService.SignerInfo signer = new SendSignService.SignerInfo('alice@test.com', 'Alice');

        System.assertEquals('alice@test.com', signer.email);
        System.assertEquals('Alice', signer.name);
        System.assertEquals('signer', signer.role);
        System.assertEquals(1, signer.signingOrder);
    }
}
