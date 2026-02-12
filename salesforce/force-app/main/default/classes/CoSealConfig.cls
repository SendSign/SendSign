/**
 * SendSignConfig — Accessor for SendSign custom settings.
 * Provides a clean API for reading and validating SendSign configuration.
 */
public with sharing class SendSignConfig {

    /**
     * Get the SendSign API URL from custom settings.
     * @return The base API URL (e.g., https://sendsign.example.com)
     */
    public static String getApiUrl() {
        SendSign_Settings__c settings = SendSign_Settings__c.getOrgDefaults();
        if (settings == null || String.isBlank(settings.API_URL__c)) {
            throw new ConfigException('SendSign API URL is not configured. Go to Setup → Custom Settings → SendSign Settings.');
        }
        return settings.API_URL__c;
    }

    /**
     * Get the SendSign API key from custom settings.
     * @return The API key for authentication
     */
    public static String getApiKey() {
        SendSign_Settings__c settings = SendSign_Settings__c.getOrgDefaults();
        if (settings == null || String.isBlank(settings.API_Key__c)) {
            throw new ConfigException('SendSign API Key is not configured. Go to Setup → Custom Settings → SendSign Settings.');
        }
        return settings.API_Key__c;
    }

    /**
     * Get the default template ID (if configured).
     * @return The default template UUID, or null if not configured
     */
    public static String getDefaultTemplate() {
        SendSign_Settings__c settings = SendSign_Settings__c.getOrgDefaults();
        return settings != null ? settings.Default_Template__c : null;
    }

    /**
     * Check if SendSign is properly configured.
     * @return true if API URL and API Key are both set
     */
    public static Boolean isConfigured() {
        SendSign_Settings__c settings = SendSign_Settings__c.getOrgDefaults();
        return settings != null
            && String.isNotBlank(settings.API_URL__c)
            && String.isNotBlank(settings.API_Key__c);
    }

    /**
     * Test the connection to the SendSign API.
     * @return Map with 'connected' boolean and optional 'error' string
     */
    @AuraEnabled
    public static Map<String, Object> testConnection() {
        Map<String, Object> result = new Map<String, Object>();

        if (!isConfigured()) {
            result.put('connected', false);
            result.put('error', 'SendSign is not configured. Set API URL and API Key in Custom Settings.');
            return result;
        }

        try {
            SendSign_Settings__c settings = SendSign_Settings__c.getOrgDefaults();
            HttpRequest req = new HttpRequest();
            req.setEndpoint(settings.API_URL__c + '/api/health');
            req.setMethod('GET');
            req.setHeader('Authorization', 'Bearer ' + settings.API_Key__c);
            req.setTimeout(10000);

            Http http = new Http();
            HttpResponse res = http.send(req);

            if (res.getStatusCode() == 200) {
                result.put('connected', true);
            } else {
                result.put('connected', false);
                result.put('error', 'API returned status ' + res.getStatusCode());
            }
        } catch (Exception e) {
            result.put('connected', false);
            result.put('error', e.getMessage());
        }

        return result;
    }

    /**
     * Save SendSign settings.
     */
    @AuraEnabled
    public static void saveSettings(String apiUrl, String apiKey, String defaultTemplate) {
        SendSign_Settings__c settings = SendSign_Settings__c.getOrgDefaults();
        if (settings == null) {
            settings = new SendSign_Settings__c();
        }

        settings.API_URL__c = apiUrl;
        settings.API_Key__c = apiKey;
        settings.Default_Template__c = defaultTemplate;

        upsert settings;
    }

    public class ConfigException extends Exception {}
}
