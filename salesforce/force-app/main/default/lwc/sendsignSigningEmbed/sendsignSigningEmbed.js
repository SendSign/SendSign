import { LightningElement, api } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getSigningUrl from '@salesforce/apex/SendSignEnvelopeController.getSigningUrl';

export default class CosealSigningEmbed extends LightningElement {
    @api recordId;
    @api envelopeId;
    @api signerEmail;

    signingUrl = '';
    isLoading = false;
    completedMessage = '';

    connectedCallback() {
        if (this.envelopeId && this.signerEmail) {
            this.loadSigningUrl();
        }

        // Listen for postMessage from the signing iframe
        window.addEventListener('message', this.handleMessage.bind(this));
    }

    disconnectedCallback() {
        window.removeEventListener('message', this.handleMessage.bind(this));
    }

    async loadSigningUrl() {
        this.isLoading = true;
        try {
            this.signingUrl = await getSigningUrl({
                envelopeId: this.envelopeId,
                signerEmail: this.signerEmail
            });
        } catch (error) {
            this.dispatchEvent(new ShowToastEvent({
                title: 'Error',
                message: error.body?.message || 'Failed to load signing interface.',
                variant: 'error'
            }));
        } finally {
            this.isLoading = false;
        }
    }

    handleMessage(event) {
        // Handle postMessage from SendSign signing iframe
        if (event.data && event.data.type === 'sendsign:signing-complete') {
            this.completedMessage = 'Document signed successfully!';
            this.signingUrl = ''; // Remove iframe

            this.dispatchEvent(new ShowToastEvent({
                title: 'Signed!',
                message: 'Document has been signed successfully.',
                variant: 'success'
            }));

            // Dispatch custom event to parent components
            this.dispatchEvent(new CustomEvent('signingcomplete', {
                detail: { envelopeId: this.envelopeId }
            }));
        } else if (event.data && event.data.type === 'sendsign:signing-declined') {
            this.completedMessage = '';
            this.signingUrl = '';

            this.dispatchEvent(new ShowToastEvent({
                title: 'Declined',
                message: 'Document signing was declined.',
                variant: 'warning'
            }));
        }
    }

    @api
    startSigning(envelopeId, signerEmail) {
        this.envelopeId = envelopeId;
        this.signerEmail = signerEmail;
        this.completedMessage = '';
        this.loadSigningUrl();
    }
}
