import { LightningElement, api, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import sendForSignature from '@salesforce/apex/CoSealEnvelopeController.sendForSignature';
import getTemplates from '@salesforce/apex/CoSealEnvelopeController.getTemplates';

export default class CosealSendButton extends LightningElement {
    @api recordId;
    @api objectApiName;

    isLoading = false;
    showModal = false;
    signerEmail = '';
    signerName = '';
    selectedTemplate = '';
    errorMessage = '';
    successMessage = '';
    templateOptions = [];

    connectedCallback() {
        this.loadTemplates();
    }

    async loadTemplates() {
        try {
            const templates = await getTemplates();
            this.templateOptions = templates.map(t => ({
                label: t.name,
                value: t.id
            }));
        } catch (error) {
            console.error('Failed to load templates:', error);
            this.templateOptions = [];
        }
    }

    handleOpenModal() {
        this.showModal = true;
        this.errorMessage = '';
        this.successMessage = '';
    }

    handleCloseModal() {
        this.showModal = false;
        this.resetForm();
    }

    handleTemplateChange(event) {
        this.selectedTemplate = event.detail.value;
    }

    handleEmailChange(event) {
        this.signerEmail = event.detail.value;
    }

    handleNameChange(event) {
        this.signerName = event.detail.value;
    }

    async handleSend() {
        // Validate inputs
        if (!this.selectedTemplate || !this.signerEmail || !this.signerName) {
            this.errorMessage = 'Please fill in all required fields.';
            return;
        }

        this.isLoading = true;
        this.errorMessage = '';

        try {
            const envelopeId = await sendForSignature({
                recordId: this.recordId,
                templateId: this.selectedTemplate,
                signerEmail: this.signerEmail,
                signerName: this.signerName
            });

            this.dispatchEvent(new ShowToastEvent({
                title: 'Success',
                message: 'Document sent for signature. Envelope ID: ' + envelopeId,
                variant: 'success'
            }));

            this.successMessage = 'Document sent successfully!';
            setTimeout(() => {
                this.showModal = false;
                this.resetForm();
            }, 2000);
        } catch (error) {
            this.errorMessage = error.body?.message || 'Failed to send document for signature.';
            this.dispatchEvent(new ShowToastEvent({
                title: 'Error',
                message: this.errorMessage,
                variant: 'error'
            }));
        } finally {
            this.isLoading = false;
        }
    }

    resetForm() {
        this.signerEmail = '';
        this.signerName = '';
        this.selectedTemplate = '';
        this.errorMessage = '';
        this.successMessage = '';
    }
}
