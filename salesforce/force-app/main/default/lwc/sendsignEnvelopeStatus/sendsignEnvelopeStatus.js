import { LightningElement, api } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getStatus from '@salesforce/apex/SendSignEnvelopeController.getStatus';
import sendReminder from '@salesforce/apex/SendSignEnvelopeController.sendReminder';
import voidEnvelope from '@salesforce/apex/SendSignEnvelopeController.voidEnvelope';
import downloadDocument from '@salesforce/apex/SendSignEnvelopeController.downloadDocument';

export default class CosealEnvelopeStatus extends LightningElement {
    @api recordId;
    @api envelopeId;

    isLoading = false;
    envelopeData = null;
    lastRefreshed = '';
    _pollInterval = null;

    get hasEnvelope() {
        return !!this.envelopeData;
    }

    get envelopeSubject() {
        return this.envelopeData?.subject || 'Untitled';
    }

    get currentStep() {
        return this.envelopeData?.status || 'draft';
    }

    get isCompleted() {
        return this.envelopeData?.status === 'completed';
    }

    get isError() {
        return this.envelopeData?.status === 'voided' || this.envelopeData?.status === 'declined';
    }

    get canVoid() {
        const status = this.envelopeData?.status;
        return status === 'sent' || status === 'in_progress';
    }

    get signers() {
        if (!this.envelopeData?.signers) return [];
        return this.envelopeData.signers.map(s => ({
            ...s,
            isCompleted: s.status === 'completed',
            isPending: s.status === 'pending' || s.status === 'notified',
            isDeclined: s.status === 'declined'
        }));
    }

    connectedCallback() {
        if (this.envelopeId) {
            this.refreshStatus();
            // Auto-refresh every 30 seconds
            this._pollInterval = setInterval(() => this.refreshStatus(), 30000);
        }
    }

    disconnectedCallback() {
        if (this._pollInterval) {
            clearInterval(this._pollInterval);
        }
    }

    async refreshStatus() {
        if (!this.envelopeId) return;

        this.isLoading = true;
        try {
            this.envelopeData = await getStatus({ envelopeId: this.envelopeId });
            this.lastRefreshed = new Date().toLocaleTimeString();

            // Stop polling if completed or voided
            if (this.envelopeData?.status === 'completed' ||
                this.envelopeData?.status === 'voided') {
                if (this._pollInterval) {
                    clearInterval(this._pollInterval);
                    this._pollInterval = null;
                }
            }
        } catch (error) {
            console.error('Failed to refresh status:', error);
        } finally {
            this.isLoading = false;
        }
    }

    async handleRemind(event) {
        const email = event.currentTarget.dataset.email;
        try {
            await sendReminder({
                envelopeId: this.envelopeId,
                signerEmail: email
            });

            this.dispatchEvent(new ShowToastEvent({
                title: 'Reminder Sent',
                message: `Signing reminder sent to ${email}`,
                variant: 'success'
            }));
        } catch (error) {
            this.dispatchEvent(new ShowToastEvent({
                title: 'Error',
                message: error.body?.message || 'Failed to send reminder.',
                variant: 'error'
            }));
        }
    }

    async handleVoid() {
        if (!confirm('Are you sure you want to void this envelope? This cannot be undone.')) {
            return;
        }

        try {
            await voidEnvelope({
                envelopeId: this.envelopeId,
                reason: 'Voided from Salesforce'
            });

            this.dispatchEvent(new ShowToastEvent({
                title: 'Voided',
                message: 'Envelope has been voided.',
                variant: 'warning'
            }));

            this.refreshStatus();
        } catch (error) {
            this.dispatchEvent(new ShowToastEvent({
                title: 'Error',
                message: error.body?.message || 'Failed to void envelope.',
                variant: 'error'
            }));
        }
    }

    async handleDownload() {
        try {
            const base64Data = await downloadDocument({
                envelopeId: this.envelopeId
            });

            // Convert base64 to blob and trigger download
            const byteCharacters = atob(base64Data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: 'application/pdf' });

            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `signed_${this.envelopeId}.pdf`;
            link.click();
        } catch (error) {
            this.dispatchEvent(new ShowToastEvent({
                title: 'Error',
                message: error.body?.message || 'Failed to download document.',
                variant: 'error'
            }));
        }
    }
}
