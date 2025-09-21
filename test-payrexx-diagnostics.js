import dotenv from 'dotenv';
import PayrexxAPI from './utils/payrexx.js';

dotenv.config();

// Comprehensive Payrexx diagnostics
async function runDiagnostics() {
    console.log('🔍 PAYREXX INTEGRATION DIAGNOSTICS');
    console.log('=====================================\n');

    // Check environment variables
    console.log('1. Environment Variables:');
    console.log('   PAYREXX_INSTANCE:', process.env.PAYREXX_INSTANCE);
    console.log('   PAYREXX_API_SECRET exists:', !!process.env.PAYREXX_API_SECRET);
    console.log('   PAYREXX_ENVIRONMENT:', process.env.PAYREXX_ENVIRONMENT);
    console.log('   FRONTEND_URL:', process.env.FRONTEND_URL);

    if (!process.env.PAYREXX_INSTANCE || !process.env.PAYREXX_API_SECRET) {
        console.error('❌ Missing required environment variables!');
        return;
    }

    const payrexx = new PayrexxAPI(
        process.env.PAYREXX_INSTANCE,
        process.env.PAYREXX_API_SECRET,
        process.env.PAYREXX_ENVIRONMENT || 'sandbox'
    );

    // Test 1: Absolute minimal gateway (no PSP specified)
    console.log('\n2. Test 1 - Minimal Gateway (No PSP):');
    try {
        const minimalData = {
            amount: 100, // 1.00 CHF
            currency: 'CHF'
        };
        
        const result1 = await payrexx.createGateway(minimalData);
        console.log('✅ SUCCESS: Basic gateway creation works');
        console.log('   Gateway ID:', result1.data?.[0]?.id);
        console.log('   Payment URL:', result1.data?.[0]?.link);
    } catch (error) {
        console.log('❌ FAILED: Basic gateway creation failed');
        console.log('   Error:', error.message);
    }

    // Test 2: Gateway with redirect URLs
    console.log('\n3. Test 2 - Gateway with Redirect URLs:');
    try {
        const redirectData = {
            amount: 200,
            currency: 'CHF',
            successRedirectUrl: 'https://example.com/success',
            failedRedirectUrl: 'https://example.com/failed',
            cancelRedirectUrl: 'https://example.com/cancel'
        };
        
        const result2 = await payrexx.createGateway(redirectData);
        console.log('✅ SUCCESS: Gateway with redirects works');
        console.log('   Gateway ID:', result2.data?.[0]?.id);
    } catch (error) {
        console.log('❌ FAILED: Gateway with redirects failed');
        console.log('   Error:', error.message);
    }

    // Test 3: Gateway with Twint PSP (ID 17)
    console.log('\n4. Test 3 - Gateway with Twint PSP (ID 17):');
    try {
        const twintData = {
            amount: 300,
            currency: 'CHF',
            successRedirectUrl: 'https://example.com/success',
            failedRedirectUrl: 'https://example.com/failed',
            cancelRedirectUrl: 'https://example.com/cancel',
            psp: [17] // Twint PSP ID
        };
        
        const result3 = await payrexx.createGateway(twintData);
        console.log('✅ SUCCESS: Twint PSP (17) works');
        console.log('   Gateway ID:', result3.data?.[0]?.id);
    } catch (error) {
        console.log('❌ FAILED: Twint PSP (17) failed');
        console.log('   Error:', error.message);
    }

    // Test 4: Try different PSP IDs for Twint
    console.log('\n5. Test 4 - Testing Different PSP IDs:');
    const commonTwintPSPs = [1, 2, 3, 4, 5, 17, 18, 19, 20];
    
    for (const pspId of commonTwintPSPs) {
        try {
            const pspData = {
                amount: 100,
                currency: 'CHF',
                psp: [pspId]
            };
            
            const result = await payrexx.createGateway(pspData);
            console.log(`✅ PSP ID ${pspId}: SUCCESS`);
            break; // Stop on first success
        } catch (error) {
            console.log(`❌ PSP ID ${pspId}: FAILED`);
        }
    }

    console.log('\n📋 DIAGNOSTIC SUMMARY:');
    console.log('=====================================');
    console.log('If all tests failed:');
    console.log('  → Check API credentials in Payrexx dashboard');
    console.log('  → Verify API permissions for gateway creation');
    console.log('  → Ensure you\'re using the correct instance name');
    console.log('');
    console.log('If only Twint PSP tests failed:');
    console.log('  → Enable Twint in your Payrexx dashboard');
    console.log('  → Check the correct PSP ID for Twint in your setup');
    console.log('  → Verify Twint configuration is complete');
    console.log('');
    console.log('Next steps:');
    console.log('  1. Log into your Payrexx dashboard');
    console.log('  2. Go to Payment Providers → Check Twint status');
    console.log('  3. Note the correct PSP ID for Twint');
    console.log('  4. Set up webhook URL: your-domain/api/order/webhook/payrexx');
}

runDiagnostics();
