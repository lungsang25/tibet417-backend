import dotenv from 'dotenv';
import PayrexxAPI from './utils/payrexx.js';

dotenv.config();

// Test Payrexx API connection
async function testPayrexx() {
    console.log('Testing Payrexx API connection...');
    console.log('PAYREXX_INSTANCE:', process.env.PAYREXX_INSTANCE);
    console.log('PAYREXX_API_SECRET exists:', !!process.env.PAYREXX_API_SECRET);
    console.log('PAYREXX_ENVIRONMENT:', process.env.PAYREXX_ENVIRONMENT);

    if (!process.env.PAYREXX_INSTANCE || !process.env.PAYREXX_API_SECRET) {
        console.error('Missing Payrexx environment variables!');
        return;
    }

    const payrexx = new PayrexxAPI(
        process.env.PAYREXX_INSTANCE,
        process.env.PAYREXX_API_SECRET,
        process.env.PAYREXX_ENVIRONMENT || 'sandbox'
    );

    // Test with minimal data
    const testData = {
        amount: 1000, // 10.00 CHF in cents
        currency: 'CHF',
        successRedirectUrl: 'https://example.com/success',
        failedRedirectUrl: 'https://example.com/failed',
        cancelRedirectUrl: 'https://example.com/cancel'
    };

    try {
        console.log('\n=== Testing with minimal required fields ===');
        const result = await payrexx.createGateway(testData);
        console.log('Success! Gateway created:', result);
        
        if (result.status === 'success' && result.data && result.data.length > 0) {
            console.log('Gateway ID:', result.data[0].id);
            console.log('Payment URL:', result.data[0].link);
        }
    } catch (error) {
        console.error('Test failed:', error.message);
        
        // Test with even more minimal data if first test fails
        console.log('\n=== Testing with absolute minimal fields ===');
        const minimalData = {
            amount: 100,
            currency: 'CHF'
        };
        
        try {
            const minimalResult = await payrexx.createGateway(minimalData);
            console.log('Minimal test success:', minimalResult);
        } catch (minimalError) {
            console.error('Minimal test also failed:', minimalError.message);
        }
    }
}

testPayrexx();
