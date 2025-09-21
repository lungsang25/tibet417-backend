import axios from 'axios';
import crypto from 'crypto-js';
import qs from 'qs';

class PayrexxAPI {
    constructor(instance, apiSecret, environment = 'sandbox') {
        this.instance = instance;
        this.apiSecret = apiSecret;
        this.baseUrl = `https://api.payrexx.com/v1.0/Gateway/`;
    }

    // Generate API signature for authentication (Base64 encoded HMAC)
    generateSignature(queryString) {
        const hmac = crypto.HmacSHA256(queryString, this.apiSecret);
        return crypto.enc.Base64.stringify(hmac);
    }

    // Create a payment gateway
    async createGateway(gatewayData) {
        try {
            // Prepare data with required fields only
            const data = {
                instance: this.instance,
                amount: gatewayData.amount,
                currency: gatewayData.currency,
                successRedirectUrl: gatewayData.successRedirectUrl,
                failedRedirectUrl: gatewayData.failedRedirectUrl,
                cancelRedirectUrl: gatewayData.cancelRedirectUrl,
                // Optional fields
                ...(gatewayData.sku && { sku: gatewayData.sku }),
                ...(gatewayData.referenceId && { referenceId: gatewayData.referenceId }),
                ...(gatewayData.purpose && { purpose: gatewayData.purpose }),
                ...(gatewayData.psp && { psp: gatewayData.psp }),
                ...(gatewayData.preAuthorization !== undefined && { preAuthorization: gatewayData.preAuthorization }),
                ...(gatewayData.reservation !== undefined && { reservation: gatewayData.reservation }),
                ...(gatewayData.vatRate !== undefined && { vatRate: gatewayData.vatRate })
            };

            // Add fields if provided
            if (gatewayData.fields) {
                Object.keys(gatewayData.fields).forEach((key, index) => {
                    if (gatewayData.fields[key]) {
                        data[`fields[${key}]`] = gatewayData.fields[key];
                    }
                });
            }

            console.log('Payrexx Gateway Data:', data);

            // Create query string with RFC1738 format (required by Payrexx)
            const queryString = qs.stringify(data, { 
                format: 'RFC1738',
                sort: (a, b) => a.localeCompare(b)
            });
            
            console.log('Query String:', queryString);
            
            const signature = this.generateSignature(queryString);
            console.log('Signature:', signature);

            const response = await axios.post(this.baseUrl, queryString, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'ApiSignature': signature
                }
            });

            console.log('Payrexx Response:', response.data);
            return response.data;
        } catch (error) {
            console.error('Payrexx Gateway Creation Error:', error.response?.data || error.message);
            if (error.response?.data) {
                console.error('Full error response:', JSON.stringify(error.response.data, null, 2));
            }
            throw new Error('Failed to create Payrexx gateway');
        }
    }

    // Get gateway status
    async getGateway(gatewayId) {
        try {
            const data = {
                instance: this.instance
            };

            const queryString = qs.stringify(data, { format: 'RFC1738', sort: (a, b) => a.localeCompare(b) });
            const signature = this.generateSignature(queryString);

            const response = await axios.get(`${this.baseUrl}${gatewayId}`, {
                params: data,
                headers: {
                    'ApiSignature': signature
                }
            });

            return response.data;
        } catch (error) {
            console.error('Payrexx Gateway Retrieval Error:', error.response?.data || error.message);
            throw new Error('Failed to retrieve Payrexx gateway');
        }
    }

    // Verify webhook signature
    verifyWebhookSignature(body, signature) {
        const expectedSignature = this.generateSignature(body);
        return expectedSignature === signature;
    }
}

export default PayrexxAPI;
