import { LightningElement } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import testConnection from '@salesforce/apex/CoSealConfig.testConnection';
import saveSettings from '@salesforce/apex/CoSealConfig.saveSettings';

export default class CosealConfig extends LightningElement {
    apiUrl = '';
    apiKey = '';
    defaultTemplate = '';

    isTesting = false;
    isSaving = false;
    connectionResult = null;
    connectionMessage = '';
    saveMessage = '';

    get connectionResultClass() {
        return this.connectionResult
            ? 'slds-box slds-m-top_small slds-theme_success'
            : 'slds-box slds-m-top_small slds-theme_error';
    }

    get connectionIcon() {
        return this.connectionResult
            ? 'utility:success'
            : 'utility:error';
    }

    handleApiUrlChange(event) {
        this.apiUrl = event.detail.value;
    }

    handleApiKeyChange(event) {
        this.apiKey = event.detail.value;
    }

    handleTemplateChange(event) {
        this.defaultTemplate = event.detail.value;
    }

    async handleTestConnection() {
        this.isTesting = true;
        this.connectionResult = null;

        try {
            const result = await testConnection();
            this.connectionResult = result.connected;
            this.connectionMessage = result.connected
                ? 'Connected to CoSeal successfully!'
                : 'Connection failed: ' + (result.error || 'Unknown error');
        } catch (error) {
            this.connectionResult = false;
            this.connectionMessage = error.body?.message || 'Failed to test connection.';
        } finally {
            this.isTesting = false;
        }
    }

    async handleSave() {
        if (!this.apiUrl || !this.apiKey) {
            this.dispatchEvent(new ShowToastEvent({
                title: 'Validation Error',
                message: 'API URL and API Key are required.',
                variant: 'error'
            }));
            return;
        }

        this.isSaving = true;
        this.saveMessage = '';

        try {
            await saveSettings({
                apiUrl: this.apiUrl,
                apiKey: this.apiKey,
                defaultTemplate: this.defaultTemplate
            });

            this.saveMessage = 'Settings saved successfully!';
            this.dispatchEvent(new ShowToastEvent({
                title: 'Saved',
                message: 'CoSeal settings saved.',
                variant: 'success'
            }));
        } catch (error) {
            this.dispatchEvent(new ShowToastEvent({
                title: 'Error',
                message: error.body?.message || 'Failed to save settings.',
                variant: 'error'
            }));
        } finally {
            this.isSaving = false;
        }
    }
}
