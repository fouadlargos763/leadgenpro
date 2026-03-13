const axios = require('axios');

async function check() {
    try {
        const loginRes = await axios.post('http://localhost:3000/api/auth/login', {
            email: 'fouad.mth23@gmail.com',
            password: 'fouad123'
        });
        const token = loginRes.data.token;
        console.log('Login successful.');

        const clientsRes = await axios.get('http://localhost:3000/api/all-clients', {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log('--- API RESPONSE ---');
        console.log('Clients Count:', clientsRes.data.clients.length);
        if (clientsRes.data.clients.length > 0) {
            console.log('First Lead:', clientsRes.data.clients[0].name);
        }
    } catch (err) {
        console.error('Error:', err.response ? err.response.data : err.message);
    }
}

check();
