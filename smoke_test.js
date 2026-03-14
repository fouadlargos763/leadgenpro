const axios = require('axios');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
let token = null;
let testUser = {
    name: 'Test Launch User',
    email: `test_launch_${Date.now()}@example.com`,
    password: 'password123'
};

async function runSmokeTest() {
    console.log('--- Starting System Smoke Test ---');

    try {
        // 1. Register
        console.log(`[1/6] Registering test user: ${testUser.email}...`);
        const regRes = await axios.post(`${BASE_URL}/api/auth/register`, testUser);
        if (regRes.status !== 201) throw new Error('Registration failed');
        console.log('   ✅ User registered.');

        // 2. Login
        console.log('[2/6] Logging in...');
        const logRes = await axios.post(`${BASE_URL}/api/auth/login`, {
            email: testUser.email,
            password: testUser.password
        });
        token = logRes.data.token;
        if (!token) throw new Error('No token returned');
        console.log('   ✅ Login successful.');

        const authHeader = { Authorization: `Bearer ${token}` };

        // 3. Check Subscription Details
        console.log('[3/6] Checking subscription/billing details...');
        const subRes = await axios.get(`${BASE_URL}/api/subscription/details`, { headers: authHeader });
        console.log(`   ✅ Plan: ${subRes.data.plan}, Status: ${subRes.data.status}`);

        // 4. Add Manual Client
        console.log('[4/6] Adding manual client...');
        const clientData = {
            name: 'Smoke Test Business',
            email: 'smoke@business.com',
            phone: '123-456-7890',
            website: 'https://smoketest.com',
            notes: 'Test client'
        };
        const addRes = await axios.post(`${BASE_URL}/api/leads/add`, clientData, { headers: authHeader });
        if (!addRes.data.success) throw new Error('Add client failed');
        console.log('   ✅ Manual client added.');

        // 5. List All Clients
        console.log('[5/6] Verifying client appears in list...');
        const listRes = await axios.get(`${BASE_URL}/api/all-clients`, { headers: authHeader });
        const found = listRes.data.clients.find(c => c.name === clientData.name);
        if (!found) throw new Error('Added client not found in list');
        console.log(`   ✅ Client list verified (${listRes.data.clients.length} clients found).`);

        // 6. Test Action (index.js trigger) - using 'mock' to be safe
        console.log('[6/6] Testing action trigger (Dry Run)...');
        const actionRes = await axios.post(`${BASE_URL}/api/action`, {
            action: 'mock'
        }, { headers: authHeader });
        if (actionRes.status !== 200) throw new Error('Action trigger failed');
        console.log('   ✅ Action trigger successful (Response contains streamed output).');

        console.log('\n--- SMOKE TEST COMPLETE: SYSTEM OPERATIONAL ---');
        process.exit(0);
    } catch (err) {
        console.error('\n❌ SMOKE TEST FAILED');
        if (err.response) {
            console.error(`Status: ${err.response.status}`);
            console.error('Data:', err.response.data);
        } else {
            console.error('Message:', err.message);
        }
        process.exit(1);
    }
}

// Check if server is up first
async function waitAndRun() {
    let attempts = 0;
    while (attempts < 5) {
        try {
            await axios.get(`${BASE_URL}/health`);
            return runSmokeTest();
        } catch (e) {
            attempts++;
            console.log(`Waiting for server... attempt ${attempts}`);
            await new Promise(r => setTimeout(r, 2000));
        }
    }
    console.error('Server failed to start in time.');
    process.exit(1);
}

waitAndRun();
